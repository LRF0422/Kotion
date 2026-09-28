/**
 * Migration bridge: `editorExtension[].tools / .skills` → contribution-level
 * `agent.tools / agent.skills`.
 *
 * Every in-tree plugin now declares its tools/skills on its own `agent`
 * contribution, so the kernel no longer aggregates editor-extension tools. What
 * remains is the conversion itself: {@link liftLegacyTools} /
 * {@link liftLegacySkills}, used by a plugin whose factories still come from
 * Tiptap extensions — the lifted definitions carry the scope and the editor
 * guard explicitly.
 *
 * Legacy tools come from Tiptap extensions, so the DEFAULT is `page` scope with
 * an eager editor guard: a factory that really needs the document must not be
 * registered where there is none (that produced the
 * "Cannot read properties of undefined (reading 'state')" failures). A group
 * declared `any`/`workspace` is editor-OPTIONAL instead, so a connector like
 * zhihu can answer a workspace-scope run without a live document — its
 * factories already ignore the editor they are handed.
 *
 * @deprecated Author `AgentToolDefinition` directly for new capabilities.
 */

import { normalizeAgentScopes } from './types'
import type { ExtensionWrapper } from '../../core/editor'
import type {
    AgentScope,
    AgentSkillDefinition,
    AgentToolDefinition,
} from './types'

export interface LiftLegacyOptions {
    /**
     * Run scope this group is valid in. Defaults to `page`. Pass the narrowest
     * scope that is actually true — it also decides `requiresEditor`.
     */
    scope?: AgentScope | AgentScope[]
    /**
     * Pass `false` to keep the bare name on the wire — only useful when
     * reproducing the retired legacy path (the model may already know a bare
     * name). Omit to namespace, which is what new declarations want.
     */
    namespace?: boolean
    /**
     * Whether these tools need a live editor. Defaults from `scope`: `page`-only
     * means editor-bound (refuse to instantiate without one); anything covering
     * `any`/`workspace` means editor-optional. Set it explicitly for the rare
     * editor-bound tool that still lives in a scope-wide group — without it,
     * such a tool silently fails at call time instead.
     */
    requiresEditor?: boolean
}

/** Convert one legacy tool factory into an agent tool definition. */
function liftLegacyTool(
    tool: NonNullable<ExtensionWrapper['tools']>[number],
    options: LiftLegacyOptions,
): AgentToolDefinition {
    const scope = options.scope ?? 'page'
    const scopes = normalizeAgentScopes(scope)
    const requiresEditor = options.requiresEditor
        ?? (scopes.includes('page') && !scopes.includes('any'))
    return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        readOnly: tool.readOnly,
        scope,
        ...(options.namespace === undefined ? {} : { namespace: options.namespace }),
        artifactFromResult: tool.artifactFromResult,
        // Call the legacy factory EAGERLY. Guard the editor explicitly: most
        // legacy factories only CLOSE OVER the editor and return a
        // working-looking executor, so without this check an editor-less scope
        // would register tools that fail at call time.
        create: (ctx) => {
            if (requiresEditor && !ctx.editor) {
                throw new Error(`Tool ${tool.name} requires a live editor`)
            }
            const executor = (tool.execute as any)(ctx.editor)
            return (params: any, callId?: string, execCtx?: any) =>
                typeof executor === 'function' ? executor(params, callId, execCtx) : executor
        },
    }
}

/**
 * Lift legacy editor-extension tools into agent-contract tool definitions —
 * the migration bridge used by plugins moving into `agent.agents[]`.
 */
export function liftLegacyTools(
    tools: ExtensionWrapper['tools'],
    options: LiftLegacyOptions = {},
): AgentToolDefinition[] {
    return (tools ?? [])
        .filter(tool => !!tool && !!tool.name)
        .map(tool => liftLegacyTool(tool, options))
}

/** Normalize legacy skills — they already match {@link AgentSkillDefinition}. */
export function liftLegacySkills(
    skills: ExtensionWrapper['skills'],
): AgentSkillDefinition[] {
    return (skills ?? [])
        .filter(skill => !!skill && !!skill.name)
        .map<AgentSkillDefinition>(skill => ({
            name: skill.name,
            description: skill.description,
            requiredTools: skill.requiredTools ?? [],
            optionalTools: skill.optionalTools,
            systemPromptFragment: skill.systemPromptFragment,
            tags: skill.tags,
        }))
}
