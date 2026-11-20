/**
 * `listCustomAgents` / `listAgentCapabilities` / `saveCustomAgent` — the agent's
 * side of the custom-agent contract (see `../agent/custom-agents.ts`).
 *
 * These exist because "build me an agent for code review" is a normal thing to
 * say in a conversation, and making the user open Settings → Custom Agents and
 * retype what they just described is exactly the kind of friction an assistant
 * is supposed to remove. The agents created here are ordinary records: they
 * appear in the picker at once (every surface subscribes to the same config
 * store) and the settings dialog can edit them afterwards.
 *
 * Three rules keep this safe and predictable:
 *
 * - **The directory is the source of truth.** A configured skill/tool name is
 *   validated against the live capability directory before it is stored.
 *   Storing a typo would produce an agent that silently loses part of its
 *   toolset, which is much harder to notice than a rejected call.
 * - **`skills`/`tools` are a restriction, not a grant.** Naming a skill the
 *   surface cannot run changes nothing; naming none yields a chat-only agent,
 *   which is a legitimate configuration.
 * - **Saving is not activating.** Creating an agent must not silently change who
 *   answers the user's next message; `activate: true` is the explicit opt-in.
 */

import { z } from 'zod'
import type { ToolsRecord } from '../types'
import {
    MAX_AGENT_INSTRUCTIONS_LENGTH,
    MAX_CUSTOM_AGENTS,
    customAgentCapabilities,
    readCustomAgentsConfig,
    resolveCustomAgentCapabilities,
    upsertCustomAgent,
    type CustomAgent,
} from '../agent/custom-agents'
import { getSkillToolSource } from '../skills/skill-tool-bridge'

/** Cap on names echoed back in a validation error (the rest is a count). */
const MAX_ECHOED_NAMES = 12
/** Cap on directory rows returned per call; `query` narrows, `total` says the rest. */
const MAX_SKILL_ROWS = 60
const MAX_TOOL_ROWS = 80
/**
 * Guidance is echoed back for editing, but a 20k-char prompt times 50 agents
 * would crowd out the conversation: the list sends a generous preview and says
 * when it cut. An update can omit `instructions` to keep the original.
 */
const MAX_VIEW_INSTRUCTIONS = 4000

/** The live directory, when a capability surface has registered one. */
function liveDirectory() {
    const source = getSkillToolSource()
    if (!source?.directory) return null
    try {
        return source.directory()
    } catch {
        return null
    }
}

/** Compact agent view: what a picker shows, plus whether it restricts capabilities. */
function toAgentView(agent: CustomAgent) {
    const caps = customAgentCapabilities(agent)
    const truncated = agent.instructions.length > MAX_VIEW_INSTRUCTIONS
    return {
        id: agent.id,
        name: agent.name,
        description: agent.description ?? '',
        avatar: agent.avatar ?? '',
        instructions: truncated
            ? agent.instructions.slice(0, MAX_VIEW_INSTRUCTIONS)
            : agent.instructions,
        ...(truncated ? { instructionsTruncated: true } : {}),
        capabilities: caps
            ? { mode: caps.mode, skills: caps.skills, tools: caps.tools }
            : { mode: 'all' as const, skills: [] as string[], tools: [] as string[] },
        updatedAt: new Date(agent.updatedAt).toISOString(),
    }
}

/** "a、b、c（+5）" — an error message must stay readable when it is long. */
function echoNames(names: readonly string[]): string {
    const shown = names.slice(0, MAX_ECHOED_NAMES)
    return names.length > shown.length
        ? `${shown.join('、')}（+${names.length - shown.length}）`
        : shown.join('、')
}

function uniqueNames(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of value) {
        if (typeof raw !== 'string') continue
        const name = raw.trim()
        if (!name || seen.has(name)) continue
        seen.add(name)
        out.push(name)
    }
    return out
}

