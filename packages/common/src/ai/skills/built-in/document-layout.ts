/**
 * Document Layout Skill
 *
 * Manage multi-column layouts and column structure in the document:
 * compose whole page layouts, create columns, get column info, update
 * column content, set width ratios / custom widths / gap / per-column
 * styling, add columns, delete columns/layouts, and insert nested
 * column layouts.
 */

import type { Skill } from '../../types'

export const documentLayoutSkill: Skill = {
    name: 'document-layout',
    description: 'Manage multi-column layouts and column structure in the document.',
    requiredTools: [
        'buildLayout',
        'insertColumns',
        'getColumnsInfo',
        'updateColumnContent',
        'setColumnsLayout',
        'setColumnWidths',
        'setColumnStyle',
        'setColumnsGap',
        'addColumnToLayout',
        'deleteColumn',
        'deleteColumnsLayout',
        'insertNestedColumns'
    ],
    systemPromptFragment: 'You have access to column layout tools. For composing whole page layouts (hero + features + footer, pricing rows, landing pages, "replicate a website"), prefer `buildLayout` in a single call with a nested `rows` tree — each cell supports markdown content, width percent, gap, background, padding, verticalAlign, and one optional level of nested rows. For incremental edits use targeted tools: create a single row (`insertColumns` 2–8 cols with optional widths/gap/styles), read layout (`getColumnsInfo`), update column content (replace/append/prepend), set custom widths (`setColumnWidths`), per-column styling (`setColumnStyle`: background/padding/verticalAlign), row gap (`setColumnsGap`), switch preset ratios (`setColumnsLayout`: none/left/right/center), add columns, delete individual columns, delete entire column layouts, and insert one level of nested column layouts.',
    tags: ['layout', 'columns', 'structure', 'document', 'buildLayout'],
    source: 'builtin'
}
