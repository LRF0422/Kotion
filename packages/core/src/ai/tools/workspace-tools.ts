/**
 * Editor-free ("workspace") agent tool implementations.
 *
 * Decision M3: the *implementation* lives in core (it owns SpacePageService),
 * while the *declaration* lives with plugin-main (\`agent.include\`). Core only
 * registers here — nothing reaches the agent until a plugin declares it, so
 * "install plugin-main → the agent gains workspace powers" stays literally true.
 *
 * These reuse the existing page-tools record with a null editor: every tool in
 * this family resolves its target through \`getPageNavigationBridge()\` +
 * session binding, so an editor instance is optional.
 */

import { z } from '@kn/ui'
import { openAgentArtifact } from '@kn/common'
import type { AgentArtifact, AgentToolImplementation } from '@kn/common'
import { createPageTools } from './page-tools'

/** Page tools that need no live editor. Exposed by name to plugin-main. */
const WORKSPACE_PAGE_TOOLS = [
    'searchPages',
    'createPage',
    'listSpaces',
    'getSpacePageTree',
    'openPage',
] as const

/** Map a successful createPage result to a renderable artifact. */
export function pageArtifactFromResult(result: unknown): AgentArtifact | null {
    const value = (result ?? {}) as {
        success?: boolean
        pageId?: unknown
        title?: unknown
        spaceId?: unknown
        placement?: unknown
    }
    if (value.success === false || value.pageId === undefined || value.pageId === null) return null
    return {
        kind: 'page',
        id: String(value.pageId),
        title: typeof value.title === 'string' ? value.title : undefined,
        spaceId: value.spaceId === undefined || value.spaceId === null ? undefined : String(value.spaceId),
        subtitle: typeof value.placement === 'string' ? value.placement : undefined,
    }
}

/** Block-level content search — the workspace counterpart to searchPages. */
const searchContent: AgentToolImplementation = {
    name: 'searchContent',
    description: '按关键词搜索知识库的页面正文内容（跨空间），返回命中的块文本、所属页面与空间。用于查找具体信息，而不是页面标题（标题用 searchPages）',
    inputSchema: z.object({
        query: z.string().describe('搜索关键词'),
        limit: z.number().optional().describe('返回条数，默认 20'),
    }),
    readOnly: true,
    scope: 'any',
    create: (ctx) => async (params: { query: string; limit?: number }) => {
        const service = ctx.resolveService('spacePageService')
        if (!service?.relations?.searchBlocks) return { error: '知识库检索服务不可用' }
        try {
            const records = await service.relations.searchBlocks({ keyword: params.query })
            const limit = typeof params.limit === 'number' && params.limit > 0 ? params.limit : 20
            return {
                success: true,
                keyword: params.query,
                count: records.length,
                blocks: records.slice(0, limit).map((record: any) => ({
                    pageId: String(record.pageId),
                    pageTitle: record.pageTitle,
                    spaceId: record.spaceId === undefined ? undefined : String(record.spaceId),
                    spaceName: record.spaceName,
                    text: record.text,
                })),
            }
        } catch (error) {
            return { error: `内容检索失败: ${error instanceof Error ? error.message : '未知错误'}` }
        }
    },
}

/**
 * Open a page in the host's side pane (side peek) WITHOUT navigating away.
 *
 * This is the "proactive" counterpart to `openPage`: the agent decides to show
 * the user a page beside the conversation. It reuses the kernel's imperative
 * pane opener, so it works on any surface that mounted an AgentPaneProvider.
 */
