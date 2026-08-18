import type { Editor } from "@kn/editor"
import { Node } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import { MAX_CHUNK_SIZE, MAX_NODES_PER_READ, CONTEXT_WINDOW } from "@kn/common"
import {
    extractDocumentStructure,
    validateRange,
    calculateChunkSize,
    buildNodeInfo,
    findTextMatchesInDoc,
} from "@kn/common"

/**
 * Create document reading tools
 */
export const createReadTools = (editor: Editor): ToolsRecord => ({
    getDocumentStructure: {
        description: '获取文档结构概览,包括大小、标题、块等信息。处理大文档时应该首先调用此工具',
        inputSchema: z.object({}),
        execute: async () => {
            const structure = extractDocumentStructure(editor)
            return {
                success: true,
                ...structure,
                recommendedChunkSize: MAX_CHUNK_SIZE,
                maxNodesPerRead: MAX_NODES_PER_READ
            }
        }
    },

    readChunk: {
        description: `分块读取文档内容。每次最多读取 ${MAX_CHUNK_SIZE} 字符或 ${MAX_NODES_PER_READ} 个节点`,
        inputSchema: z.object({
            from: z.number().describe("起始位置"),
            chunkSize: z.number().optional().describe(`读取的字符数,最大 ${MAX_CHUNK_SIZE}`),
            includeContext: z.boolean().optional().describe("是否包含前后文上下文")
        }),
        execute: async ({ from, chunkSize, includeContext = false }: {
            from: number
            chunkSize?: number
            includeContext?: boolean
        }) => {
            const docSize = editor.state.doc.nodeSize
            const validation = validateRange(from, undefined, docSize)
            if (!validation.valid) {
                return { error: validation.error }
            }

            const effectiveChunkSize = Math.min(
                chunkSize || MAX_CHUNK_SIZE,
                calculateChunkSize(from, docSize)
            )

            const result: any[] = []
            const maxPos = Math.min(from + effectiveChunkSize, docSize - 2)
            let charCount = 0
            let nodeCount = 0

            // Context window is a PREFIX decoration: it must not consume the
            // chunk budget. Walk the context span first (uncounted), then the
            // real [from, from+chunkSize) span, counting only the latter — the
            // old code counted context chars toward the budget AND reported a
            // hasMore based on the un-shifted from, so each page returned less
            // real content than requested and could misreport "more available".
            let actualFrom = from
            let contextPrefix: any[] = []
            if (includeContext) {
                actualFrom = Math.max(0, from - CONTEXT_WINDOW)
                editor.state.doc.nodesBetween(actualFrom, from, (node, pos) => {
                    const nodeInfo = buildNodeInfo(node, pos, true)
                    contextPrefix.push(nodeInfo)
                    return true
                })
            }

            editor.state.doc.nodesBetween(from, maxPos, (node, pos) => {
                if (nodeCount >= MAX_NODES_PER_READ) {
                    return false
                }

                const nodeInfo = buildNodeInfo(node, pos, true)
                result.push(nodeInfo)

                charCount += node.textContent.length
                nodeCount++

                if (charCount >= effectiveChunkSize) {
                    return false
                }

                return true
            })

            const contextNodes = includeContext
                ? contextPrefix.map(n => ({ ...n, isContext: true }))
                : []
            return {
                success: true,
                nodes: [...contextNodes, ...result],
                count: contextNodes.length + result.length,
                from: actualFrom,
                to: Math.min(from + charCount, docSize - 2),
                charCount,
                hasMore: (from + charCount) < (docSize - 2)
            }
        }
    },

    searchInDocument: {
        description: '在文档中搜索指定文本，返回精确的 from/to 位置和所在块的 blockId，可直接用于 replaceRange/deleteRange/deleteText 或 blockId 寻址编辑',
        inputSchema: z.object({
            query: z.string().describe("搜索文本"),
            caseSensitive: z.boolean().optional().describe("是否区分大小写"),
            limit: z.number().optional().describe("最大结果数量")
        }),
        execute: async ({ query, caseSensitive = false, limit = 10 }: {
            query: string
            caseSensitive?: boolean
            limit?: number
        }) => {
            if (!query) {
                return { error: '搜索文本不能为空' }
            }

            // findTextMatchesInDoc keeps an exact char→position map per
            // textblock, so positions stay correct around inline atoms
            // (images/mentions/hard breaks) and across mark boundaries —
            // unlike the legacy textContent-index mapping.
            const results = findTextMatchesInDoc(editor.state.doc, query, { caseSensitive, limit })
                .map(m => ({
                    from: m.from,
                    to: m.to,
                    text: m.text,
                    context: m.context,
                    blockType: m.blockType,
                    blockPos: m.blockPos,
                    blockId: m.blockId
                }))

            return {
                success: true,
                results,
                totalFound: results.length,
                hasMore: results.length >= limit,
                tip: 'Use from/to for replaceRange/deleteRange, blockId to scope deleteText, or blockId for replaceBlockById/applyEdits'
            }
        }
    }
})
