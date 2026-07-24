import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"

/**
 * Find every occurrence of `text` in the doc, returning absolute from/to.
 * Used by replaceRange self-healing when positions have gone stale.
 */
const findTextOccurrences = (editor: Editor, text: string): Array<{ from: number; to: number }> => {
    const matches: Array<{ from: number; to: number }> = []
    editor.state.doc.descendants((node, pos) => {
        if (!node.isTextblock) return true
        const nodeText = node.textContent
        let searchIndex = 0
        while (searchIndex < nodeText.length) {
            const index = nodeText.indexOf(text, searchIndex)
            if (index === -1) break
            const from = pos + 1 + index
            matches.push({ from, to: from + text.length })
            searchIndex = index + 1
        }
        return true
    })
    return matches
}

/**
 * Create range-based precision editing tools for AI agent
 */
export const createRangeTools = (editor: Editor): ToolsRecord => ({
    replaceRange: {
        description: '在精确位置范围内替换文本。先用 searchInDocument 查找精确位置，再用此工具替换。强烈建议传入 expectedText：若位置已因其他编辑失效，会自动重新定位该文本后替换',
        inputSchema: z.object({
            from: z.number().describe("替换范围起始位置"),
            to: z.number().describe("替换范围结束位置"),
            content: z.string().describe("替换成的新内容"),
            expectedText: z.string().optional().describe("预期在 from-to 位置的原文本，用于校验位置是否仍有效，失效时自动重新定位")
        }),
        execute: async ({ from, to, content, expectedText }: {
            from: number
            to: number
            content: string
            expectedText?: string
        }) => {
            try {
                const docSize = editor.state.doc.content.size
                let relocated = false

                if (from < 0 || from > docSize) {
                    return { error: `起始位置 ${from} 超出文档范围（0-${docSize}）` }
                }
                if (to < 0 || to > docSize) {
                    return { error: `结束位置 ${to} 超出文档范围（0-${docSize}）` }
                }
                if (from >= to) {
                    return { error: `起始位置 ${from} 必须小于结束位置 ${to}` }
                }

                // Self-heal: verify the range still holds the expected text,
                // otherwise re-locate it (positions go stale after any edit).
                if (expectedText) {
                    const actualText = editor.state.doc.textBetween(from, to)
                    if (actualText !== expectedText) {
                        const occurrences = findTextOccurrences(editor, expectedText)
                        if (occurrences.length === 0) {
                            return {
                                error: `位置 ${from}-${to} 的实际文本是 "${actualText}"，与预期的 "${expectedText}" 不符，且文档中已找不到该文本。请重新读取文档`
                            }
                        }
                        if (occurrences.length > 1) {
                            return {
                                error: `位置已失效，且 "${expectedText}" 在文档中出现 ${occurrences.length} 次，无法自动重定位。请用 searchInDocument 获取最新位置`,
                                occurrences
                            }
                        }
                        from = occurrences[0].from
                        to = occurrences[0].to
                        relocated = true
                    }
                }

                // Extract old text before replacement
                const oldText = editor.state.doc.textBetween(from, to)

                const success = editor.chain()
                    .focus()
                    .setTextSelection({ from, to })
                    .insertContent(content)
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: '替换失败' }
                }

                return {
                    success: true,
                    oldText,
                    newContent: content,
                    from,
                    to,
                    ...(relocated ? { relocated: true } : {}),
                    message: `已将位置 ${from}-${to} 的文本 "${oldText}" 替换为 "${content}"${relocated ? '（原位置已失效，已自动重新定位）' : ''}`
                }
            } catch (error) {
                return { error: `替换失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    formatRange: {
        description: '在精确位置范围内应用或移除内联格式。先用 searchInDocument 查找位置。marks 对象中: true=应用格式, false=移除格式，未指定的格式不变',
        inputSchema: z.object({
            from: z.number().describe("格式化范围起始位置"),
            to: z.number().describe("格式化范围结束位置"),
            marks: z.object({
                bold: z.boolean().optional().describe("加粗: true 应用, false 移除"),
                italic: z.boolean().optional().describe("斜体: true 应用, false 移除"),
                underline: z.boolean().optional().describe("下划线: true 应用, false 移除"),
                strike: z.boolean().optional().describe("删除线: true 应用, false 移除"),
                code: z.boolean().optional().describe("行内代码: true 应用, false 移除")
            }).describe("要应用或移除的格式")
        }),
        execute: async ({ from, to, marks }: {
            from: number
            to: number
            marks: {
                bold?: boolean
                italic?: boolean
                underline?: boolean
                strike?: boolean
                code?: boolean
            }
        }) => {
            try {
                const docSize = editor.state.doc.content.size

                if (from < 0 || from > docSize) {
                    return { error: `起始位置 ${from} 超出文档范围（0-${docSize}）` }
                }
                if (to < 0 || to > docSize) {
                    return { error: `结束位置 ${to} 超出文档范围（0-${docSize}）` }
                }
                if (from >= to) {
                    return { error: `起始位置 ${from} 必须小于结束位置 ${to}` }
                }

                // Select the range first
                editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run()

                const applied: string[] = []
                const removed: string[] = []

                // Apply or remove each mark
                const markActions: Array<{ key: string; value: boolean | undefined; toggle: () => boolean; unset: () => boolean }> = [
                    { key: 'bold', value: marks.bold, toggle: () => editor.commands.toggleBold(), unset: () => editor.commands.toggleBold() },
                    { key: 'italic', value: marks.italic, toggle: () => editor.commands.toggleItalic(), unset: () => editor.commands.toggleItalic() },
                    { key: 'underline', value: marks.underline, toggle: () => editor.commands.toggleUnderline(), unset: () => editor.commands.toggleUnderline() },
                    { key: 'strike', value: marks.strike, toggle: () => editor.commands.toggleStrike(), unset: () => editor.commands.toggleStrike() },
                    { key: 'code', value: marks.code, toggle: () => editor.commands.toggleCode(), unset: () => editor.commands.toggleCode() },
                ]

                for (const action of markActions) {
                    if (action.value === true) {
                        // Check if mark is already active to avoid toggling off
                        const isActive = editor.isActive(action.key)
                        if (!isActive) {
                            action.toggle()
                        }
                        applied.push(action.key)
                    } else if (action.value === false) {
                        // Check if mark is active so we can remove it
                        const isActive = editor.isActive(action.key)
                        if (isActive) {
                            action.unset()
                        }
                        removed.push(action.key)
                    }
                }

                if (applied.length === 0 && removed.length === 0) {
                    return { error: '未指定任何格式操作' }
                }

                const text = editor.state.doc.textBetween(from, to)

                return {
                    success: true,
                    text,
                    from,
                    to,
                    applied,
                    removed,
                    message: `已对位置 ${from}-${to} 的文本${applied.length > 0 ? ` 应用 [${applied.join(', ')}]` : ''}${removed.length > 0 ? ` 移除 [${removed.join(', ')}]` : ''}`
                }
            } catch (error) {
                return { error: `格式化失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