export const createCustomAgentTools = (_editor?: unknown): ToolsRecord => ({
    listCustomAgents: {
        description:
            '列出用户的自定义 Agent（人格 + 可用技能/工具），以及当前正在使用的那一个。'
            + '在用户问"我有哪些 Agent / 现在用的是谁 / 帮我改一下那个审稿 Agent"时先调用它，拿到 id 再改。',
        inputSchema: z.object({}),
        readOnly: true,
        execute: async () => {
            const { agents, selectedAgentId } = await readCustomAgentsConfig()
            return {
                agents: agents.map(toAgentView),
                selectedAgentId,
                total: agents.length,
                hint: agents.length === 0
                    ? '还没有自定义 Agent。用户想建一个时，用 saveCustomAgent 创建（名称 + 指引必需，skills/tools 可选）。'
                    : '要修改某个 Agent 就把它的 id 传给 saveCustomAgent。',
            }
        },
    },

    listAgentCapabilities: {
        description:
            '列出当前环境可用的技能（skill）与工具（tool）名称和用途，用来给自定义 Agent 配置能力（saveCustomAgent 的 skills/tools）。'
            + '结果按名称截断，可用 query 过滤；返回里的 total 是完整数量。',
        inputSchema: z.object({
            kind: z
                .enum(['skills', 'tools', 'all'])
                .optional()
                .describe('可选。只列技能、只列工具，或都列（默认 all）。'),
            query: z
                .string()
                .optional()
                .describe('可选。按名称或说明过滤，例如「表格」「bitable」「页面」。'),
        }),
        readOnly: true,
        execute: async (args: { kind?: 'skills' | 'tools' | 'all'; query?: string }) => {
            const directory = liveDirectory()
            if (!directory) {
                return {
                    error: '当前会话没有可用的能力目录（能力提供者未就绪）。',
                    hint: '可以不传 skills/tools 直接创建 Agent（默认拥有全部能力），或让用户在「设置 → 自定义 Agent」里手动配置。',
                }
            }
            const kind = args?.kind ?? 'all'
            const query = (args?.query ?? '').trim().toLowerCase()
            const matches = (name: string, description: string) =>
                !query || name.toLowerCase().includes(query) || description.toLowerCase().includes(query)

            const skills = (kind === 'tools'
                ? []
                : directory.skills
                    .filter(skill => matches(skill.name, skill.description))
                    .map(skill => ({
                        name: skill.name,
                        description: skill.description,
                        source: skill.source,
                        tools: skill.tools,
                    })))
            const tools = (kind === 'skills'
                ? []
                : directory.tools
                    .filter(tool => matches(tool.name, tool.description))
                    .map(tool => ({
                        name: tool.name,
                        description: tool.description,
                        readOnly: tool.readOnly,
                    })))

            return {
                skills: skills.slice(0, MAX_SKILL_ROWS),
                skillsTotal: skills.length,
                tools: tools.slice(0, MAX_TOOL_ROWS),
                toolsTotal: tools.length,
                truncated: skills.length > MAX_SKILL_ROWS || tools.length > MAX_TOOL_ROWS,
                hint: '把技能名放进 skills、工具名放进 tools；技能会自动带上它声明的工具。'
                    + '只想给它一个技能时工具可以留空；还要读写文档的话，再把 readChunk / getDocumentStructure / searchInDocument / write 这类基础工具列进 tools。',
            }
        },
    },

    saveCustomAgent: {
        description:
            '创建或更新一个用户自定义 Agent（名称 + 工作指引 + 可选的技能/工具白名单）。'
            + '用户说"帮我建一个 XX Agent / 做一个只读的审稿助手"时用它：先问清名称和它该怎么工作（必要时用 listAgentCapabilities 选能力），再调用。'
            + '不传 id = 新建；传 id = 修改。skills/tools 不传时：新建默认拥有全部能力，修改则保持原配置不变。'
            + '注意：只列技能时，这个 Agent 就只有这些技能自带的工具；如果它还要读写页面，把 readChunk / getDocumentStructure / searchInDocument / write 等基础工具也列进 tools。'
            + 'saveCustomAgent 不会自动切换当前 Agent，除非 activate: true。',
        inputSchema: z.object({
            id: z.string().optional().describe('可选。要修改的 Agent id（来自 listCustomAgents）；省略表示新建。'),
            name: z.string().describe('Agent 名称，例如「严谨的审稿人」。'),
            description: z.string().optional().describe('可选。一句话说明它擅长什么，显示在选择器里。'),
            avatar: z
                .string()
                .optional()
                .describe('可选。职业头像 id，例如 engineer / doctor / teacher / developer / lawyer / scientist / chef / business / designer / pilot / security / farmer。'),
            instructions: z
                .string()
                .optional()
                .describe('工作指引：这个 Agent 的身份、工作方式、输出要求。新建时必填；修改时省略表示保留原指引不变。'),
            skills: z.array(z.string()).optional().describe('可选。启用的技能名（来自 listAgentCapabilities）。'),
            tools: z.array(z.string()).optional().describe('可选。额外启用的工具名；技能自带的工具不用重复列。'),
            capabilitiesMode: z
                .enum(['all', 'custom'])
                .optional()
                .describe('可选。all = 拥有全部能力（会清空白名单）；custom = 只有 skills/tools 列出的能力。传了 skills/tools 默认 custom。'),
            activate: z.boolean().optional().describe('可选。保存后切换到这个 Agent（默认 false）。'),
        }),
        readOnly: false,
        execute: async (args: {
            id?: string
            name?: string
            description?: string
            avatar?: string
            instructions?: string
            skills?: string[]
            tools?: string[]
            capabilitiesMode?: 'all' | 'custom'
            activate?: boolean
        }) => {
            const name = (args?.name ?? '').trim()
            const instructions = (args?.instructions ?? '').trim()
            if (!name) {
                return { error: '缺少 Agent 名称。', hint: '先和用户确认一个名字（2-20 个字即可），再重试。' }
            }
            if (instructions.length > MAX_AGENT_INSTRUCTIONS_LENGTH) {
                return { error: `指引过长（上限 ${MAX_AGENT_INSTRUCTIONS_LENGTH} 字符）。` }
            }

            const { agents } = await readCustomAgentsConfig()
            const existing = args?.id ? agents.find(agent => agent.id === args.id) : undefined
            if (args?.id && !existing) {
                return {
                    error: `找不到 id 为 "${args.id}" 的自定义 Agent。`,
                    hint: '用 listCustomAgents 拿最新列表；要新建就不要传 id。',
                }
            }
            if (!existing && agents.length >= MAX_CUSTOM_AGENTS) {
                return { error: `自定义 Agent 已达上限（${MAX_CUSTOM_AGENTS} 个）。`, hint: '请用户先删除一个不用的 Agent。' }
            }

            // Guidance may be omitted ONLY when keeping an existing one: a new
            // agent without guidance is a nameless persona, not an agent.
            const finalInstructions = instructions || existing?.instructions || ''
            if (!finalInstructions) {
                return {
                    error: '缺少 Agent 指引（instructions）。',
                    hint: '指引是这个 Agent 的工作方式；不确定时按用户描述写 3-6 条要点，再请用户确认或微调。',
                }
            }

            const directory = liveDirectory()
            let skills = uniqueNames(args?.skills)
            const tools = uniqueNames(args?.tools)
            let warning: string | undefined

            // Validate what THIS call sends against the live directory, and store
            // the canonical spelling. Rejecting a typo beats storing one: the
            // agent would otherwise lose that capability with nothing to point
            // at. Names inherited from the existing agent are NOT re-validated —
            // an uninstalled skill must not make the agent uneditable.
            if (directory) {
                if (skills) {
                    const canonical = new Map(directory.skills.map(skill => [skill.name.toLowerCase(), skill.name]))
                    const unknown = skills.filter(name => !canonical.has(name.toLowerCase()))
                    if (unknown.length > 0) {
                        return {
                            error: `未知技能：${echoNames(unknown)}`,
                            hint: '先用 listAgentCapabilities 查可用技能名，再重试；也可以只写技能名，让它声明的工具自动带上。',
                            knownSkills: directory.skills.slice(0, 24).map(skill => skill.name),
                        }
                    }
                    skills = skills.map(name => canonical.get(name.toLowerCase()) ?? name)
                }
                if (tools) {
                    const known = new Set(directory.tools.map(tool => tool.name))
                    const unknown = tools.filter(name => !known.has(name))
                    if (unknown.length > 0) {
                        return {
                            error: `未知工具：${echoNames(unknown)}`,
                            hint: '先用 listAgentCapabilities 查可用工具名；技能自带的工具不用逐个列，勾上技能即可。',
                        }
                    }
                }
            } else if ((skills && skills.length > 0) || (tools && tools.length > 0)) {
                warning = '能力目录未就绪，skills/tools 按传入的名字原样保存，可能包含当前环境不存在的项。'
            }

            // Keep-on-update / clear-on-all semantics live in the pure helper so
            // the dialog and this tool cannot drift apart.
            const nextCapabilities = resolveCustomAgentCapabilities(
                customAgentCapabilities(existing),
                { skills, tools, mode: args?.capabilitiesMode },
            )

            const agent = await upsertCustomAgent({
                id: existing?.id,
                name,
                description: args?.description,
                avatar: args?.avatar,
                instructions: finalInstructions,
                capabilities: nextCapabilities,
                activate: args?.activate === true,
            })

            const caps = customAgentCapabilities(agent)
            // A skills-only agent is a real trap: it gets the skill's tools but no
            // page reading/writing. Say it out loud instead of letting the user
            // discover it in a conversation where the agent "cannot open the page".
            const skillsOnly = !!caps && caps.skills.length > 0 && caps.tools.length === 0
            return {
                ok: true,
                agent: toAgentView(agent),
                activated: args?.activate === true,
                ...(warning ? { warning } : {}),
                ...(skillsOnly
                    ? {
                        note: '这个 Agent 只能用技能自带的工具，没有文档读写能力。'
                            + '如果它要读页面内容，再把 readChunk / getDocumentStructure / searchInDocument（写：write / replaceContent）加进 tools 后保存一次。',
                    }
                    : {}),
                hint: caps
                    ? `已保存。该 Agent 只启用 ${caps.skills.length} 个技能、${caps.tools.length} 个工具（技能自带的工具会自动包含）。`
                    : '已保存。该 Agent 拥有当前环境的全部能力。',
                next: args?.activate === true
                    ? '后续对话会使用这个 Agent。'
                    : '它还没有被切换为当前 Agent；用户可以在对话的选择器里选它，或让你用 activate: true 再保存一次。',
            }
        },
    },
})