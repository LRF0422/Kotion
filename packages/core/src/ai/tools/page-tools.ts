import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import { getPageBridge } from "@kn/common"
import { discoverBlocks, findBlockByText } from "@kn/common"

const BRIDGE_MISSING = '页面服务不可用（当前可能不在页面编辑器中）'

/**
 * Create page-level tools for the AI agent.
 *
 * These operate ACROSS pages (search / create / link / navigate) via the
 * PageBridge registered by the page editor, extending the agent beyond the
 * currently open document.
 */
export const createPageTools = (editor: Editor): ToolsRecord => ({
    searchPages: {
        description: '按关键词搜索知识库中的页面（跨空间）。返回页面 id、标题和所属空间，可用于插入页面链接或跳转',
        inputSchema: z.object({
            query: z.string().optional().describe("搜索关键词，不填则返回最近的页面")
        }),
        execute: async ({ query }: { query?: string }) => {
            const bridge = getPageBridge()
            if (!bridge) return { error: BRIDGE_MISSING }

            try {
                const pages = await bridge.searchPages(query)
                const current = bridge.getCurrentPage()
                return {
                    success: true,
                    pages: pages.map(p => ({
                        pageId: String(p.id),
                        title: p.title,
                        spaceId: p.spaceId !== undefined ? String(p.spaceId) : undefined,
                        spaceName: p.spaceName,
                        isCurrent: current.pageId !== undefined && String(p.id) === String(current.pageId)
                    })),
                    total: pages.length,
                    currentPageId: current.pageId
                }
            } catch (error) {
                return { error: `搜索页面失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    createPage: {
        description: '在当前空间创建一个新页面。asSubPage 为 true 时创建为当前页面的子页面。创建后可用 insertPageLink 在当前文档中插入指向它的链接',
        inputSchema: z.object({
            title: z.string().describe("新页面的标题"),
            asSubPage: z.boolean().optional().describe("是否创建为当前页面的子页面，默认 false"),
            linkInDocument: z.boolean().optional().describe("是否同时在当前文档末尾插入指向新页面的链接，默认 false")
        }),
        execute: async ({ title, asSubPage = false, linkInDocument = false }: {
            title: string
            asSubPage?: boolean
            linkInDocument?: boolean
        }) => {
            const bridge = getPageBridge()
            if (!bridge) return { error: BRIDGE_MISSING }

            if (!title || title.trim().length === 0) {
                return { error: '页面标题不能为空' }
            }

            const current = bridge.getCurrentPage()
            if (!current.spaceId) {
                return { error: '无法确定当前空间，无法创建页面' }
            }

            try {
                const page = await bridge.createPage({
                    spaceId: current.spaceId,
                    title: title.trim(),
                    parentId: asSubPage ? current.pageId : undefined
                })

                let linked = false
                if (linkInDocument && editor.schema.nodes.pageLinkNode) {
                    const endPos = editor.state.doc.content.size
                    // setPageLink is declared by the block-reference plugin, which
                    // core doesn't depend on — invoke it dynamically.
                    linked = (editor.chain()
                        .setTextSelection(endPos) as any)
                        .setPageLink({ pageId: String(page.id), title: title.trim() })
                        .run()
                }

                return {
                    success: true,
                    pageId: String(page.id),
                    title: title.trim(),
                    spaceId: current.spaceId,
                    parentId: asSubPage ? current.pageId : undefined,
                    linkedInDocument: linked,
                    message: `已创建${asSubPage ? '子' : ''}页面 "${title.trim()}"${linked ? ' 并在文档末尾插入链接' : ''}`
                }
            } catch (error) {
                return { error: `创建页面失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    insertPageLink: {
        description: '在当前文档中插入指向另一个页面的双向链接（[[页面]] 链接）。先用 searchPages 找到目标页面的 pageId 和标题。可用 nearText 定位插入位置，不填则插入到文档末尾',
        inputSchema: z.object({
            pageId: z.string().describe("目标页面的 pageId（从 searchPages 或 createPage 获取）"),
            title: z.string().describe("目标页面的标题（用于显示）"),
            nearText: z.string().optional().describe("在包含此文本的块内末尾插入链接，不填则插入到文档末尾")
        }),
        execute: async ({ pageId, title, nearText }: {
            pageId: string
            title: string
            nearText?: string
        }) => {
            if (!editor.schema.nodes.pageLinkNode) {
                return { error: '当前编辑器不支持页面链接（pageLinkNode 扩展未加载）' }
            }

            try {
                let insertPos = editor.state.doc.content.size
                let anchor = '文档末尾'

                if (nearText) {
                    const blocks = discoverBlocks(editor)
                    const found = findBlockByText(blocks, nearText)
                    if (!found) {
                        return { error: `未找到包含 "${nearText}" 的块` }
                    }
                    insertPos = found.contentEnd
                    anchor = `"${found.text}" 所在块的末尾`
                }

                // setPageLink comes from the block-reference plugin's command
                // augmentation — not visible to core's typings, so cast.
                const success = (editor.chain()
                    .setTextSelection(insertPos) as any)
                    .setPageLink({ pageId: String(pageId), title })
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: '插入页面链接失败' }
                }

                return {
                    success: true,
                    pageId: String(pageId),
                    title,
                    insertedAt: insertPos,
                    message: `已在${anchor}插入指向 "${title}" 的页面链接`
                }
            } catch (error) {
                return { error: `插入页面链接失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    openPage: {
        description: '跳转到指定页面（会离开当前页面，未保存的编辑会自动保存）。先用 searchPages 找到目标页面',
        inputSchema: z.object({
            pageId: z.string().describe("要打开的页面 pageId"),
            spaceId: z.string().optional().describe("页面所属空间 id（searchPages 结果中有），不填则自动解析")
        }),
        execute: async ({ pageId, spaceId }: { pageId: string; spaceId?: string }) => {
            const bridge = getPageBridge()
            if (!bridge) return { error: BRIDGE_MISSING }

            try {
                await bridge.openPage(String(pageId), spaceId)
                return {
                    success: true,
                    pageId: String(pageId),
                    message: `已跳转到页面 ${pageId}`
                }
            } catch (error) {
                return { error: `打开页面失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
