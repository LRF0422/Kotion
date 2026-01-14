import { AppContext } from "@kn/common"
import { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import { ToolLoopAgent } from "ai"
import { useCallback, useContext, useMemo, useRef } from "react"
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
    marks: any
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
        marks: node.marks,
        textPos
    }
}

// Helper function to calculate position offset
const calculateOffset = (offsets: PosOffset[], pos: number): number => {
    return offsets
        .filter(it => it.current < pos)
        .reduce((sum, item) => sum + item.length, 0)
}

// Helper function to validate document range
const validateRange = (from: number, to: number | undefined, docSize: number): { valid: boolean; error?: string } => {
    const maxPos = docSize - 2
    if (from < 0 || from > maxPos) {
        return { valid: false, error: `Invalid from position: ${from}. Document size: ${docSize}` }
    }
    if (to !== undefined && (to > maxPos || from >= to)) {
        return { valid: false, error: `Invalid range: ${from}-${to}. Document size: ${docSize}` }
    }
    return { valid: true }
}

export const useEditorAgent = (editor: Editor) => {
    const { pluginManager } = useContext(AppContext)
    const posOffsetRef = useRef<PosOffset[]>([])

    // Memoize plugin tools to avoid recreation on every render
    const pluginTools = useMemo(() => {
        return pluginManager?.resloveTools(editor) || {}
    }, [pluginManager, editor])

    // Reset position offsets callback
    const resetOffsets = useCallback(() => {
        posOffsetRef.current = []
    }, [])

    const agent = useMemo(() => new ToolLoopAgent({
        model: deepseek("deepseek-chat"),
        instructions: "你是一个助手，你需要根据用户输入的指令，完成用户所请求的任务。请注意以下几点" + "\n" +
            "1. 插入文本的时候要一段一段插入,不要一次性插入所有内容" + "\n"
        ,
        tools: {
            readRange: {
                description: '查看所给位置到文档结束处的内容',
                inputSchema: z.object({
                    range: z.object({
                        from: z.number().describe("起始位置")
                    })
                }),
                execute: async ({ range }: { range: { from: number } }) => {
                    const docSize = editor.state.doc.nodeSize
                    const validation = validateRange(range.from, undefined, docSize)
                    if (!validation.valid) {
                        return { error: validation.error }
                    }

                    const result: NodeInfo[] = []
                    const maxPos = docSize - 2
                    editor.state.doc.nodesBetween(range.from, maxPos, (node, pos) => {
                        result.push(buildNodeInfo(node, pos))
                    })
                    return { nodes: result, count: result.length }
                }
            },
            getDocumentSize: {
                description: '获取文档大小',
                inputSchema: z.object({}),
                execute: async () => {
                    return {
                        size: editor.state.doc.nodeSize,
                        from: 0,
                        to: editor.state.doc.nodeSize - 2
                    }
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
                    const docSize = editor.state.doc.nodeSize
                    const validation = validateRange(pos, undefined, docSize)
                    if (!validation.valid) {
                        return { error: validation.error }
                    }

                    const offset = calculateOffset(posOffsetRef.current, pos)
                    const actualPos = offset === 0 ? pos : offset

                    editor.commands.insertContentAt(actualPos, text)

                    posOffsetRef.current.push({
                        current: pos,
                        length: text.length
                    })

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
                    const docSize = editor.state.doc.nodeSize
                    const validation = validateRange(from, to, docSize)
                    if (!validation.valid) {
                        return { error: validation.error }
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
                    const docSize = editor.state.doc.nodeSize
                    const validation = validateRange(range.from, range.to, docSize)
                    if (!validation.valid) {
                        return { error: validation.error }
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
                    const docSize = editor.state.doc.nodeSize
                    const validation = validateRange(range.from, range.to, docSize)
                    if (!validation.valid) {
                        return { error: validation.error }
                    }

                    editor.chain().setTextSelection(range).scrollIntoView().setHighlight().run()
                    return { success: true, from: range.from, to: range.to }
                }
            },
            ...pluginTools
        },
        onFinish: resetOffsets,
    }), [editor, pluginTools, resetOffsets])

    return agent
}