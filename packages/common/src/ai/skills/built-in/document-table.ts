/**
 * Document Table Skill
 *
 * Create and edit tables in the document: insert tables,
 * list existing tables, get table info, perform structural
 * table operations (add/remove rows/columns, merge/split cells),
 * and edit individual cell content.
 */

import type { Skill } from '../../types'

export const documentTableSkill: Skill = {
    name: 'document-table',
    description: 'Create and edit tables in the document.',
    requiredTools: ['insertTable', 'listTable', 'getTableInfo', 'editTable', 'editTableCell'],
    systemPromptFragment: 'You have access to table tools: insert new tables (with configurable rows/columns/header), list all tables with overview info, get detailed table structure and cell content, perform structural table operations (add/remove rows and columns, merge/split cells), and edit individual cell content.',
    tags: ['table', 'document'],
    source: 'builtin'
}
