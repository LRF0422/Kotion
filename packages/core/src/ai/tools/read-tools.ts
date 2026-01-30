import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "../types"
import { MAX_CHUNK_SIZE, MAX_NODES_PER_READ, CONTEXT_WINDOW } from "../types"
import {
    extractDocumentStructure,
    validateRange,
    calculateChunkSize,
    buildNodeInfo,
    getDocumentSizeInfo
} from "../utils"

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

            let actualFrom = from
            if (includeContext) {
                actualFrom = Math.max(0, from - CONTEXT_WINDOW)
            }

            editor.state.doc.nodesBetween(actualFrom, maxPos, (node, pos) => {
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

            return {
                success: true,
                nodes: result,
                count: result.length,
                from: actualFrom,
                to: Math.min(actualFrom + charCount, docSize - 2),
                charCount,
                hasMore: (from + effectiveChunkSize) < (docSize - 2)
            }
        }
    },

    searchInDocument: {
        description: '在文档中搜索指定文本，返回每个字符的精确位置可直接用于选择和替换',
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
            const results: Array<{
                from: number
                to: number
                text: string
                characters: Array<{ char: string; pos: number }>
                context: string
                blockType: string
                blockPos: number
            }> = []

            const searchText = caseSensitive ? query : query.toLowerCase()

            editor.state.doc.descendants((node, pos) => {
                if (results.length >= limit) {
                    return false
                }

                if (!node.isTextblock) {
                    return true
                }

                const nodeText = caseSensitive ? node.textContent : node.textContent.toLowerCase()
                const originalText = node.textContent
                let searchIndex = 0

                // Find all matches within this text block
                while (searchIndex < nodeText.length && results.length < limit) {
                    const index = nodeText.indexOf(searchText, searchIndex)
                    if (index === -1) break

                    // For text blocks, content starts at pos + 1 (after opening tag)
                    const from = pos + 1 + index
                    const to = from + query.length

                    // Build character-level position array
                    const characters: Array<{ char: string; pos: number }> = []
                    for (let i = 0; i < query.length; i++) {
                        characters.push({
                            char: originalText[index + i],
                            pos: from + i
                        })
                    }

                    const contextStart = Math.max(0, index - 50)
                    const contextEnd = Math.min(node.textContent.length, index + query.length + 50)

                    results.push({
                        from,
                        to,
                        text: originalText.substring(index, index + query.length),
                        characters,
                        context: node.textContent.substring(contextStart, contextEnd),
                        blockType: node.type.name,
                        blockPos: pos
                    })

                    searchIndex = index + 1 // Continue searching for more matches
                }

                return true
            })

            return {
                success: true,
                results,
                totalFound: results.length,
                hasMore: results.length >= limit,
                tip: 'Use from/to for range selection, or characters[i].pos for specific character position'
            }
        }
    },

    getNodeAtPosition: {
        description: '获取指定位置的节点信息',
        inputSchema: z.object({
            pos: z.number().describe("位置")
        }),
        execute: async ({ pos }: { pos: number }) => {
            const docSize = editor.state.doc.nodeSize
            const validation = validateRange(pos, undefined, docSize)
            if (!validation.valid) {
                return { error: validation.error }
            }

            const resolvedPos = editor.state.doc.resolve(pos)
            const node = resolvedPos.parent

            return {
                success: true,
                node: buildNodeInfo(node, resolvedPos.start(), true),
                depth: resolvedPos.depth,
                parentType: resolvedPos.parent.type.name
            }
        }
    },

    getDocumentSize: {
        description: '获取文档大小',
        inputSchema: z.object({}),
        execute: async () => getDocumentSizeInfo(editor)
    }
})
