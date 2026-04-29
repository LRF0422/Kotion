import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import { findTextPosition } from "@kn/common"
import { scrollToPosition } from "@kn/common"

/**
 * Create link management tools for AI agent
 */
export const createLinkTools = (editor: Editor): ToolsRecord => ({
    insertLink: {
        description: '搜索文档中的文本并为其添加超链接。当文本出现多次时，使用 matchIndex 指定具体匹配项',
        inputSchema: z.object({
            searchText: z.string().describe("要添加链接的文本内容"),
            href: z.string().describe("链接地址（URL）"),
            matchIndex: z.number().optional()
                .describe("第几次出现的匹配项（从1开始，默认1）")
        }),
        execute: async ({ searchText, href, matchIndex = 1 }: {
            searchText: string
            href: string
            matchIndex?: number
        }) => {
            if (!searchText || searchText.trim().length === 0) {
                return { error: '搜索文本不能为空' }
            }

            if (!href || href.trim().length === 0) {
                return { error: '链接地址不能为空' }
            }

            try {
                const pos = findTextPosition(editor, searchText, matchIndex)
                if (!pos) {
                    return { error: `未找到文本: "${searchText}"${matchIndex > 1 ? `（第${matchIndex}次出现）` : ''}` }
                }

                const success = editor.chain()
                    .focus()
                    .setTextSelection({ from: pos.from, to: pos.to })
                    .setLink({ href })
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: '添加链接失败' }
                }

                scrollToPosition(editor, pos.from)

                return {
                    success: true,
                    text: pos.text,
                    href,
                    from: pos.from,
                    to: pos.to,
                    message: `已为文本 "${pos.text}" 添加链接: ${href}`
                }
            } catch (error) {
                return { error: `添加链接失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    removeLink: {
        description: '搜索文档中的文本并移除其超链接',
        inputSchema: z.object({
            searchText: z.string().describe("要移除链接的文本内容"),
            matchIndex: z.number().optional()
                .describe("第几次出现的匹配项（从1开始，默认1）")
        }),
        execute: async ({ searchText, matchIndex = 1 }: {
            searchText: string
            matchIndex?: number
        }) => {
            if (!searchText || searchText.trim().length === 0) {
                return { error: '搜索文本不能为空' }
            }

            try {
                const pos = findTextPosition(editor, searchText, matchIndex)
                if (!pos) {
                    return { error: `未找到文本: "${searchText}"${matchIndex > 1 ? `（第${matchIndex}次出现）` : ''}` }
                }

                const success = editor.chain()
                    .focus()
                    .setTextSelection({ from: pos.from, to: pos.to })
                    .unsetLink()
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: '移除链接失败' }
                }

                return {
                    success: true,
                    text: pos.text,
                    from: pos.from,
                    to: pos.to,
                    message: `已移除文本 "${pos.text}" 的链接`
                }
            } catch (error) {
                return { error: `移除链接失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
