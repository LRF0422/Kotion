import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { BlockInfo, ToolsRecord } from "@kn/common"
import {
    discoverBlocks,
    ensureBlockBoundary,
    findBlockByText,
    scrollToPosition,
} from "@kn/common"

/**
 * Math / formula tools for the AI agent.
 *
 * The editor already ships `KnowledgeMathExtension` (KaTeX), whose node is
 * `inlineMath` with attrs { latex, evaluate, display }. `display: "yes"`
 * renders a block (centered, displayMode) formula, `"no"` an inline one.
 * These tools let the agent author/review formulas through the document tools
 * instead of writing raw `$...$` text and hoping the input rule fires.
 */

/** Strip surrounding math delimiters the model may include anyway. */
function stripMathDelimiters(input: string): string {
    let latex = (input ?? "").trim()
    if (latex.startsWith("$$") && latex.endsWith("$$") && latex.length > 4) {
        latex = latex.slice(2, -2)
    } else if (latex.startsWith("\\[") && latex.endsWith("\\]") && latex.length > 4) {
        latex = latex.slice(2, -2)
    } else if (latex.startsWith("\\(") && latex.endsWith("\\)") && latex.length > 4) {
        latex = latex.slice(2, -2)
    } else if (latex.startsWith("$") && latex.endsWith("$") && latex.length > 2) {
        latex = latex.slice(1, -1)
    }
    return latex.trim()
}

/** Every `inlineMath` node in document order, with its position. */
function findMathNodes(editor: Editor): Array<{ node: any; pos: number }> {
    const nodes: Array<{ node: any; pos: number }> = []
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "inlineMath") {
            nodes.push({ node, pos })
        }
        return true
    })
    return nodes
}

const describeError = (error: unknown): string =>
    error instanceof Error ? error.message : "未知错误"

