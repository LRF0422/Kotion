/**
 * Document Delete Skill
 *
 * Delete document content by search, by block index,
 * clear the entire document, or delete tables.
 */

import type { Skill } from '../../types'

export const documentDeleteSkill: Skill = {
    name: 'document-delete',
    description: 'Delete document content by search, block, or clear entire document.',
    requiredTools: ['deleteBySearch', 'deleteBlock', 'clearDocument', 'deleteTable'],
    systemPromptFragment: 'You have access to document deletion tools: delete content by search match, delete entire blocks by index, clear the whole document (optionally preserving the title), and delete tables.',
    tags: ['delete', 'remove', 'document'],
    source: 'builtin'
}
