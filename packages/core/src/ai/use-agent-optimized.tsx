import { AppContext, axios } from "@kn/common"
import { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import { ToolLoopAgent } from "ai"
import { useCallback, useContext, useMemo, useRef } from "react"
import { deepseek } from "./ai-utils"
import type { Node } from "@kn/editor"

// Configuration constants
const MAX_CHUNK_SIZE = 2000 // Maximum characters per chunk
const MAX_NODES_PER_READ = 50 // Maximum nodes to return in one read
const CONTEXT_WINDOW = 500 // Characters of context to include before/after

// Web search configuration
const WEB_SEARCH_API_URL = '/api/web-search' // Default backend API endpoint
const WEB_SEARCH_MAX_RESULTS = 10 // Maximum search results to return

// Web search result interface
interface WebSearchResult {
    title: string
    url: string
    snippet: string
    source?: string
}

// Web search function using backend API or fallback to DuckDuckGo
const performWebSearch = async (query: string, maxResults: number = 5): Promise<WebSearchResult[]> => {
    try {
        // Try backend API first
        const response = await axios.post(WEB_SEARCH_API_URL, {
            query,
            maxResults
        }, {
            timeout: 10000,
            validateStatus: (status) => status < 500
        })

        if (response.status === 200 && response.data?.results) {
            return response.data.results
        }

        // Fallback: Use DuckDuckGo Instant Answer API (limited but free)
        const ddgResponse = await axios.get(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
            { timeout: 8000 }
        )

        const results: WebSearchResult[] = []

        // Parse DDG response
        if (ddgResponse.data) {
            const data = ddgResponse.data

            // Abstract (main result)
            if (data.Abstract && data.AbstractURL) {
                results.push({
                    title: data.Heading || 'Main Result',
                    url: data.AbstractURL,
                    snippet: data.Abstract,
                    source: data.AbstractSource
                })
            }

            // Related topics
            if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
                    if (topic.FirstURL && topic.Text) {
                        results.push({
                            title: topic.Text?.split(' - ')[0] || 'Related',
                            url: topic.FirstURL,
                            snippet: topic.Text,
                            source: 'DuckDuckGo'
                        })
                    }
                }
            }

            // Answer (for direct answers)
            if (data.Answer && results.length === 0) {
                results.push({
                    title: 'Direct Answer',
                    url: data.AnswerURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                    snippet: data.Answer,
                    source: 'DuckDuckGo'
                })
            }
        }

        return results.length > 0 ? results : [{
            title: 'Search Results',
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            snippet: `No direct results found. Please visit the search page for more results.`,
            source: 'DuckDuckGo'
        }]

    } catch (error) {
        console.error('Web search error:', error)
        // Return a fallback result with search link
        return [{
            title: 'Search Error',
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            snippet: `Search failed. Click the link to search manually.`,
            source: 'Fallback'
        }]
    }
}

// Type definitions
interface NodeInfo {
    from: number           // Node start position (block boundary)
    to: number             // Node end position (block boundary)
    position: number       // Same as from
    type: string
    attrs: Record<string, any>
    marks: any
    textContent?: string   // Text content of the node
    nodeSize: number
    // Insertion positions:
    textStartPos?: number  // Position where text content starts (use for inserting at beginning)
    textEndPos?: number    // Position where text content ends (use for inserting at end)
}

interface DocumentStructure {
    totalSize: number
    headings: Array<{
        level: number
        text: string
        pos: number           // Block position
        textInsertPos: number // Position inside heading for text insertion
    }>
    blocks: Array<{
        type: string
        pos: number           // Block position
        size: number
        textInsertPos?: number // Position inside block for text insertion (if textblock)
    }>
}

// Helper function to build node information (optimized)
const buildNodeInfo = (node: Node, pos: number, includeFullText: boolean = false): NodeInfo => {
    const info: NodeInfo = {
        from: pos,
        to: pos + node.nodeSize,
        position: pos,
        type: node.type.name,
        attrs: node.attrs,
        marks: node.marks,
        textContent: includeFullText ? node.textContent : undefined,
        nodeSize: node.nodeSize
    }

    // For text blocks, provide text insertion positions
    if (node.isTextblock) {
        info.textStartPos = pos + 1  // Position inside the block for inserting at start
        info.textEndPos = pos + node.nodeSize - 1  // Position inside the block for inserting at end
    }

    return info
}

