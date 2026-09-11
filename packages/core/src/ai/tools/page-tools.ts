import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import {
    getPageNavigationBridge,
    getSessionPageBinding,
    resolveService,
} from "@kn/common"
import { discoverBlocks, findBlockByText } from "@kn/common"
import {
    flattenPageTree,
    formatPageTree,
    resolveCreatePlacement,
    toPageId,
    type CreatePosition,
} from "./page-tree"

const BRIDGE_MISSING = '页面服务不可用（当前可能不在页面编辑器中）'

/** The page the agent is working on: the off-screen edit target wins over the open page. */
interface ActivePageContext {
    pageId?: string
    spaceId?: string
    title?: string
    parentId?: string
}

const resolveActivePage = (): ActivePageContext => {
    const bound = getSessionPageBinding()?.getBoundPage()
    if (bound?.pageId) {
        return {
            pageId: toPageId(bound.pageId) ?? undefined,
            spaceId: bound.spaceId,
            title: bound.title,
        }
    }
    const current = getPageNavigationBridge()?.getCurrentPage()
    return {
        pageId: current?.pageId === undefined ? undefined : String(current.pageId),
        spaceId: current?.spaceId === undefined ? undefined : String(current.spaceId),
        title: current?.title,
        parentId: current?.parentId === undefined || current.parentId === null
            ? undefined
            : String(current.parentId),
    }
}

const readMetadata = async (pageId: string) =>
    resolveService('spacePageService').pages.getPageMetadata(pageId)

/** Insert a [[page]] link into a specific editor instance. */
const insertPageLinkInto = (
    editorInstance: Editor | null | undefined,
    pageId: string,
    title: string,
    nearText?: string,
): { success: boolean; insertPos?: number; anchor?: string; error?: string } => {
    if (!editorInstance) return { success: false, error: '没有可用的编辑器' }
    if (!editorInstance.schema.nodes.pageLinkNode) {
        return { success: false, error: '当前编辑器不支持页面链接（pageLinkNode 扩展未加载）' }
    }
    let insertPos = editorInstance.state.doc.content.size
    let anchor = '文档末尾'
    if (nearText) {
        const blocks = discoverBlocks(editorInstance)
        const found = findBlockByText(blocks, nearText)
        if (!found) return { success: false, error: `未找到包含 "${nearText}" 的块` }
        insertPos = found.contentEnd
        anchor = `"${found.text}" 所在块的末尾`
    }
    // setPageLink is declared by the block-reference plugin, which core does not
    // depend on — invoke it dynamically.
    const ok = (editorInstance.chain().setTextSelection(insertPos) as any)
        .setPageLink({ pageId: String(pageId), title })
        .scrollIntoView()
        .run()
    return ok ? { success: true, insertPos, anchor } : { success: false, error: '插入页面链接失败' }
}

/**
 * Create page-level tools for the AI agent.
 *
 * These operate ACROSS pages:
 *  - tree reads/mutations (getSpacePageTree / createPage / renamePage / movePage / deletePage)
 *    go through SpacePageService and need no editor at all;
 *  - editPage switches the conversation's off-screen edit target so every
 *    document tool can then edit that page without navigating the user away.
 */
