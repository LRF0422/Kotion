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
    'getDocumentStructure',
    'searchInDocument',
    'readChunk',
    // Write tools
    'updateTitle',
    'write',
    'insertNear',
    'replaceContent',
    // Delete tools
    'deleteBySearch',
    'deleteBlock',
    'clearDocument',
    // Interaction tools
    'askUserChoice',
    // Structure tools
    'convertBlock',
    'formatText',
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
        description: '获取文档整体结构，包括标题、段落、块信息和文档大小',
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
        description: '在指定块后插入内容，支持 Markdown，不填 blockIndex 则追加到末尾',
        priority: 10,
        tags: ['write', 'insert', 'text', 'essential'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'insertNear',
        category: 'document-write',
        description: '在匹配文本附近插入内容，支持 before/after/start/end 定位',
        priority: 10,
        tags: ['insert', 'near', 'relative', 'essential'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'replaceContent',
        category: 'document-write',
        description: '查找并替换内容，支持全部替换',
        priority: 10,
        tags: ['replace', 'find', 'update', 'essential'],
        loaded: false,
        source: 'builtin'
    },

    // ===== Document Delete Tools =====
    {
        name: 'deleteBySearch',
        category: 'document-delete',
        description: '搜索并删除匹配的内容，支持文本或整块删除',
        priority: 8,
        tags: ['delete', 'search', 'match', 'essential'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'deleteBlock',
        category: 'document-delete',
        description: '按块索引删除整个块',
        priority: 8,
        tags: ['delete', 'block', 'index', 'essential'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'clearDocument',
        category: 'document-delete',
        description: '清空文档内容，默认保留标题',
        priority: 8,
        tags: ['clear', 'document', 'reset', 'essential'],
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
        name: 'listTable',
        category: 'document-structure',
        description: '列出文档中所有表格的概览信息，包括索引、行列数和表头预览',
        priority: 6,
        tags: ['table', 'list', 'read', 'overview'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'deleteTable',
        category: 'document-delete',
        description: '删除文档中指定的表格',
        priority: 6,
        tags: ['table', 'delete', 'remove'],
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

    // ===== Callout (InfoPanel) Tools =====
    {
        name: 'insertCallout',
        category: 'document-structure',
        description: '插入高亮提示框（Callout），支持 info/success/warning/error/tip/bookmark/default 类型',
        priority: 7,
        tags: ['callout', 'infopanel', 'insert', 'highlight', 'tip', 'warning', 'note'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'getCalloutInfo',
        category: 'document-structure',
        description: '获取文档中所有提示框的信息（位置、类型、内容）',
        priority: 6,
        tags: ['callout', 'infopanel', 'info', 'read', 'query'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'updateCalloutType',
        category: 'document-structure',
        description: '修改提示框的类型（如将 info 改为 warning）',
        priority: 5,
        tags: ['callout', 'infopanel', 'update', 'type'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'updateCalloutContent',
        category: 'document-structure',
        description: '更新提示框的文本内容',
        priority: 5,
        tags: ['callout', 'infopanel', 'update', 'content'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'deleteCallout',
        category: 'document-structure',
        description: '删除指定的提示框',
        priority: 5,
        tags: ['callout', 'infopanel', 'delete', 'remove'],
        loaded: false,
        source: 'builtin'
    },

    // ===== Link Tools =====
    {
        name: 'insertLink',
        category: 'document-write',
        description: '在指定文本上插入超链接',
        priority: 8,
        tags: ['link', 'hyperlink', 'url'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'removeLink',
        category: 'document-write',
        description: '移除指定文本上的超链接',
        priority: 8,
        tags: ['link', 'unlink'],
        loaded: false,
        source: 'builtin'
    },

    // ===== Rich Content Tools =====
    {
        name: 'setTextColor',
        category: 'document-structure',
        description: '设置文本颜色',
        priority: 6,
        tags: ['color', 'text', 'format'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'setHighlightColor',
        category: 'document-structure',
        description: '设置文本高亮背景色',
        priority: 6,
        tags: ['highlight', 'background', 'color'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'removeColor',
        category: 'document-structure',
        description: '移除文本颜色和高亮色',
        priority: 6,
        tags: ['color', 'remove', 'format'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'insertHorizontalRule',
        category: 'document-write',
        description: '插入水平分割线',
        priority: 6,
        tags: ['divider', 'horizontal-rule', 'separator'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'insertDetails',
        category: 'document-write',
        description: '插入可折叠/展开的详情块',
        priority: 6,
        tags: ['details', 'collapsible', 'toggle'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'indentListItem',
        category: 'document-structure',
        description: '增加列表项的缩进层级',
        priority: 7,
        tags: ['list', 'indent', 'nesting'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'outdentListItem',
        category: 'document-structure',
        description: '减少列表项的缩进层级',
        priority: 7,
        tags: ['list', 'outdent', 'nesting'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'setCodeBlockLanguage',
        category: 'document-structure',
        description: '设置代码块的编程语言',
        priority: 7,
        tags: ['code', 'language', 'syntax'],
        loaded: false,
        source: 'builtin'
    },

    // ===== History Tools =====
    {
        name: 'undo',
        category: 'interaction',
        description: '撤销上一步操作',
        priority: 9,
        tags: ['undo', 'history', 'recovery'],
        loaded: false,
        source: 'builtin'
    },

    // ===== Selection Tools =====
    {
        name: 'getSelection',
        category: 'document-read',
        description: '获取当前选区位置和选中内容',
        priority: 8,
        tags: ['selection', 'cursor', 'position'],
        loaded: false,
        source: 'builtin'
    },

    // ===== Range Tools =====
    {
        name: 'replaceRange',
        category: 'document-write',
        description: '在精确位置范围内替换文本内容',
        priority: 9,
        tags: ['edit', 'replace', 'position', 'precision'],
        loaded: false,
        source: 'builtin'
    },
    {
        name: 'formatRange',
        category: 'document-structure',
        description: '在精确位置范围内应用格式',
        priority: 9,
        tags: ['format', 'position', 'precision'],
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