const openPageSide: AgentToolImplementation = {
    name: 'openPageSide',
    description: '在当前界面右侧的预览分栏（side peek）里打开指定页面，不离开对话。适合把调研结果、参考资料或刚创建的页面展示给用户看；用户想跳转去编辑时改用 openPage',
    inputSchema: z.object({
        pageId: z.string().describe('要打开的页面 id'),
        title: z.string().optional().describe('页面标题（用于分栏标题，可选）'),
        spaceId: z.string().optional().describe('页面所属空间 id（可选）'),
    }),
    readOnly: true,
    scope: 'any',
    artifactFromResult: pageArtifactFromResult,
    create: () => async (params: { pageId: string; title?: string; spaceId?: string }) => {
        if (!params?.pageId) return { success: false, error: 'pageId 不能为空' }
        const opened = openAgentArtifact({
            kind: 'page',
            id: String(params.pageId),
            title: params.title,
            spaceId: params.spaceId ? String(params.spaceId) : undefined,
        })
        if (!opened) {
            return { success: false, error: '当前界面没有可用的侧边预览（宿主未挂载分栏）' }
        }
        return {
            success: true,
            opened: true,
            pageId: String(params.pageId),
            title: params.title,
            spaceId: params.spaceId,
        }
    },
}

/**
 * Set ANY artifact as the working target (kind-agnostic). `openPageSide` is the
 * friendlier shorthand for pages; this one is how the agent switches between
 * mixed artifacts (pages, source lists, later spreadsheets/charts).
 */
const focusArtifact: AgentToolImplementation = {
    name: 'focusArtifact',
    description: '把某个产物设为当前工作目标并在右侧预览分栏展示（不离开对话）。用于在多个产物之间切换目标；页面也可以直接用 openPageSide',
    inputSchema: z.object({
        kind: z.string().describe('产物类型，如 page、source-list'),
        id: z.string().describe('产物 id'),
        title: z.string().optional().describe('产物标题（可选）'),
        spaceId: z.string().optional().describe('所属空间 id（可选）'),
    }),
    readOnly: true,
    scope: 'any',
    create: () => async (params: { kind: string; id: string; title?: string; spaceId?: string }) => {
        if (!params?.kind || !params?.id) return { success: false, error: 'kind 与 id 不能为空' }
        const opened = openAgentArtifact({
            kind: String(params.kind),
            id: String(params.id),
            title: params.title,
            spaceId: params.spaceId ? String(params.spaceId) : undefined,
        })
        if (!opened) return { success: false, error: '当前界面没有可用的侧边预览（宿主未挂载分栏）' }
        return { success: true, focused: true, kind: String(params.kind), id: String(params.id) }
    },
}

/**
 * Build the workspace implementations core registers at startup.
 *
 * `createPage` gets a personal-space fallback so the workspace agent can create
 * a page without knowing a spaceId, and always runs with `bindToSession: false`
 * (there is no editor to bind).
 */
export function createWorkspaceToolImplementations(): AgentToolImplementation[] {
    const pageTools = createPageTools(null as any) as Record<string, any>

    const implementations: AgentToolImplementation[] = WORKSPACE_PAGE_TOOLS.flatMap((id) => {
        const tool = pageTools[id]
        if (!tool?.execute) return []
        return [{
            name: id,
            description: tool.description,
            inputSchema: tool.inputSchema,
            readOnly: Boolean(tool.readOnly),
            scope: 'any' as const,
            artifactFromResult: id === 'createPage' ? pageArtifactFromResult : undefined,
            create: (ctx) => {
                if (id !== 'createPage') return tool.execute
                return async (params: any, callId?: string, execCtx?: any) => {
                    const args: any = { ...(params ?? {}), bindToSession: false }
                    if (!args.spaceId) {
                        try {
                            const service = ctx.resolveService('spacePageService')
                            const personal = await service?.spaces?.getPersonalSpace?.()
                            if (personal?.id) args.spaceId = String(personal.id)
                        } catch {
                            /* fall through: createPage reports the missing space */
                        }
                    }
                    return tool.execute(args, callId, execCtx)
                }
            },
        }]
    })

    implementations.push(searchContent)
    implementations.push(openPageSide)
    implementations.push(focusArtifact)
    return implementations
}