export const createPageTools = (editor: Editor): ToolsRecord => ({
    listSpaces: {
        description: '列出当前用户可访问的空间（知识库），返回 spaceId、名称和是否为当前空间。用于确定要操作的页面树属于哪个空间',
        readOnly: true,
        inputSchema: z.object({
            keyword: z.string().optional().describe("按名称过滤空间，不填则返回全部")
        }),
        execute: async ({ keyword }: { keyword?: string }) => {
            try {
                const result = await resolveService('spacePageService').spaces.querySpaces(
                    keyword ? { keyword } : undefined
                )
                const active = resolveActivePage()
                return {
                    success: true,
                    currentSpaceId: active.spaceId,
                    spaces: result.records.map((space) => ({
                        spaceId: String(space.id),
                        name: space.name,
                        isCurrent: active.spaceId !== undefined && String(space.id) === active.spaceId,
                    })),
                }
            } catch (error) {
                return { error: `列出空间失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    getSpacePageTree: {
        description: '获取某个空间的完整页面树（层级、父子关系、标题、pageId）。默认使用当前空间。配合 createPage(relativeTo/parentId)、movePage、editPage 操作任意页面',
        readOnly: true,
        inputSchema: z.object({
            spaceId: z.string().optional().describe("空间 id，不填则使用当前空间"),
            searchValue: z.string().optional().describe("按标题过滤，返回匹配页面"),
            maxNodes: z.number().optional().describe("最多返回多少个节点，默认 200")
        }),
        execute: async ({ spaceId, searchValue, maxNodes }: { spaceId?: string; searchValue?: string; maxNodes?: number }) => {
            const active = resolveActivePage()
            const resolvedSpaceId = toPageId(spaceId) ?? active.spaceId
            if (!resolvedSpaceId) {
                return { error: '无法确定空间，请传入 spaceId（可先用 listSpaces 查询）' }
            }
            try {
                const tree = await resolveService('spacePageService').pages.getPageTree({
                    spaceId: resolvedSpaceId,
                    ...(searchValue ? { searchValue } : {}),
                })
                const flat = flattenPageTree(tree)
                const limit = typeof maxNodes === 'number' && maxNodes > 0 ? Math.floor(maxNodes) : 200
                const formatted = formatPageTree(flat, { maxNodes: limit })
                return {
                    success: true,
                    spaceId: resolvedSpaceId,
                    total: flat.length,
                    pages: flat.slice(0, limit),
                    treeText: formatted.text,
                    truncated: formatted.truncated,
                }
            } catch (error) {
                return { error: `获取页面树失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    searchPages: {
        description: '按关键词搜索知识库中的页面（跨空间）。返回页面 id、标题和所属空间，可用于插入页面链接或跳转',
        readOnly: true,
        inputSchema: z.object({
            query: z.string().optional().describe("搜索关键词，不填则返回最近的页面")
        }),
        execute: async ({ query }: { query?: string }) => {
            try {
                const result = await resolveService('spacePageService').pages.queryPages({
                    searchValue: query,
                    pageSize: 30,
                })
                const current = resolveActivePage()
                return {
                    success: true,
                    pages: result.records.map((page) => ({
                        pageId: String(page.id),
                        title: page.title,
                        spaceId: page.spaceId,
                        spaceName: page.spaceName,
                        parentId: page.parentId == null ? null : String(page.parentId),
                        isCurrent: current.pageId !== undefined && String(page.id) === current.pageId
                    })),
                    total: result.records.length,
                    currentPageId: current.pageId
                }
            } catch (error) {
                return { error: `搜索页面失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    createPage: {
        description: '创建新页面，可指定空间与位置：作为某个页面(relativeTo)的子页面(position=child)、同级页面(position=sibling)，或直接用 parentId 指定父页面（parentId=null 表示空间根层级）。默认创建在当前空间。创建后可选择把新页面设为离屏编辑目标(bindToSession，默认 true)并/或在锚点页面插入链接(linkInDocument)',
        inputSchema: z.object({
            title: z.string().describe("新页面的标题"),
            spaceId: z.string().optional().describe("目标空间 id，不填则使用当前空间"),
            parentId: z.string().nullable().optional().describe("显式父页面 id；null 表示根层级。优先级最高"),
            relativeTo: z.string().optional().describe("相对哪个页面创建（配合 position 使用）"),
            position: z.enum(['child', 'sibling', 'root']).optional().describe("相对位置：child 子页面 / sibling 同级页面 / root 根层级。默认 child"),
            asSubPage: z.boolean().optional().describe("(兼容) 是否创建为当前页面的子页面，默认 false"),
            linkInDocument: z.boolean().optional().describe("是否在锚点页面插入指向新页面的链接，默认 false"),
            bindToSession: z.boolean().optional().describe("是否把新页面设为本会话的离屏编辑目标，默认 true")
        }),
        execute: async ({ title, spaceId, parentId, relativeTo, position, asSubPage = false, linkInDocument = false, bindToSession = true }: {
            title: string
            spaceId?: string
            parentId?: string | null
            relativeTo?: string
            position?: CreatePosition
            asSubPage?: boolean
            linkInDocument?: boolean
            bindToSession?: boolean
        }) => {
            if (!title || title.trim().length === 0) {
                return { error: '页面标题不能为空' }
            }
            const active = resolveActivePage()
            const resolvedSpaceId = toPageId(spaceId) ?? active.spaceId
            if (!resolvedSpaceId) {
                return { error: '无法确定当前空间，无法创建页面；请传入 spaceId' }
            }

            const service = resolveService('spacePageService')
            const relativeToId = toPageId(relativeTo)
            const explicitParent = parentId === undefined ? undefined : toPageId(parentId)

            // Sibling placement needs the reference page's parent.
            let relativeParentId: string | null | undefined
            if (position === 'sibling') {
                if (!relativeToId) {
                    return { error: 'position=sibling 需要同时提供 relativeTo（要与之同级的页面）' }
                }
                try {
                    const meta = await readMetadata(relativeToId)
                    relativeParentId = meta.parentId == null ? null : String(meta.parentId)
                } catch (error) {
                    return { error: `无法读取页面 ${relativeToId} 的父页面: ${error instanceof Error ? error.message : '未知错误'}` }
                }
            }

            const placement = resolveCreatePlacement({
                position,
                relativeTo: relativeToId,
                parentId: explicitParent,
                asSubPage,
                currentPageId: active.pageId ?? null,
                relativeParentId,
            })

            try {
                const page = await service.pages.createPage({
                    spaceId: resolvedSpaceId,
                    title: title.trim(),
                    parentId: placement.parentId,
                })
                const created = {
                    pageId: String(page.id),
                    title: page.title || title.trim(),
                    spaceId: page.spaceId ? String(page.spaceId) : resolvedSpaceId,
                    parentId: page.parentId == null ? placement.parentId : String(page.parentId),
                }

                // Where a link should land: the parent for a child, the reference
                // page for a sibling, otherwise the active page.
                const anchorPageId = (position === 'sibling' ? relativeToId : placement.parentId)
                    ?? active.pageId
                    ?? undefined

                let linked = false
                let linkAnchor: string | undefined
                let linkError: string | undefined
                if (linkInDocument && anchorPageId) {
                    const anchorEditor = await resolveEditorForPage(editor, anchorPageId, active.pageId)
                    if (anchorEditor.editor) {
                        const result = insertPageLinkInto(anchorEditor.editor, created.pageId, created.title)
                        linked = result.success
                        linkAnchor = result.anchor
                        linkError = result.error
                    } else {
                        linkError = anchorEditor.error
                    }
                }

                // Bind the new page to the active conversation (off-screen edit
                // target) so document tools keep working without navigation.
                let boundToSession = false
                let bindError: string | undefined
                if (bindToSession) {
                    const bound = await resolveEditorForPage(editor, created.pageId, active.pageId)
                    // Only claim the page became the edit target when the switch
                    // actually happened (hosts without the binding cannot).
                    boundToSession = bound.switched
                    bindError = bound.error
                }

                return {
                    success: true,
                    ...created,
                    placement: placement.description,
                    linkedInDocument: linked,
                    linkAnchor,
                    linkError,
                    boundToSession,
                    bindError,
                    message: [
                        `已创建页面 "${created.title}"（${placement.description}）`,
                        boundToSession ? '，已将其设为本会话的编辑目标；后续文档工具会直接编辑该页面' : '',
                        linked ? '。已同时在锚点页面插入链接' : '',
                        linkError ? `。插入链接失败: ${linkError}` : '',
                        bindError ? `。设为编辑目标失败: ${bindError}` : '',
                    ].join(''),
                }
            } catch (error) {
                return { error: `创建页面失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    renamePage: {
        description: '重命名任意页面（修改标题），不离开当前页面',
        inputSchema: z.object({
            pageId: z.string().describe("要重命名的页面 id"),
            title: z.string().describe("新标题")
        }),
        execute: async ({ pageId, title }: { pageId: string; title: string }) => {
            const id = toPageId(pageId)
            if (!id) return { error: 'pageId 不能为空' }
            if (!title || !title.trim()) return { error: '标题不能为空' }
            try {
                await resolveService('spacePageService').pages.updatePageTitle({ pageId: id, title: title.trim() })
                return { success: true, pageId: id, title: title.trim(), message: `已重命名为 "${title.trim()}"` }
            } catch (error) {
                return { error: `重命名失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    movePage: {
        description: '移动页面到新的父页面或空间根层级（调整页面树结构）。不传 targetParentId 保持当前父页面；targetParentId=null 移到根层级。可跨空间移动（传 targetSpaceId）',
        inputSchema: z.object({
            pageId: z.string().describe("要移动的页面 id"),
            targetParentId: z.string().nullable().optional().describe("目标父页面 id；null 表示根层级；不填保持原父页面"),
            targetSpaceId: z.string().optional().describe("目标空间 id，不填则用页面当前空间")
        }),
        execute: async ({ pageId, targetParentId, targetSpaceId }: {
            pageId: string
            targetParentId?: string | null
            targetSpaceId?: string
        }) => {
            const id = toPageId(pageId)
            if (!id) return { error: 'pageId 不能为空' }
            try {
                const meta = await readMetadata(id)
                const spaceId = toPageId(targetSpaceId) ?? (meta.spaceId == null ? undefined : String(meta.spaceId))
                if (!spaceId) return { error: '无法确定目标空间，请传入 targetSpaceId' }
                const parentId = targetParentId === undefined
                    ? (meta.parentId == null ? null : String(meta.parentId))
                    : toPageId(targetParentId)
                if (id === parentId) return { error: '不能把页面移动到它自己下面' }
                await resolveService('spacePageService').pages.movePage({
                    pageId: id,
                    targetParentId: parentId,
                    targetSpaceId: spaceId,
                })
                return {
                    success: true,
                    pageId: id,
                    targetParentId: parentId,
                    targetSpaceId: spaceId,
                    message: parentId ? `已移动到页面 ${parentId} 下` : '已移动到空间根层级',
                }
            } catch (error) {
                return { error: `移动页面失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    deletePage: {
        description: '删除页面（移入回收站，可恢复）。删除后可用 restorePage 恢复',
        inputSchema: z.object({
            pageId: z.string().describe("要删除的页面 id")
        }),
        execute: async ({ pageId }: { pageId: string }) => {
            const id = toPageId(pageId)
            if (!id) return { error: 'pageId 不能为空' }
            try {
                await resolveService('spacePageService').pages.movePageToTrash(id)
                return { success: true, pageId: id, message: `页面 ${id} 已移入回收站（可用 restorePage 恢复）` }
            } catch (error) {
                return { error: `删除页面失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    restorePage: {
        description: '从回收站恢复页面',
        inputSchema: z.object({
            pageId: z.string().describe("要恢复的页面 id")
        }),
        execute: async ({ pageId }: { pageId: string }) => {
            const id = toPageId(pageId)
            if (!id) return { error: 'pageId 不能为空' }
            try {
                await resolveService('spacePageService').pages.restorePageFromTrash(id)
                return { success: true, pageId: id, message: `已从回收站恢复页面 ${id}` }
            } catch (error) {
                return { error: `恢复页面失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    editPage: {
        description: '把本会话的离屏编辑目标切换到指定页面：不离开用户当前页面，即可用文档工具（getDocumentStructure/applyEdits/replaceBlockById 等）读取和编辑该页面。要编辑任何不是当前目标的页面前，必须先调用它。切换后所有文档工具都作用于该页面，直到再次调用 editPage',
        inputSchema: z.object({
            pageId: z.string().describe("要离屏编辑的页面 id（可用 getSpacePageTree/searchPages 获取）")
        }),
        execute: async ({ pageId }: { pageId: string }) => {
            const id = toPageId(pageId)
            if (!id) return { error: 'pageId 不能为空' }

            let title: string | undefined
            let spaceId: string | undefined
            try {
                const meta = await readMetadata(id)
                title = meta.title
                spaceId = meta.spaceId == null ? undefined : String(meta.spaceId)
            } catch (error) {
                return { error: `无法读取页面 ${id}: ${error instanceof Error ? error.message : '未知错误'}` }
            }

            const binding = getSessionPageBinding()
            if (binding?.editPage) {
                try {
                    const target = await binding.editPage({ pageId: id, title, spaceId })
                    return {
                        success: true,
                        pageId: id,
                        title: target.title ?? title,
                        spaceId: target.spaceId ?? spaceId,
                        message: `已切换到页面 "${target.title ?? title ?? id}"，现在可以直接用文档工具编辑它`,
                    }
                } catch (error) {
                    return { error: `切换编辑目标失败: ${error instanceof Error ? error.message : '未知错误'}` }
                }
            }

            // Fallback for hosts without the off-screen bridge: at least bind the
            // page so createPage/openPage keep steering the conversation.
            if (binding) {
                binding.bindPage({ pageId: id, title, spaceId })
                return {
                    success: true,
                    pageId: id,
                    title,
                    spaceId,
                    message: '已记录编辑目标，但当前环境不支持离屏编辑，文档工具可能仍作用于当前页面',
                }
            }
            return { error: BRIDGE_MISSING }
        }
    },

    insertPageLink: {
        description: '在指定页面（默认当前编辑目标）的文档中插入指向另一个页面的双向链接（[[页面]]）。先用 searchPages/getSpacePageTree 找到目标页面。可用 nearText 定位插入位置，不填则插入到文档末尾',
        inputSchema: z.object({
            pageId: z.string().describe("目标页面 pageId（从 searchPages 或 createPage 获取）"),
            title: z.string().describe("目标页面的标题（用于显示）"),
            inPageId: z.string().optional().describe("要插入链接的页面 id，默认当前编辑目标"),
            nearText: z.string().optional().describe("在包含此文本的块内末尾插入链接，不填则插入到文档末尾")
        }),
        execute: async ({ pageId, title, inPageId, nearText }: {
            pageId: string
            title: string
            inPageId?: string
            nearText?: string
        }) => {
            const target = toPageId(pageId)
            if (!target) return { error: 'pageId 不能为空' }
            const active = resolveActivePage()
            const hostPageId = toPageId(inPageId) ?? active.pageId
            const resolved = await resolveEditorForPage(editor, hostPageId, active.pageId)
            if (!resolved.editor) {
                return { error: resolved.error ?? '没有可用的编辑器' }
            }
            const result = insertPageLinkInto(resolved.editor, target, title, nearText)
            if (!result.success) return { error: result.error }
            return {
                success: true,
                pageId: target,
                title,
                inPageId: hostPageId,
                insertedAt: result.insertPos,
                message: `已在${resolved.switched ? '页面 ' + hostPageId : '当前文档'}的${result.anchor}插入指向 "${title}" 的页面链接`,
            }
        }
    },

    openPage: {
        description: '在用户界面中打开指定页面（会离开当前页面，未保存的编辑会自动保存）。仅当用户明确要求跳转时使用；要离屏编辑页面请改用 editPage',
        inputSchema: z.object({
            pageId: z.string().describe("要打开的页面 pageId"),
            spaceId: z.string().optional().describe("页面所属空间 id（searchPages 结果中有），不填则自动解析")
        }),
        execute: async ({ pageId, spaceId }: { pageId: string; spaceId?: string }) => {
            const navigation = getPageNavigationBridge()
            if (!navigation) return { error: BRIDGE_MISSING }

            const target = String(pageId)
            // A page already being edited by this conversation opens in the
            // floating window — navigating away would drop the chat's context.
            const binding = getSessionPageBinding()
            if (binding && binding.getBoundPage()?.pageId === target) {
                binding.openPageWindow(target)
                return {
                    success: true,
                    pageId: target,
                    openedInWindow: true,
                    message: `页面 ${target} 已是本会话的编辑目标，已在浮动编辑窗口中打开`
                }
            }

            try {
                await navigation.openPage(target, spaceId)
                return {
                    success: true,
                    pageId: target,
                    message: `已跳转到页面 ${target}`
                }
            } catch (error) {
                return { error: `打开页面失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})

/**
 * Obtain an editor bound to `pageId` for a tool-internal cross-page action.
 *
 * When the page is already the active target (or the open page), the tool's own
 * editor is used and nothing is switched. Otherwise the conversation's
 * off-screen edit target is switched through the binding and the returned
 * editor is used directly — the tool's closure editor is stale for that page.
 */
const resolveEditorForPage = async (
    currentEditor: Editor,
    pageId: string | undefined,
    activePageId: string | undefined,
): Promise<{ editor: Editor | null; switched: boolean; error?: string }> => {
    if (!pageId) return { editor: currentEditor, switched: false }
    if (activePageId && String(activePageId) === String(pageId)) {
        return { editor: currentEditor, switched: false }
    }
    const binding = getSessionPageBinding()
    if (binding?.editPage) {
        try {
            const target = await binding.editPage({ pageId: String(pageId) })
            return { editor: target.editor as Editor, switched: true }
        } catch (error) {
            return {
                editor: null,
                switched: false,
                error: `无法切换到页面 ${pageId}: ${error instanceof Error ? error.message : '未知错误'}`,
            }
        }
    }
    return { editor: currentEditor, switched: false }
}
