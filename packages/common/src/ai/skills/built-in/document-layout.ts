/**
 * Document Layout Skill
 *
 * Manage multi-column layouts and column structure in the document:
 * create columns, get column info, update column content, set
 * width ratios, add columns, delete columns/layouts, and
 * insert nested column layouts.
 */

import type { Skill } from '../../types'

export const documentLayoutSkill: Skill = {
    name: 'document-layout',
    description: 'Manage multi-column layouts and column structure in the document.',
    requiredTools: [
        'insertColumns',
        'getColumnsInfo',
        'updateColumnContent',
        'setColumnsLayout',
        'addColumnToLayout',
        'deleteColumn',
        'deleteColumnsLayout',
        'insertNestedColumns'
    ],
    systemPromptFragment: 'You have access to column layout tools: create multi-column layouts (2-6 columns with width ratios), get column layout info, update column content (replace/append/prepend), set column width ratios (equal/left-wide/right-wide/center-wide), add new columns, delete individual columns, delete entire column layouts, and insert nested column layouts within existing columns.',
    tags: ['layout', 'columns', 'structure', 'document'],
    source: 'builtin'
}
