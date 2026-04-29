import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"

/**
 * Create range-based precision editing tools for AI agent
 */
export const createRangeTools = (editor: Editor): ToolsRecord => ({
    replaceRange: {
        description: '在精确位置范围内替换文本。先用 searchInDocument 查找精确位置，再用此工具替换指定位置的内容。适用于同一文本多次出现时的精确编辑',
        inputSchema: z.object({
            from: z.number().describe("替换范围起始位置"),
            to: z.number().describe("替换范围结束位置"),
            content: z.string().describe("替换成的新内容")
        }),
        execute: async ({ from, to, content }: {
            from: number
            to: number
            content: string
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
                    message: `已将位置 ${from}-${to} 的文本 "${oldText}" 替换为 "${content}"`
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
