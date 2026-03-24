/**
 * Tool Metadata Definitions
 *
 * Defines metadata for all built-in tools, organized by category.
 * This metadata is used for tool discovery and progressive loading.
 */

import type { ToolMetadata, ToolCategory, CategoryInfo } from '../types'

// Essential tools that are always loaded
export const ESSENTIAL_TOOLS = [
    // Read tools
    'updateTitle',
    'getDocumentStructure',
    'searchInDocument',
    'readChunk',
    // Write tools (commonly needed)
    'write',
    'insertNear',
    'insertAtEnd',
    'replaceContent',
    // Interaction tools
    'askUserChoice',
    // Structure tools
    'convertBlock',
    'formatText'
] as const

// Category descriptions
export const CATEGORY_DESCRIPTIONS: Record<ToolCategory, string> = {
    'document-read': '文档读取工具 - 用于获取文档结构、内容和搜索',
    'document-write': '文档写入工具 - 用于插入、更新和替换内容',
    'document-delete': '文档删除工具 - 用于删除内容和块',
    'document-structure': '结构工具 - 用于转换块类型、移动块、格式化文本、表格操作',
    'layout': '布局工具 - 用于管理多列布局',
    'interaction': '交互工具 - 用于与用户交互',
    'web': '网络工具 - 用于网页搜索和获取',
    'plugin': '插件工具 - 来自已安装插件的工具',
    'discovery': '发现工具 - 用于发现和加载其他工具'
}