export const createMathTools = (editor: Editor): ToolsRecord => ({
    insertMath: {
        description:
            "插入数学公式（LaTeX / KaTeX 渲染）。display=inline 为行内公式（与文字混排），display=block 为独占一行的块级公式。"
            + "请传入纯 LaTeX 源码，不要带 $ / $$ 分隔符。适合数学、物理、统计、算法等含公式的写作场景。",
        inputSchema: z.object({
            latex: z.string().describe(
                "LaTeX 公式源码，例如 \"E = mc^2\"、\"\\frac{a}{b}\"、\"\\sum_{i=1}^{n} i\"（不要包含 $、$$、\\\\( \\\\) 等分隔符）"
            ),
            display: z.enum(["inline", "block"]).optional()
                .describe("inline=行内公式（默认），block=块级公式"),
            blockIndex: z.number().optional()
                .describe("定位到该块（从0开始）：行内公式追加到该块末尾，块级公式插入到该块之后。不填则对文档末尾操作"),
            nearText: z.string().optional()
                .describe("定位到包含此文本的块，优先级高于 blockIndex"),
        }),
        execute: async ({ latex, display = "inline", blockIndex, nearText }: {
            latex: string
            display?: "inline" | "block"
            blockIndex?: number
            nearText?: string
        }) => {
            try {
                if (!editor.schema.nodes.inlineMath) {
                    return { error: "当前编辑器未启用公式（math）扩展，无法插入公式" }
                }

                const source = stripMathDelimiters(latex)
                if (!source) {
                    return { error: "公式 LaTeX 内容不能为空" }
                }

                const isBlock = display === "block"
                const attrs = { latex: source, evaluate: "no", display: isBlock ? "yes" : "no" }

                const blocks = discoverBlocks(editor)
                let target: BlockInfo | null = null
                if (nearText) {
                    target = findBlockByText(blocks, nearText)
                    if (!target) return { error: `未找到包含 "${nearText}" 的块` }
                } else if (blockIndex !== undefined) {
                    if (blockIndex < 0 || blockIndex >= blocks.length) {
                        return { error: `块索引 ${blockIndex} 超出范围（共 ${blocks.length} 块）` }
                    }
                    target = blocks[blockIndex]
                }

                const docSize = editor.state.doc.nodeSize
                const targetNode = target ? editor.state.doc.nodeAt(target.pos) : null

                let insertPos: number
                let content: any
                let strategy: string

                if (!isBlock && target && targetNode?.isTextblock) {
                    // Inline formula: append at the end of the target text block.
                    insertPos = Math.min(target.contentEnd, docSize - 2)
                    content = { type: "inlineMath", attrs }
                    strategy = "inline-append"
                } else {
                    // Block formula (or inline without a text-block target):
                    // insert a paragraph that carries the formula.
                    const rawPos = target ? target.pos + target.size : editor.state.doc.content.size
                    insertPos = ensureBlockBoundary(editor, rawPos, "paragraph")
                    content = { type: "paragraph", content: [{ type: "inlineMath", attrs }] }
                    strategy = isBlock ? "block" : "inline-paragraph"
                }

                insertPos = Math.max(0, Math.min(insertPos, docSize - 2))

                const success = editor.chain()
                    .focus()
                    .insertContentAt(insertPos, content)
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: "插入公式失败：目标位置无法接收公式节点" }
                }

                scrollToPosition(editor, insertPos)

                return {
                    success: true,
                    latex: source,
                    display,
                    strategy,
                    insertedAt: insertPos,
                    message: `已插入${isBlock ? "块级" : "行内"}公式：${source}`,
                }
            } catch (error) {
                return { error: `插入公式失败: ${describeError(error)}` }
            }
        },
    },

    getMathInfo: {
        description:
            "列出文档中所有数学公式及其索引、位置与 LaTeX 源码。修改或删除公式前应先调用此工具获取索引。",
        inputSchema: z.object({}),
        execute: async () => {
            try {
                const nodes = findMathNodes(editor)
                return {
                    success: true,
                    count: nodes.length,
                    formulas: nodes.map((item, index) => ({
                        index,
                        latex: item.node.attrs?.latex ?? "",
                        display: item.node.attrs?.display === "yes" ? "block" : "inline",
                        evaluate: item.node.attrs?.evaluate === "yes",
                        pos: item.pos,
                    })),
                    message: nodes.length > 0
                        ? `文档中有 ${nodes.length} 个公式`
                        : "文档中没有公式",
                }
            } catch (error) {
                return { error: `获取公式信息失败: ${describeError(error)}` }
            }
        },
    },

    updateMath: {
        description:
            "修改指定公式的 LaTeX 源码或行内/块级显示方式。需先用 getMathInfo 获取公式索引（从0开始）。",
        inputSchema: z.object({
            mathIndex: z.number().describe("公式索引（从0开始，通过 getMathInfo 获取）"),
            latex: z.string().optional().describe("新的 LaTeX 源码"),
            display: z.enum(["inline", "block"]).optional().describe("新的显示方式"),
        }),
        execute: async ({ mathIndex, latex, display }: {
            mathIndex: number
            latex?: string
            display?: "inline" | "block"
        }) => {
            try {
                const nodes = findMathNodes(editor)
                if (mathIndex < 0 || mathIndex >= nodes.length) {
                    return { error: `公式索引 ${mathIndex} 超出范围（共 ${nodes.length} 个公式）` }
                }
                if (latex === undefined && display === undefined) {
                    return { error: "请至少提供 latex 或 display 之一" }
                }

                const { node, pos } = nodes[mathIndex]
                const nextAttrs: any = { ...node.attrs }
                if (latex !== undefined) {
                    const source = stripMathDelimiters(latex)
                    if (!source) return { error: "新的 LaTeX 内容不能为空" }
                    nextAttrs.latex = source
                }
                if (display !== undefined) {
                    nextAttrs.display = display === "block" ? "yes" : "no"
                }

                editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, nextAttrs))

                return {
                    success: true,
                    mathIndex,
                    latex: nextAttrs.latex,
                    display: nextAttrs.display === "yes" ? "block" : "inline",
                    message: "已更新公式",
                }
            } catch (error) {
                return { error: `更新公式失败: ${describeError(error)}` }
            }
        },
    },

    deleteMath: {
        description: "删除指定公式。需先用 getMathInfo 获取公式索引（从0开始）。",
        inputSchema: z.object({
            mathIndex: z.number().describe("要删除的公式索引（从0开始，通过 getMathInfo 获取）"),
        }),
        execute: async ({ mathIndex }: { mathIndex: number }) => {
            try {
                const nodes = findMathNodes(editor)
                if (mathIndex < 0 || mathIndex >= nodes.length) {
                    return { error: `公式索引 ${mathIndex} 超出范围（共 ${nodes.length} 个公式）` }
                }

                const { node, pos } = nodes[mathIndex]
                const deleted = node.attrs?.latex ?? ""
                editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize))

                return {
                    success: true,
                    mathIndex,
                    deleted,
                    message: `已删除公式：${deleted}`,
                }
            } catch (error) {
                return { error: `删除公式失败: ${describeError(error)}` }
            }
        },
    },
})
