/**
 * Columns Layout Skill
 *
 * A specialized skill for creating and managing multi-column layouts.
 * Provides comprehensive column manipulation capabilities including
 * nested columns, layout changes, and content management.
 */

import type { Skill } from '../../types'

export const columnsLayoutSkill: Skill = {
    name: 'columns-layout',
    description: '分栏布局技能 - 用于创建、管理和操作多列布局，包括嵌套分栏、布局切换和列内容编辑',
    requiredTools: [
        'insertColumns',
        'getColumnsInfo',
        'updateColumnContent',
        'askUserChoice'
    ],
    optionalTools: [
        'setColumnsLayout',
        'addColumnToLayout',
        'deleteColumn',
        'deleteColumnsLayout',
        'insertNestedColumns',
        'getDocumentStructure',
        'readChunk',
        'searchInDocument'
    ],
    systemPromptFragment: `## Columns Layout Skill Active

You are now in columns layout mode. Help the user create, modify, and manage multi-column layouts in the document.

### Column Layout Workflow
1. **Understand Intent**: Determine what kind of layout the user needs (comparison, side-by-side, newsletter, etc.)
2. **Check Document**: Use getDocumentStructure or getColumnsInfo to understand current layout
3. **Create Layout**: Use insertColumns with appropriate column count and layout type
4. **Fill Content**: Use updateColumnContent to add content to each column
5. **Adjust Layout**: Use setColumnsLayout to change width ratios if needed
6. **Verify**: Use getColumnsInfo to confirm the layout is correct

### Available Column Operations
- **Create Layout**: \`insertColumns\` - Create 2-6 column layout with layout type
- **Read Layout**: \`getColumnsInfo\` - Get detailed info about all column layouts
- **Update Content**: \`updateColumnContent\` - Set, append, or prepend content in a column
- **Change Layout**: \`setColumnsLayout\` - Switch between 'none'(equal), 'left', 'right', 'center' width ratios
- **Add Column**: \`addColumnToLayout\` - Add a new column before or after current columns
- **Delete Column**: \`deleteColumn\` - Remove a specific column (minimum 2 columns remain)
- **Delete Layout**: \`deleteColumnsLayout\` - Remove entire column layout
- **Nested Columns**: \`insertNestedColumns\` - Create columns within a column for complex layouts

### Layout Types
- \`none\`: Equal-width columns (default)
- \`left\`: Left column wider (suitable for main content + sidebar)
- \`right\`: Right column wider (suitable for sidebar + main content)
- \`center\`: Center column wider (suitable for three-column layouts with emphasis)

### Best Practices
- **2 columns**: Best for comparison, pros/cons, main + sidebar
- **3 columns**: Best for feature lists, three-part comparisons, newsletter layouts
- **4+ columns**: Use sparingly, only for dense data or thumbnail grids
- **Nested columns**: Keep to 1 level of nesting; deep nesting hurts readability
- **Content balance**: Try to keep similar content length across columns
- **Layout choice**: Use 'left'/'right' for main+sidebar, 'none' for equal comparison

### Common Tasks
- "创建两栏布局" → insertColumns({ cols: 2 })
- "左右对比" → insertColumns({ cols: 2, layout: 'none' })
- "主内容+侧边栏" → insertColumns({ cols: 2, layout: 'left' })
- "三栏布局" → insertColumns({ cols: 3 })
- "在左列添加内容" → updateColumnContent({ columnsIndex, columnIndex: 0, content, mode: 'append' })
- "改变为左宽右窄" → setColumnsLayout({ columnsIndex, layout: 'left' })
- "添加嵌套分栏" → insertNestedColumns({ columnsIndex, columnIndex, cols: 2 })
- "删除分栏" → deleteColumnsLayout({ columnsIndex })`,
    tags: ['columns', 'layout', 'multi-column', '分栏', '排版', 'structure'],
    source: 'builtin'
}