// Built-in tool metadata registry
export const BUILTIN_TOOL_METADATA: ToolMetadata[] = [
    // ===== Document Read Tools =====
    {
        name: 'getDocumentStructure',
        category: 'document-read',
        description: '获取文档整体结构，包括标题、段落和块信息',
        priority: 10,
        tags: ['structure', 'overview', 'essential'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'readChunk',
        category: 'document-read',
        description: '分块读取文档内容，支持大文档',
        priority: 10,
        tags: ['read', 'chunk', 'essential'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'searchInDocument',
        category: 'document-read',
        description: '在文档中搜索文本，返回位置信息',
        priority: 10,
        tags: ['search', 'find', 'essential'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'getNodeAtPosition',
        category: 'document-read',
        description: '获取指定位置的节点详细信息',
        priority: 5,
        tags: ['node', 'position', 'detail'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'getDocumentSize',
        category: 'document-read',
        description: '获取文档大小信息',
        priority: 4,
        tags: ['size', 'metrics'],
        loaded: false,
        source: 'builtin'
    },

    // ===== Document Write Tools =====
    {
        name: 'updateTitle',
        category: 'document-write',
        description: '更新文档标题',
        priority: 10,
        tags: ['title', 'update', 'essential'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'write',
        category: 'document-write',
        description: '在指定块中插入文本内容',
        priority: 8,
        tags: ['write', 'insert', 'text'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'insertAtPosition',
        category: 'document-write',
        description: '在精确位置插入内容',
        priority: 7,
        tags: ['insert', 'position', 'precise'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'insertNear',
        category: 'document-write',
        description: '在匹配文本附近插入内容',
        priority: 8,
        tags: ['insert', 'near', 'relative'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'replaceContent',
        category: 'document-write',
        description: '查找并替换内容',
        priority: 8,
        tags: ['replace', 'find', 'update'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'batchInsert',
        category: 'document-write',
        description: '批量插入多个内容项',
        priority: 6,
        tags: ['batch', 'insert', 'multiple'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'insertAfterBlock',
        category: 'document-write',
        description: '在指定块后插入内容',
        priority: 7,
        tags: ['insert', 'block', 'after'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'insertAtEnd',
        category: 'document-write',
        description: '在文档末尾追加内容',
        priority: 7,
        tags: ['insert', 'append', 'end'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'insertSegmentedMarkdown',
        category: 'document-write',
        description: '插入带格式的 Markdown 内容',
        priority: 6,
        tags: ['markdown', 'format', 'insert'],
        loaded: false,
        source: 'builtin'
    },

    // ===== Document Delete Tools =====
    {
        name: 'deleteRange',
        category: 'document-delete',
        description: '删除指定位置范围的内容',
        priority: 6,
        tags: ['delete', 'range', 'position'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'deleteBySearch',
        category: 'document-delete',
        description: '搜索并删除匹配的内容',
        priority: 6,
        tags: ['delete', 'search', 'match'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'deleteBlock',
        category: 'document-delete',
        description: '删除指定索引的块',
        priority: 6,
        tags: ['delete', 'block', 'index'],
        loaded: false,
        source: 'builtin'
    },

    // ===== Layout Tools =====
    {
        name: 'insertColumns',
        category: 'layout',
        description: '创建多列布局（2-6列）',
        priority: 5,
        tags: ['columns', 'layout', 'create'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'getColumnsInfo',
        category: 'layout',
        description: '获取列布局信息',
        priority: 4,
        tags: ['columns', 'info', 'read'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'updateColumnContent',
        category: 'layout',
        description: '更新指定列的内容',
        priority: 5,
        tags: ['columns', 'update', 'content'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'setColumnsLayout',
        category: 'layout',
        description: '设置列宽度比例',
        priority: 4,
        tags: ['columns', 'layout', 'width'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'addColumnToLayout',
        category: 'layout',
        description: '向现有布局添加列',
        priority: 4,
        tags: ['columns', 'add', 'layout'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'deleteColumn',
        category: 'layout',
        description: '删除布局中的列',
        priority: 4,
        tags: ['columns', 'delete', 'remove'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'deleteColumnsLayout',
        category: 'layout',
        description: '删除整个列布局',
        priority: 4,
        tags: ['columns', 'delete', 'layout'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'insertNestedColumns',
        category: 'layout',
        description: '在已有分栏列内插入嵌套分栏布局',
        priority: 5,
        tags: ['columns', 'nested', 'layout', 'insert'],
        loaded: false,
        source: 'builtin'
    },

    // ===== Interaction Tools =====
    {
        name: 'askUserChoice',
        category: 'interaction',
        description: '向用户提问并获取选择',
        priority: 10,
        tags: ['user', 'choice', 'confirm', 'essential'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'highlight',
        category: 'interaction',
        description: '高亮显示文本范围',
        priority: 5,
        tags: ['highlight', 'visual', 'feedback'],
        loaded: false,
        source: 'builtin'
    },

    // ===== Document Structure Tools =====
    {
        name: 'convertBlock',
        category: 'document-structure',
        description: '转换块类型（段落/标题/引用/代码块/列表互转）',
        priority: 7,
        tags: ['convert', 'block', 'type', 'heading', 'list', 'essential'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'moveBlock',
        category: 'document-structure',
        description: '移动块到新位置（上移/下移/指定位置）',
        priority: 5,
        tags: ['move', 'block', 'reorder'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'setBlockAlignment',
        category: 'document-structure',
        description: '设置块的文本对齐方式（左/中/右/两端）',
        priority: 5,
        tags: ['align', 'text', 'block'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'formatText',
        category: 'document-structure',
        description: '为已有文本应用内联格式（加粗/斜体/下划线/删除线/代码）',
        priority: 7,
        tags: ['format', 'bold', 'italic', 'underline', 'essential'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'insertTable',
        category: 'document-structure',
        description: '插入新表格，可指定行列数和是否含表头',
        priority: 6,
        tags: ['table', 'insert', 'create'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'getTableInfo',
        category: 'document-structure',
        description: '获取文档中表格的结构信息和单元格内容',
        priority: 5,
        tags: ['table', 'info', 'read'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'editTable',
        category: 'document-structure',
        description: '表格结构操作（添加/删除行列、合并/拆分单元格）',
        priority: 6,
        tags: ['table', 'edit', 'row', 'column'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'editTableCell',
        category: 'document-structure',
        description: '编辑表格中指定单元格的内容',
        priority: 5,
        tags: ['table', 'cell', 'edit', 'content'],
        loaded: false,
        source: 'builtin'
    },
]

/**
 * Get category info from tool metadata
 */
export function getCategoryInfo(tools: ToolMetadata[]): CategoryInfo[] {
    const categoryMap = new Map<ToolCategory, { total: number; loaded: number }>()

    for (const tool of tools) {
        const info = categoryMap.get(tool.category) || { total: 0, loaded: 0 }
        info.total++
        if (tool.loaded) info.loaded++
        categoryMap.set(tool.category, info)
    }

    return Array.from(categoryMap.entries()).map(([category, info]) => ({
        category,
        description: CATEGORY_DESCRIPTIONS[category],
        toolCount: info.total,
        loadedCount: info.loaded
    }))
}

/**
 * Check if a tool is essential
 */
export function isEssentialTool(toolName: string): boolean {
    return (ESSENTIAL_TOOLS as readonly string[]).includes(toolName)
}
