import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord, UserChoiceOption, OnUserChoiceRequest } from "../types"
import { WEB_SEARCH_MAX_RESULTS } from "../types"
import { validateRange } from "../utils/document-utils"
import { performWebSearch, fetchWebPage } from "../utils/web-search"

/**
 * Create user interaction tools
 */
export const createUserChoiceTool = (onUserChoiceRequest?: OnUserChoiceRequest): ToolsRecord => ({
    askUserChoice: {
        description: '【必须优先使用】向用户询问选择。在执行任何修改操作前，必须先调用此工具征求用户确认',
        inputSchema: z.object({
            question: z.string().describe("向用户提问的问题"),
            options: z.array(z.object({
                id: z.string().describe("选项的唯一标识"),
                label: z.string().describe("选项的显示文本"),
                description: z.string().optional().describe("选项的详细描述")
            })).describe("可选项列表,至少提供2个选项"),
            allowCustomInput: z.boolean().optional().describe("是否允许用户输入自定义回复")
        }),
        execute: async ({ question, options, allowCustomInput = false }: {
            question: string
            options: UserChoiceOption[]
            allowCustomInput?: boolean
        }) => {
            if (!question || question.trim().length === 0) {
                return { error: 'Question cannot be empty' }
            }

            if (!options || options.length < 2) {
                return { error: 'At least 2 options are required' }
            }

            if (!onUserChoiceRequest) {
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
                const selectedOptionId = await onUserChoiceRequest({
                    id: requestId,
                    question,
                    options,
                    allowCustomInput,
                    timestamp: Date.now()
                })

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
                    return {
                        success: true,
                        selectedOption: 'custom',
                        selectedLabel: selectedOptionId,
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
    }
})

/**
 * Create highlighting tools
 */
export const createHighlightTools = (editor: Editor): ToolsRecord => ({
    highlight: {
        description: '高亮标记指定范围的文本',
        inputSchema: z.object({
            from: z.number().describe("起始位置"),
            to: z.number().describe("结束位置"),
        }),
        execute: async ({ from, to }: { from: number; to: number }) => {
            const docSize = editor.state.doc.nodeSize
            const validation = validateRange(from, to, docSize)

            if (!validation.valid) {
                return { error: validation.error }
            }

            const success = editor.chain()
                .focus()
                .setTextSelection({ from, to })
                .setHighlight()
                .scrollIntoView()
                .run()

            if (!success) {
                return { error: `高亮失败，范围: ${from}-${to}` }
            }

            return { success: true, from, to, highlightedRange: to - from }
        }
    }
})

/**
 * Create web search tools
 */
export const createWebSearchTools = (): ToolsRecord => ({
    webSearch: {
        description: '搜索互联网获取最新信息',
        inputSchema: z.object({
            query: z.string().describe("搜索查询关键词"),
            maxResults: z.number().optional().describe("返回的最大结果数量")
        }),
        execute: async ({ query, maxResults = 5 }: {
            query: string
            maxResults?: number
        }) => {
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
        description: '获取网页内容',
        inputSchema: z.object({
            url: z.string().describe("要获取内容的网页URL"),
            extractText: z.boolean().optional().describe("是否只提取纯文本内容")
        }),
        execute: async ({ url, extractText = true }: {
            url: string
            extractText?: boolean
        }) => {
            if (!url || !url.startsWith('http')) {
                return { error: 'Invalid URL. URL must start with http:// or https://' }
            }

            try {
                const result = await fetchWebPage(url, extractText)

                if (result.success) {
                    return {
                        success: true,
                        url,
                        title: result.title,
                        content: result.content,
                        contentLength: result.content?.length || 0,
                        truncated: (result.content?.length || 0) > 5000
                    }
                }

                return { error: result.error || 'Failed to fetch webpage', url }
            } catch (error) {
                return {
                    error: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    url
                }
            }
        }
    }
})

/**
 * Create all misc tools
 */
export const createMiscTools = (
    editor: Editor,
    onUserChoiceRequest?: OnUserChoiceRequest
): ToolsRecord => ({
    ...createUserChoiceTool(onUserChoiceRequest),
    ...createHighlightTools(editor),
    ...createWebSearchTools()
})
