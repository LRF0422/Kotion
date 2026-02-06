/**
 * Tool Discovery APIs
 *
 * These tools allow the AI agent to discover and load tools on-demand,
 * reducing initial context size while maintaining full capability.
 */

import { z } from '@kn/ui'
import type { ToolsRecord, ToolCategory, ReloadCallback } from '../types'
import type { ToolProvider } from '../providers/ToolProvider'
import { CATEGORY_DESCRIPTIONS } from './tool-metadata'

export interface ToolDiscoveryContext {
    toolProvider: ToolProvider
    onReload?: ReloadCallback
}

/**
 * Create tool discovery tools
 */
export function createToolDiscoveryTools(context: ToolDiscoveryContext): ToolsRecord {
    const { toolProvider, onReload } = context

    return {
        /**
         * Discover available tool categories
         */
        discoverTools: {
            description: `发现可用的工具分类。返回所有工具分类及其描述，帮助你了解有哪些能力可用。
使用此工具来探索可用的工具集，然后使用 exploreCategory 查看具体分类下的工具。`,
            inputSchema: z.object({}),
            execute: async () => {
                const categories = toolProvider.getCategories()
                const loadedCount = toolProvider.getLoadedToolNames().length
                const totalCount = toolProvider.getAllMetadata().length

                return {
                    summary: `共 ${totalCount} 个工具，已加载 ${loadedCount} 个`,
                    categories: categories.map(cat => ({
                        category: cat.category,
                        description: cat.description,
                        available: cat.toolCount,
                        loaded: cat.loadedCount
                    })),
                    hint: '使用 exploreCategory 查看具体分类的工具，使用 loadTool 加载需要的工具'
                }
            }
        },

        /**
         * Explore tools in a specific category
         */
        exploreCategory: {
            description: `探索指定分类下的工具。返回该分类中所有工具的详细信息。
可用分类: ${Object.keys(CATEGORY_DESCRIPTIONS).join(', ')}`,
            inputSchema: z.object({
                category: z.enum([
                    'document-read',
                    'document-write',
                    'document-delete',
                    'layout',
                    'interaction',
                    'web',
                    'plugin',
                    'discovery'
                ] as const).describe('要探索的工具分类')
            }),
            execute: async ({ category }: { category: ToolCategory }) => {
                const tools = toolProvider.getToolsByCategory(category)
                const description = CATEGORY_DESCRIPTIONS[category]

                return {
                    category,
                    description,
                    toolCount: tools.length,
                    tools: tools.map(tool => ({
                        name: tool.name,
                        description: tool.description,
                        priority: tool.priority,
                        loaded: tool.loaded,
                        tags: tool.tags
                    })),
                    hint: tools.some(t => !t.loaded)
                        ? '使用 loadTool 加载未加载的工具'
                        : '所有工具已加载'
                }
            }
        },

        /**
         * Search for tools by keyword
         */
        searchAvailableTools: {
            description: `搜索可用工具。根据关键词搜索工具名称、描述和标签。
当你不确定需要哪个工具时使用此功能。`,
            inputSchema: z.object({
                query: z.string().describe('搜索关键词，如 "insert", "delete", "search" 等')
            }),
            execute: async ({ query }: { query: string }) => {
                const results = toolProvider.searchTools(query)

                if (results.length === 0) {
                    return {
                        query,
                        found: 0,
                        message: '没有找到匹配的工具',
                        hint: '尝试使用其他关键词，或使用 discoverTools 查看所有分类'
                    }
                }

                return {
                    query,
                    found: results.length,
                    tools: results.slice(0, 10).map(tool => ({
                        name: tool.name,
                        category: tool.category,
                        description: tool.description,
                        loaded: tool.loaded
                    })),
                    hint: results.some(t => !t.loaded)
                        ? '使用 loadTool 加载需要的工具'
                        : '所有匹配工具已加载'
                }
            }
        },

        /**
         * Load a specific tool
         */
        loadTool: {
            description: `加载指定的工具。加载后工具将可以在后续对话中使用。
注意: 部分核心工具已预加载，无需手动加载。`,
            inputSchema: z.object({
                toolName: z.string().describe('要加载的工具名称'),
                reason: z.string().optional().describe('加载此工具的原因（可选）')
            }),
            execute: async ({ toolName, reason }: { toolName: string; reason?: string }) => {
                const result = toolProvider.loadTool(toolName)

                if (result.success) {
                    // Trigger reload to update agent's tool list
                    onReload?.()
                }

                return {
                    ...result,
                    toolName,
                    reason,
                    hint: result.success
                        ? `工具 "${toolName}" 现在可以使用了`
                        : '请使用 searchAvailableTools 查找正确的工具名称'
                }
            }
        }
    }
}

/**
 * Get discovery tools metadata for initial loading
 */
export function getDiscoveryToolsMetadata() {
    return [
        {
            name: 'discoverTools',
            category: 'discovery' as ToolCategory,
            description: '发现可用的工具分类',
            priority: 10,
            tags: ['discovery', 'explore', 'essential'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'exploreCategory',
            category: 'discovery' as ToolCategory,
            description: '探索指定分类下的工具',
            priority: 10,
            tags: ['discovery', 'category', 'essential'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'searchAvailableTools',
            category: 'discovery' as ToolCategory,
            description: '搜索可用工具',
            priority: 10,
            tags: ['discovery', 'search', 'essential'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'loadTool',
            category: 'discovery' as ToolCategory,
            description: '加载指定的工具',
            priority: 10,
            tags: ['discovery', 'load', 'essential'],
            loaded: true,
            source: 'builtin' as const
        }
    ]
}