// Helper function to extract document structure
const extractDocumentStructure = (editor: Editor): DocumentStructure => {
    const headings: DocumentStructure['headings'] = []
    const blocks: DocumentStructure['blocks'] = []

    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
            headings.push({
                level: node.attrs.level || 1,
                text: node.textContent,
                pos,
                textInsertPos: pos + 1  // Position inside heading for insertion
            })
        }

        if (node.isBlock) {
            const blockInfo: DocumentStructure['blocks'][0] = {
                type: node.type.name,
                pos,
                size: node.nodeSize
            }

            // For text blocks, provide insertion position
            if (node.isTextblock) {
                blockInfo.textInsertPos = pos + 1
            }

            blocks.push(blockInfo)
        }

        return true
    })

    return {
        totalSize: editor.state.doc.nodeSize,
        headings,
        blocks
    }
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

// Calculate safe chunk size
const calculateChunkSize = (from: number, docSize: number): number => {
    const remaining = docSize - 2 - from
    return Math.min(MAX_CHUNK_SIZE, remaining)
}

// Tool execution callback type
export interface ToolExecutionEvent {
    toolName: string
    args: any
    status: 'start' | 'success' | 'error'
    result?: any
    error?: string
    timestamp: number
    duration?: number
}

export type OnToolExecution = (event: ToolExecutionEvent) => void

// User choice option interface
export interface UserChoiceOption {
    id: string
    label: string
    description?: string
}

// User choice request interface
export interface UserChoiceRequest {
    id: string
    question: string
    options: UserChoiceOption[]
    allowCustomInput?: boolean
    timestamp: number
}

// Callback type for requesting user choice
export type OnUserChoiceRequest = (request: UserChoiceRequest) => Promise<string>

// Wrap a tool with execution tracking
const wrapToolWithCallback = (
    toolName: string,
    tool: { description: string; inputSchema: any; execute: Function },
    onToolExecution?: OnToolExecution
) => {
    if (!onToolExecution) return tool

    return {
        ...tool,
        execute: async (args: any) => {
            const startTime = Date.now()

            // Emit start event
            onToolExecution({
                toolName,
                args,
                status: 'start',
                timestamp: startTime
            })

            try {
                const result = await tool.execute(args)

                // Emit success event
                onToolExecution({
                    toolName,
                    args,
                    status: 'success',
                    result,
                    timestamp: startTime,
                    duration: Date.now() - startTime
                })

                return result
            } catch (error) {
                // Emit error event
                onToolExecution({
                    toolName,
                    args,
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: startTime,
                    duration: Date.now() - startTime
                })
                throw error
            }
        }
    }
}

