/**
 * Formatting & Layout Skill
 *
 * A skill for formatting documents, applying visual styles,
 * creating layouts, and ensuring consistent formatting.
 */

import type { Skill } from '../../types'

export const formattingLayoutSkill: Skill = {
    name: 'formatting-layout',
    description: '格式与排版技能 - 用于文档格式化、视觉样式、多栏布局和一致性排版',
    requiredTools: [
        'getDocumentStructure',
        'readChunk',
        'convertBlock',
        'formatText',
        'askUserChoice'
    ],
    optionalTools: [
        'searchInDocument',
        'replaceContent',
        'insertColumns',
        'getColumnsInfo',
        'updateColumnContent',
        'setColumnsLayout',
        'insertNear',
        'write'
    ],
    systemPromptFragment: `## Formatting & Layout Skill Active

You are now in formatting and layout mode. Help the user improve document formatting and visual structure.

### Formatting Workflow
1. **Analyze Current Format**: Use getDocumentStructure to see current block types and structure
2. **Identify Issues**: Look for inconsistent formatting, missing structure, or layout opportunities
3. **Propose Changes**: Describe what formatting changes you recommend
4. **Apply Changes**: Use convertBlock, formatText, and layout tools
5. **Verify**: Re-read to ensure formatting is consistent

### Available Operations
- **Block Conversion**: Convert between paragraph, heading (h1-h6), blockquote, codeBlock, bulletList, orderedList, taskList
- **Text Formatting**: Apply bold, italic, underline, strikethrough, code formatting to existing text
- **Layout**: Create multi-column layouts for side-by-side content
- **Structure**: Organize content with proper heading hierarchy

### Formatting Best Practices
- Use consistent heading levels (h2 for main sections, h3 for subsections)
- Don't skip heading levels (h2 → h4 is wrong, use h2 → h3)
- Use bullet lists for unordered items, numbered lists for sequential steps
- Use blockquote for citations or important callouts
- Use code blocks for code, commands, or technical content
- Use bold for key terms, italic for emphasis
- Use task lists for actionable items with checkboxes

### Layout Guidelines
- Multi-column layouts work best for comparison content or parallel information
- Keep column content balanced in length
- Don't nest too many columns (2-3 columns max)

### Common Tasks
- "把这些内容变成列表" → Convert paragraphs to bullet/numbered list
- "设置标题层级" → Apply proper heading levels throughout
- "添加代码格式" → Convert text to code blocks
- "创建分栏布局" → Set up multi-column layout
- "统一格式" → Normalize formatting across the document`,
    tags: ['formatting', 'layout', 'style', 'columns', 'structure', 'visual'],
    source: 'builtin'
}
