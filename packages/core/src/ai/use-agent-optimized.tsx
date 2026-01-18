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
    from: number
    to: number
    position: number
    type: string
    attrs: Record<string, any>
    marks: any
    textContent?: string // Changed from textPos array to simple text
    nodeSize: number
}

interface DocumentStructure {
    totalSize: number
    headings: Array<{
        level: number
        text: string
        pos: number
    }>
    blocks: Array<{
        type: string
        pos: number
        size: number
    }>
}

// Helper function to build node information (optimized)
const buildNodeInfo = (node: Node, pos: number, includeFullText: boolean = false): NodeInfo => {
    return {
        from: pos,
        to: pos + node.nodeSize,
        position: pos,
        type: node.type.name,
        attrs: node.attrs,
        marks: node.marks,
        textContent: includeFullText ? node.textContent : undefined,
        nodeSize: node.nodeSize
    }
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
                pos
            })
        }

        if (node.isBlock) {
            blocks.push({
                type: node.type.name,
                pos,
                size: node.nodeSize
            })
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

export const useEditorAgentOptimized = (editor: Editor, onToolExecution?: OnToolExecution) => {
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
            description: '插入内容到指定位置',
            inputSchema: z.object({
                text: z.string().describe("要插入的文本"),
                pos: z.number().describe("插入位置(使用当前文档的实际位置)")
            }),
            execute: async (params: { text: string, pos: number }) => {
                const { text, pos } = params
                const docSize = editor.state.doc.nodeSize
                const validation = validateRange(pos, undefined, docSize)
                if (!validation.valid) {
                    return { error: validation.error }
                }

                const success = editor.commands.insertContentAt(pos, text)

                if (!success) {
                    return { error: `Failed to insert content at position ${pos}` }
                }

                const newDocSize = editor.state.doc.nodeSize
                const insertedSize = newDocSize - docSize

                return {
                    success: true,
                    insertedAt: pos,
                    insertedSize,
                    oldDocSize: docSize,
                    newDocSize
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
    }), [editor])

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
        instructions: `你是一个智能文档编辑助手,具备文档编辑和网络搜索能力。

## 文档编辑能力
处理大文档时请注意:
1. 使用 getDocumentStructure 先了解文档结构
2. 使用 readChunk 分块读取内容,每次读取有限大小
3. 使用 searchInDocument 搜索特定内容
4. 插入、删除、替换操作使用当前文档的实际位置
5. 每次编辑后会返回新的文档大小
6. 对于长文档,优先处理用户关注的区域
7. 批量编辑时,从后往前操作可以避免位置偏移问题

## 网络搜索能力
当用户需要获取最新信息时:
1. 使用 webSearch 搜索互联网获取最新信息、新闻、事实等
2. 使用 fetchWebPage 获取特定网页的详细内容
3. 搜索结果可用于补充文档内容或回答问题
4. 对于时效性强的问题(如最新新闻、实时数据),优先使用网络搜索
5. 搜索后可将相关内容整理并插入到文档中`,
        tools: wrappedTools,
    }), [wrappedTools])

    return agent
}