export const useEditorAgentOptimized = (
    editor: Editor,
    onToolExecution?: OnToolExecution,
    onUserChoiceRequest?: OnUserChoiceRequest
) => {
    const { pluginManager } = useContext(AppContext)

    // Memoize plugin tools to avoid recreation on every render
    const pluginTools = useMemo(() => {
        return pluginManager?.resloveTools(editor) || {}
    }, [])

    // Define base tools
    const baseTools = useMemo(() => ({
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
                from: number,
                chunkSize?: number,
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

                const result: NodeInfo[] = []
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
            description: '在文档中搜索指定文本或正则表达式',
            inputSchema: z.object({
                query: z.string().describe("搜索文本"),
                caseSensitive: z.boolean().optional().describe("是否区分大小写"),
                limit: z.number().optional().describe("最大结果数量")
            }),
            execute: async ({ query, caseSensitive = false, limit = 10 }: {
                query: string,
                caseSensitive?: boolean,
                limit?: number
            }) => {
                const results: Array<{
                    pos: number,
                    text: string,
                    context: string
                }> = []

                const searchText = caseSensitive ? query : query.toLowerCase()

                editor.state.doc.descendants((node, pos) => {
                    if (results.length >= limit) {
                        return false
                    }

                    const nodeText = caseSensitive ? node.textContent : node.textContent.toLowerCase()
                    const index = nodeText.indexOf(searchText)

                    if (index !== -1) {
                        const matchPos = pos + index
                        const contextStart = Math.max(0, index - 50)
                        const contextEnd = Math.min(node.textContent.length, index + query.length + 50)

                        results.push({
                            pos: matchPos,
                            text: node.textContent.substring(index, index + query.length),
                            context: node.textContent.substring(contextStart, contextEnd)
                        })
                    }

                    return true
                })

                return {
                    success: true,
                    results,
                    totalFound: results.length,
                    hasMore: results.length >= limit
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
            execute: async () => {
                return {
                    size: editor.state.doc.nodeSize,
                    from: 0,
                    to: editor.state.doc.nodeSize - 2,
                    recommendedChunkSize: MAX_CHUNK_SIZE
                }
            }
        },

        write: {
            description: '插入文本到文档。可以指定块索引和位置，工具会实时计算正确的插入位置',
            inputSchema: z.object({
                text: z.string().describe("要插入的文本"),
                blockIndex: z.number().optional().describe("块索引（从0开始），不填则使用最后一个块"),
                location: z.enum(['start', 'end']).optional().describe("在块内的位置: 'start'开头, 'end'末尾。默认'end'")
            }),
            execute: async (params: { text: string, blockIndex?: number, location?: 'start' | 'end' }) => {
                const { text, blockIndex, location = 'end' } = params

                try {
                    // Find all text blocks in the document with accurate position info
                    const textBlocks: Array<{
                        pos: number,
                        contentStart: number,
                        contentEnd: number,
                        type: string,
                        text: string
                    }> = []

                    editor.state.doc.descendants((node, pos) => {
                        if (node.isTextblock) {
                            // Use resolve to get accurate content positions
                            const $pos = editor.state.doc.resolve(pos + 1)
                            textBlocks.push({
                                pos,
                                contentStart: $pos.start(),   // Start of content inside block
                                contentEnd: $pos.end(),       // End of content inside block  
                                type: node.type.name,
                                text: node.textContent.slice(0, 50) + (node.textContent.length > 50 ? '...' : '')
                            })
                        }
                        return true
                    })

                    if (textBlocks.length === 0) {
                        return { error: '文档中没有可插入文本的块' }
                    }

                    // Determine which block to use
                    const targetIndex = blockIndex !== undefined
                        ? Math.min(Math.max(0, blockIndex), textBlocks.length - 1)
                        : textBlocks.length - 1

                    const targetBlock = textBlocks[targetIndex]

                    // Use contentStart/contentEnd for accurate positioning
                    const insertPos = location === 'start'
                        ? targetBlock.contentStart
                        : targetBlock.contentEnd

                    const docSize = editor.state.doc.nodeSize

                    // Use setTextSelection + insertContent for reliable insertion
                    const success = editor.chain()
                        .focus()
                        .setTextSelection(insertPos)
                        .insertContent(text)
                        .run()

                    if (!success) {
                        return { error: `插入失败，位置: ${insertPos}` }
                    }

                    const newDocSize = editor.state.doc.nodeSize
                    const insertedSize = newDocSize - docSize

                    return {
                        success: true,
                        blockIndex: targetIndex,
                        blockType: targetBlock.type,
                        blockPreview: targetBlock.text,
                        location,
                        insertedAt: insertPos,
                        insertedSize,
                        oldDocSize: docSize,
                        newDocSize,
                        totalBlocks: textBlocks.length
                    }
                } catch (error) {
                    return { error: `插入失败: ${error instanceof Error ? error.message : '未知错误'}` }
                }
            }
        },

        insertAtEnd: {
            description: '在文档末尾插入内容。这是最可靠的插入方式，适合追加新内容',
            inputSchema: z.object({
                text: z.string().describe("要插入的文本内容"),
                asNewParagraph: z.boolean().optional().describe("是否作为新段落插入，默认true")
            }),
            execute: async (params: { text: string, asNewParagraph?: boolean }) => {
                const { text, asNewParagraph = true } = params
                const docSize = editor.state.doc.nodeSize

                try {
                    // Find the end position for insertion
                    // The last valid position is docSize - 2 (before the closing doc tag)
                    const endPos = docSize - 2

                    let success: boolean
                    if (asNewParagraph) {
                        // Insert as a new paragraph
                        success = editor.chain()
                            .focus('end')
                            .insertContent([{ type: 'paragraph', content: [{ type: 'text', text }] }])
                            .run()
                    } else {
                        // Insert at the end of the last text block
                        success = editor.chain()
                            .focus('end')
                            .insertContent(text)
                            .run()
                    }

                    if (!success) {
                        return { error: 'Failed to insert content at document end' }
                    }

                    const newDocSize = editor.state.doc.nodeSize
                    const insertedSize = newDocSize - docSize

                    return {
                        success: true,
                        insertedAt: 'end',
                        insertedSize,
                        oldDocSize: docSize,
                        newDocSize,
                        asNewParagraph
                    }
                } catch (error) {
                    return { error: `Insert at end failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
                }
            }
        },

        insertAfterBlock: {
            description: '在指定块节点之后插入新段落。适合在特定标题或段落后添加内容',
            inputSchema: z.object({
                blockIndex: z.number().describe("块索引（从0开始）"),
                text: z.string().describe("要插入的文本内容")
            }),
            execute: async (params: { blockIndex: number, text: string }) => {
                const { blockIndex, text } = params
                const docSize = editor.state.doc.nodeSize

                try {
                    // Find all blocks
                    const blocks: Array<{ pos: number, size: number, type: string }> = []
                    editor.state.doc.descendants((node, pos) => {
                        if (node.isBlock && node.type.name !== 'doc') {
                            blocks.push({
                                pos,
                                size: node.nodeSize,
                                type: node.type.name
                            })
                        }
                        return true
                    })

                    if (blocks.length === 0) {
                        return { error: '文档中没有块节点' }
                    }

                    const targetIndex = Math.min(Math.max(0, blockIndex), blocks.length - 1)
                    const targetBlock = blocks[targetIndex]

                    // Calculate the position after this block
                    const insertPos = targetBlock.pos + targetBlock.size

                    // Insert a new paragraph after the block
                    const success = editor.commands.insertContentAt(insertPos, [
                        { type: 'paragraph', content: [{ type: 'text', text }] }
                    ])

                    if (!success) {
                        return { error: `插入失败` }
                    }

                    const newDocSize = editor.state.doc.nodeSize
                    const insertedSize = newDocSize - docSize

                    return {
                        success: true,
                        blockIndex: targetIndex,
                        blockType: targetBlock.type,
                        insertedAfter: insertPos,
                        insertedSize,
                        oldDocSize: docSize,
                        newDocSize,
                        totalBlocks: blocks.length
                    }
                } catch (error) {
                    return { error: `插入失败: ${error instanceof Error ? error.message : '未知错误'}` }
                }
            }
        },

        insertNear: {
            description: '在包含指定文本的块附近插入内容。通过搜索文本定位插入位置',
            inputSchema: z.object({
                searchText: z.string().describe("要搜索的文本，用于定位插入位置"),
                text: z.string().describe("要插入的文本"),
                position: z.enum(['before', 'after', 'start', 'end']).optional().describe("插入位置: 'before'块前, 'after'块后, 'start'块内开头, 'end'块内末尾。默认'after'")
            }),
            execute: async (params: { searchText: string, text: string, position?: 'before' | 'after' | 'start' | 'end' }) => {
                const { searchText, text, position = 'after' } = params
                const docSize = editor.state.doc.nodeSize

                try {
                    // Find the block containing the search text
                    let foundBlock: { pos: number, size: number, type: string, contentStart: number, contentEnd: number } | null = null

                    editor.state.doc.descendants((node, pos) => {
                        if (foundBlock) return false
                        if (node.isTextblock && node.textContent.includes(searchText)) {
                            const $pos = editor.state.doc.resolve(pos + 1)
                            foundBlock = {
                                pos,
                                size: node.nodeSize,
                                type: node.type.name,
                                contentStart: $pos.start(),
                                contentEnd: $pos.end()
                            }
                            return false
                        }
                        return true
                    })

                    if (!foundBlock) {
                        return { error: `未找到包含 "${searchText}" 的块` }
                    }

                    let success: boolean
                    let insertedAt: number | string

                    switch (position) {
                        case 'before':
                            // Insert new paragraph before the block
                            success = editor.commands.insertContentAt(foundBlock.pos, [
                                { type: 'paragraph', content: [{ type: 'text', text }] }
                            ])
                            insertedAt = foundBlock.pos
                            break
                        case 'after':
                            // Insert new paragraph after the block
                            success = editor.commands.insertContentAt(foundBlock.pos + foundBlock.size, [
                                { type: 'paragraph', content: [{ type: 'text', text }] }
                            ])
                            insertedAt = foundBlock.pos + foundBlock.size
                            break
                        case 'start':
                            // Insert text at start of block content
                            success = editor.chain()
                                .focus()
                                .setTextSelection(foundBlock.contentStart)
                                .insertContent(text)
                                .run()
                            insertedAt = foundBlock.contentStart
                            break
                        case 'end':
                            // Insert text at end of block content
                            success = editor.chain()
                                .focus()
                                .setTextSelection(foundBlock.contentEnd)
                                .insertContent(text)
                                .run()
                            insertedAt = foundBlock.contentEnd
                            break
                    }

                    if (!success) {
                        return { error: '插入失败' }
                    }

                    const newDocSize = editor.state.doc.nodeSize
                    const insertedSize = newDocSize - docSize

                    return {
                        success: true,
                        searchText,
                        foundInBlock: foundBlock.type,
                        position,
                        insertedAt,
                        insertedSize,
                        oldDocSize: docSize,
                        newDocSize
                    }
                } catch (error) {
                    return { error: `插入失败: ${error instanceof Error ? error.message : '未知错误'}` }
                }
            }
        },

        replace: {
            description: '替换指定范围的内容',
            inputSchema: z.object({
                text: z.string().describe("替换的文本"),
                from: z.number().describe("起始位置(使用当前文档的实际位置)"),
                to: z.number().describe("结束位置(使用当前文档的实际位置)"),
            }),
            execute: async (params: { text: string, from: number, to: number }) => {
                const { text, from, to } = params
                const docSize = editor.state.doc.nodeSize
                const validation = validateRange(from, to, docSize)
                if (!validation.valid) {
                    return { error: validation.error }
                }

                const success = editor.chain()
                    .focus()
                    .deleteRange({ from, to })
                    .insertContentAt(from, text)
                    .run()

                if (!success) {
                    return { error: `Failed to replace content at range ${from}-${to}` }
                }

                const newDocSize = editor.state.doc.nodeSize
                const sizeDiff = newDocSize - docSize

                return {
                    success: true,
                    from,
                    to,
                    replacedLength: to - from,
                    sizeDiff,
                    oldDocSize: docSize,
                    newDocSize
                }
            }
        },

        deleteRange: {
            description: '删除指定范围的内容',
            inputSchema: z.object({
                range: z.object({
                    from: z.number().describe("起始位置(使用当前文档的实际位置)"),
                    to: z.number().describe("结束位置(使用当前文档的实际位置)"),
                })
            }),
            execute: async ({ range }: { range: { from: number, to: number } }) => {
                const { from, to } = range
                const docSize = editor.state.doc.nodeSize
                const validation = validateRange(from, to, docSize)
                if (!validation.valid) {
                    return { error: validation.error }
                }

                const success = editor.chain()
                    .focus()
                    .deleteRange({ from, to })
                    .run()

                if (!success) {
                    return { error: `Failed to delete range ${from}-${to}` }
                }

                const newDocSize = editor.state.doc.nodeSize
                const deletedSize = docSize - newDocSize

                return {
                    success: true,
                    from,
                    to,
                    deletedSize,
                    oldDocSize: docSize,
                    newDocSize
                }
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

        webSearch: {
            description: '搜索互联网获取最新信息。当用户询问需要实时数据、新闻、或你不确定的事实时使用此工具',
            inputSchema: z.object({
                query: z.string().describe("搜索查询关键词"),
                maxResults: z.number().optional().describe("返回的最大结果数量,默认5条")
            }),
            execute: async ({ query, maxResults = 5 }: { query: string, maxResults?: number }) => {
                if (!query || query.trim().length === 0) {
                    return { error: 'Search query cannot be empty' }
                }

                const effectiveMaxResults = Math.min(maxResults, WEB_SEARCH_MAX_RESULTS)

                try {
                    const results = await performWebSearch(query.trim(), effectiveMaxResults)

                    return {
                        success: true,
                        query: query.trim(),
                        results,
                        totalResults: results.length,
                        message: results.length > 0
                            ? `Found ${results.length} result(s) for "${query}"`
                            : `No results found for "${query}"`
                    }
                } catch (error) {
                    return {
                        error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        query: query.trim()
                    }
                }
            }
        },

        fetchWebPage: {
            description: '获取网页内容。当需要获取特定URL的详细内容时使用此工具',
            inputSchema: z.object({
                url: z.string().describe("要获取内容的网页URL"),
                extractText: z.boolean().optional().describe("是否只提取纯文本内容,默认true")
            }),
            execute: async ({ url, extractText = true }: { url: string, extractText?: boolean }) => {
                if (!url || !url.startsWith('http')) {
                    return { error: 'Invalid URL. URL must start with http:// or https://' }
                }

                try {
                    // Try backend API for fetching webpage content
                    const response = await axios.post('/api/fetch-webpage', {
                        url,
                        extractText
                    }, {
                        timeout: 15000,
                        validateStatus: (status) => status < 500
                    })

                    if (response.status === 200 && response.data) {
                        return {
                            success: true,
                            url,
                            title: response.data.title || 'Unknown',
                            content: response.data.content?.slice(0, 5000) || '', // Limit content size
                            contentLength: response.data.content?.length || 0,
                            truncated: (response.data.content?.length || 0) > 5000
                        }
                    }

                    return {
                        error: 'Failed to fetch webpage content',
                        url
                    }
                } catch (error) {
                    return {
                        error: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        url
                    }
                }
            }
        },

        askUserChoice: {
            description: '向用户询问选择。当需要用户确认、选择方案或提供反馈时使用此工具。用户的选择将作为结果返回,你可以根据用户的选择继续后续操作',
            inputSchema: z.object({
                question: z.string().describe("向用户提问的问题"),
                options: z.array(z.object({
                    id: z.string().describe("选项的唯一标识"),
                    label: z.string().describe("选项的显示文本"),
                    description: z.string().optional().describe("选项的详细描述")
                })).describe("可选项列表,至少提供2个选项"),
                allowCustomInput: z.boolean().optional().describe("是否允许用户输入自定义回复,默认false")
            }),
            execute: async ({ question, options, allowCustomInput = false }: {
                question: string,
                options: UserChoiceOption[],
                allowCustomInput?: boolean
            }) => {
                if (!question || question.trim().length === 0) {
                    return { error: 'Question cannot be empty' }
                }

                if (!options || options.length < 2) {
                    return { error: 'At least 2 options are required' }
                }

                if (!onUserChoiceRequest) {
                    // If no callback is provided, return the first option as default
                    return {
                        success: true,
                        selectedOption: options[0].id,
                        selectedLabel: options[0].label,
                        isDefault: true,
                        message: 'User choice callback not available, using default option'
                    }
                }

                const requestId = `choice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

                try {
                    // Request user choice and wait for response
                    const selectedOptionId = await onUserChoiceRequest({
                        id: requestId,
                        question,
                        options,
                        allowCustomInput,
                        timestamp: Date.now()
                    })

                    // Find the selected option
                    const selectedOption = options.find(opt => opt.id === selectedOptionId)

                    if (selectedOption) {
                        return {
                            success: true,
                            selectedOption: selectedOption.id,
                            selectedLabel: selectedOption.label,
                            selectedDescription: selectedOption.description,
                            isCustomInput: false
                        }
                    } else {
                        // Custom input provided
                        return {
                            success: true,
                            selectedOption: 'custom',
                            selectedLabel: selectedOptionId, // The custom input text
                            isCustomInput: true
                        }
                    }
                } catch (error) {
                    return {
                        error: `User choice request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        question
                    }
                }
            }
        },
    }), [editor, onUserChoiceRequest])

    // Wrap tools with execution callback
    const wrappedTools = useMemo(() => {
        const tools: Record<string, any> = {}
        for (const [name, tool] of Object.entries(baseTools)) {
            tools[name] = wrapToolWithCallback(name, tool as any, onToolExecution)
        }
        // Also wrap plugin tools
        for (const [name, tool] of Object.entries(pluginTools)) {
            tools[name] = wrapToolWithCallback(name, tool as any, onToolExecution)
        }
        return tools
    }, [baseTools, pluginTools, onToolExecution])

    const agent = useMemo(() => new ToolLoopAgent({
        model: deepseek("deepseek-chat"),
        instructions: `你是一个智能文档编辑助手。

## 插入内容的方式（按推荐顺序）

### 1. insertNear - 通过搜索文本定位（最推荐）
参数:
- searchText: 要搜索的文本
- text: 要插入的内容
- position: 'before'块前 | 'after'块后 | 'start'块内开头 | 'end'块内末尾

示例: insertNear({ searchText: "第一章", text: "新内容", position: "after" })

### 2. write - 通过块索引插入
参数:
- text: 要插入的文本
- blockIndex: 块索引（0开始），默认最后一个
- location: 'start' | 'end'，默认'end'

### 3. insertAtEnd - 在文档末尾追加新段落
参数: text, asNewParagraph(默认true)

### 4. insertAfterBlock - 在指定块后插入新段落  
参数: blockIndex, text

## 读取文档
- getDocumentStructure: 获取文档结构
- readChunk: 分块读取内容
- searchInDocument: 搜索文本

## 其他工具
- replace: 替换内容
- deleteRange: 删除内容
- webSearch: 网络搜索
- askUserChoice: 用户交互`,
        tools: wrappedTools,
    }), [wrappedTools])

    return agent
}
