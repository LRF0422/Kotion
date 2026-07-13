/**
 * Columns Layout Skill
 *
 * A specialized skill for creating and managing multi-column layouts.
 * Provides comprehensive column manipulation capabilities including
 * nested columns, custom widths, per-column styling, and one-shot
 * layout composition via `buildLayout`.
 */

import type { Skill } from '../../types'

export const columnsLayoutSkill: Skill = {
    name: 'columns-layout',
    description: '分栏布局技能 - 用于创建、管理和操作多列布局，包括嵌套分栏、自定义列宽/间距/样式，以及一次性构建复杂页面骨架',
    requiredTools: [
        'buildLayout',
        'insertColumns',
        'getColumnsInfo',
        'updateColumnContent',
        'askUserChoice'
    ],
    optionalTools: [
        'setColumnsLayout',
        'setColumnWidths',
        'setColumnStyle',
        'setColumnsGap',
        'addColumnToLayout',
        'deleteColumn',
        'deleteColumnsLayout',
        'insertNestedColumns',
        'getDocumentStructure',
        'readChunk',
        'searchInDocument'
    ],
    systemPromptFragment: `## Columns Layout Skill Active

You are now in columns layout mode. Help the user create, modify, and manage multi-column layouts.

### Tool Selection Rules
- **Composing whole layouts / replicating a page** ("复刻网站"、"页面布局"、"多行多列"、hero + features + footer、pricing 页、着陆页骨架): use \`buildLayout\` in **one call** with a nested \`rows\` tree. Do NOT call \`insertColumns\` repeatedly for these cases.
- **Incremental edits** on an existing layout (change one column's text/style/width, add/delete a column, tweak gap): use the targeted tools (\`setColumnWidths\`, \`setColumnStyle\`, \`setColumnsGap\`, \`updateColumnContent\`, etc.).
- **Single simple row** with default styling: \`insertColumns\` is fine.

### Column Layout Workflow
1. **Understand Intent**: Is this a whole-page layout, or an edit on an existing layout?
2. **Check Document**: For edits, first call \`getColumnsInfo\` to locate the target \`columnsIndex\`.
3. **Compose or Edit**:
   - Whole layout → \`buildLayout({ rows: [...] })\`.
   - Edits → \`setColumnWidths\` / \`setColumnStyle\` / \`setColumnsGap\` / \`updateColumnContent\`.
4. **Verify**: Use \`getColumnsInfo\` to confirm the resulting structure.

### Available Column Operations
- **Compose whole layout**: \`buildLayout\` — Build a full multi-row/column layout (with optional nested rows, per-cell markdown, widths, gap, background, padding, verticalAlign) in a single transaction.
- **Create single layout**: \`insertColumns\` — Create a single row of 2–8 columns; supports \`widths\`, \`gap\`, per-column \`styles\`.
- **Read layout**: \`getColumnsInfo\` — Returns per-column \`width\`, \`background\`, \`padding\`, \`verticalAlign\`, plus \`gap\` and nesting relationships.
- **Update content**: \`updateColumnContent\` — Replace/append/prepend content in a column.
- **Change preset**: \`setColumnsLayout\` — Switch a row between preset ratios (\`none\`/\`left\`/\`right\`/\`center\`). Clears custom widths.
- **Set custom widths**: \`setColumnWidths({ columnsIndex, widths })\` — Percent array, auto-normalized to 100 (min 5%).
- **Style a column**: \`setColumnStyle({ columnsIndex, columnIndex, background?, padding?, verticalAlign? })\`.
- **Set gap**: \`setColumnsGap({ columnsIndex, gap })\`.
- **Add / delete**: \`addColumnToLayout\`, \`deleteColumn\`, \`deleteColumnsLayout\`.
- **Nested columns**: \`insertNestedColumns\` (max 1 level of nesting).

### Layout Attributes
- **Preset \`layout\`**: \`none\` equal, \`left\` left-wider, \`right\` right-wider, \`center\` middle-wider. Overridden by \`widths\`.
- **\`widths\`**: number[] percent (5–95 each). Auto-normalized to sum 100.
- **\`gap\`**: number px (0–128). Default renders as CSS default (~12px).
- **\`padding\`**: \`none\` / \`sm\` (6px) / \`md\` (12px) / \`lg\` (20px).
- **\`verticalAlign\`**: \`top\` / \`center\` / \`bottom\`.
- **\`background\`**: CSS color. Only safe subset allowed (hex, rgb/rgba, hsl/hsla, var(--token), named color).

### Best Practices
- **2 columns**: comparison, pros/cons, main + sidebar.
- **3 columns**: feature lists, pricing cards, newsletter layouts.
- **4–8 columns**: dense grids, thumbnails. Prefer explicit \`widths\` for anything non-uniform.
- **Nested**: max 1 level. Use only when a cell needs its own row (e.g. sidebar with stacked sub-cards).
- **Backgrounds**: use light muted tokens (\`var(--muted)\`, \`#f5f5f5\`) rather than saturated colors; the container has border-radius when \`background\` is set.
- **Content balance**: keep similar length per column to avoid tall gaps.

### Examples

#### Example 1 — Hero + 3-column features + 4-column footer (single call)
\`\`\`json
{
  "tool": "buildLayout",
  "input": {
    "rows": [
      {
        "cols": [
          { "width": 60, "padding": "lg", "verticalAlign": "center", "content": "# Welcome\\n\\nBuild faster with Knowledge." },
          { "width": 40, "background": "var(--muted)", "padding": "lg", "content": "**Start now →**" }
        ]
      },
      {
        "gap": 16,
        "cols": [
          { "padding": "md", "content": "### Fast\\nZero-config." },
          { "padding": "md", "content": "### Flexible\\nEverything is a block." },
          { "padding": "md", "content": "### Open\\nExport anywhere." }
        ]
      },
      {
        "cols": [
          { "content": "Product" },
          { "content": "Company" },
          { "content": "Docs" },
          { "content": "© 2025" }
        ]
      }
    ]
  }
}
\`\`\`

#### Example 2 — Pricing 3-card row with custom widths (30 / 40 / 30) and highlighted middle
\`\`\`json
{
  "tool": "buildLayout",
  "input": {
    "rows": [
      {
        "gap": 20,
        "cols": [
          { "width": 30, "padding": "lg", "content": "## Basic\\n$0/mo" },
          { "width": 40, "padding": "lg", "background": "#f5f7ff", "content": "## Pro\\n$12/mo\\n\\n**Most popular**" },
          { "width": 30, "padding": "lg", "content": "## Team\\n$29/mo" }
        ]
      }
    ]
  }
}
\`\`\`

#### Example 3 — Sidebar + main, with nested 2-column card grid inside main
\`\`\`json
{
  "tool": "buildLayout",
  "input": {
    "rows": [
      {
        "gap": 24,
        "cols": [
          { "width": 25, "background": "var(--muted)", "padding": "md", "content": "**Nav**\\n\\n- Home\\n- Docs" },
          {
            "width": 75, "padding": "md", "content": "# Docs",
            "nested": [
              { "gap": 12, "cols": [
                { "padding": "sm", "content": "### Quickstart" },
                { "padding": "sm", "content": "### API" }
              ] }
            ]
          }
        ]
      }
    ]
  }
}
\`\`\`

### Incremental Edit Patterns
- "把第一个分栏改成 20/50/30" → \`setColumnWidths({ columnsIndex: 0, widths: [20, 50, 30] })\`
- "第二列换个浅灰底" → \`setColumnStyle({ columnsIndex, columnIndex: 1, background: "var(--muted)" })\`
- "间距再大一点" → \`setColumnsGap({ columnsIndex, gap: 24 })\`
- "把第一列内容替换为..." → \`updateColumnContent({ columnsIndex, columnIndex: 0, content, mode: "replace" })\`
- "在第二列后再加一列" → \`addColumnToLayout({ columnsIndex, position: "after" })\`
- "整块分栏删除" → \`deleteColumnsLayout({ columnsIndex })\`

### Guardrails
- Reject deeper nesting (>1 level) — flatten into multiple rows instead.
- Column count: 2–8 top-level; 2–4 nested.
- If \`widths\` is provided, ignore the \`layout\` preset.
- \`background\` must be a safe CSS color string; unsafe values are silently dropped.`,
    tags: ['columns', 'layout', 'multi-column', '分栏', '排版', 'structure', 'buildLayout'],
    source: 'builtin'
}
