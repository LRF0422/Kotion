import { AppContext } from "@kn/common"
import { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import { ToolLoopAgent } from "ai"
import { useContext, useMemo, useRef } from "react"
import { deepseek } from "./ai-utils"
import type { Node } from "@kn/editor"

// Type definitions
interface PosOffset {
    current: number
    length: number
}

interface NodeInfo {
    from: number
    to: number
    position: number
    type: string
    attrs: Record<string, any>
    textPos: string[]
}



// Helper function to build node information
const buildNodeInfo = (node: Node, pos: number): NodeInfo => {
    const textPos = node.textContent
        ? Array.from(node.textContent, (char, i) => `${char}:${pos + i + 1}`)
        : []

    return {
        from: pos,
        to: pos + node.nodeSize,
        position: pos,
        type: node.type.name,
        attrs: node.attrs,
        textPos
    }
}

// Helper function to calculate position offset
const calculateOffset = (offsets: PosOffset[], pos: number): number => {
    return offsets
        .filter(it => it.current < pos)
        .reduce((sum, item) => {
            return sum + item.length
        }, 0)
}

export const useEditorAgent = (editor: Editor) => {
    const { pluginManager } = useContext(AppContext)
    const posOffsetRef = useRef<PosOffset[]>([])
    const agent = useMemo(() => new ToolLoopAgent({
        model: deepseek("deepseek-chat"),
        instructions: "你是一个助手，你需要根据用户输入的指令，完成用户所请求的任务。执行任务前，应该调用readRange方法，查看全文，然后根据用户所请求的任务，调用其他方法。",
        tools: {
            readRange: {
                description: '查看所给位置到文档结束处的内容',
                inputSchema: z.object({
                    range: z.object({
                        from: z.number().describe("起始位置")
                    })
                }),
                execute: async ({ range }: { range: { from: number } }) => {
                    // Validate range
                    if (range.from < 0 || range.from > editor.state.doc.nodeSize - 2) {
                        return { error: `Invalid range: ${range.from}. Document size: ${editor.state.doc.nodeSize}` }
                    }

                    const result: NodeInfo[] = []
                    editor.state.doc.nodesBetween(range.from, editor.state.doc.nodeSize - 2, (node, pos) => {
                        result.push(buildNodeInfo(node, pos))
                    })
                    return { nodes: result, count: result.length }
                }
            },
            readDocument: {
                description: '阅读全文',
                inputSchema: z.object({}),
                execute: async () => {
                    const result: NodeInfo[] = []
                    editor.state.doc.descendants((node, pos) => {
                        result.push(buildNodeInfo(node, pos))
                    })
                    console.log('Reading document...', result)
                    return { nodes: result, count: result.length }
                }
            },
            write: {
                description: '插入内容',
                inputSchema: z.object({
                    text: z.string().describe("要插入的文本"),
                    pos: z.number().describe("插入位置")
                }),
                execute: async (params: { text: string, pos: number }) => {
                    const { text, pos } = params

                    // Validate position
                    if (pos < 0 || pos > editor.state.doc.nodeSize - 2) {
                        return { error: `Invalid position: ${pos}. Document size: ${editor.state.doc.nodeSize}` }
                    }

                    const offset = calculateOffset(posOffsetRef.current, pos)
                    const actualPos = offset === 0 ? pos : offset

                    editor.commands.insertContentAt(actualPos, text)

                    posOffsetRef.current.push({
                        current: pos,
                        length: text.length
                    })

                    console.log(`Inserted ${text} at position ${actualPos}`)
                    console.log('Position offset:', posOffsetRef.current)

                    return { success: true, insertedAt: actualPos, length: text.length }
                }
            },
            replace: {
                description: '替换内容',
                inputSchema: z.object({
                    text: z.string().describe("替换的文本"),
                    from: z.number().describe("起始位置"),
                    to: z.number().describe("结束位置"),
                }),
                execute: async (params: { text: string, from: number, to: number }) => {
                    const { text, from, to } = params

                    // Validate range
                    if (from < 0 || to > editor.state.doc.nodeSize - 2 || from >= to) {
                        return { error: `Invalid range: ${from}-${to}. Document size: ${editor.state.doc.nodeSize}` }
                    }

                    editor.chain().deleteRange({ from, to }).insertContentAt(from, text).run()

                    const originalLength = to - from
                    const lengthDiff = text.length - originalLength

                    posOffsetRef.current.push({
                        current: from,
                        length: lengthDiff
                    })

                    return { success: true, from, to, newLength: text.length, lengthDiff }
                }
            },
            deleteRange: {
                description: '删除内容',
                inputSchema: z.object({
                    range: z.object({
                        from: z.number().describe("起始位置"),
                        to: z.number().describe("结束位置"),
                    })
                }),
                execute: async ({ range }: { range: { from: number, to: number } }) => {
                    // Validate range
                    if (range.from < 0 || range.to > editor.state.doc.nodeSize - 2 || range.from >= range.to) {
                        return { error: `Invalid range: ${range.from}-${range.to}. Document size: ${editor.state.doc.nodeSize}` }
                    }

                    const deletedLength = range.to - range.from
                    editor.commands.deleteRange(range)

                    posOffsetRef.current.push({
                        current: range.from,
                        length: -deletedLength
                    })

                    return { success: true, from: range.from, to: range.to, deletedLength }
                }
            },
            highlight: {
                description: '高亮标记',
                inputSchema: z.object({
                    from: z.number().describe("起始位置"),
                    to: z.number().describe("结束位置"),
                }),
                execute: async (range: { from: number, to: number }) => {
                    // Validate range
                    if (range.from < 0 || range.to > editor.state.doc.nodeSize - 2 || range.from >= range.to) {
                        return { error: `Invalid range: ${range.from}-${range.to}. Document size: ${editor.state.doc.nodeSize}` }
                    }

                    editor.chain().setTextSelection(range).setHighlight().run()
                    return { success: true, from: range.from, to: range.to }
                }
            }
        },
        onFinish: () => {
            posOffsetRef.current = []
        },
    }), [editor])
    return agent;
}