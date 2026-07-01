/**
 * Document Write Skill
 *
 * Write, insert, and replace document content including links,
 * block structure changes, horizontal rules, and details blocks.
 */

import type { Skill } from '../../types'

export const documentWriteSkill: Skill = {
    name: 'document-write',
    description: 'Write, insert, and replace document content including links and block structure changes.',
    requiredTools: [
        'updateTitle',
        'write',
        'insertNear',
        'replaceContent',
        'insertLink',
        'removeLink',
        'replaceRange',
        'insertHorizontalRule',
        'insertDetails',
        'convertBlock',
        'moveBlock'
    ],
    systemPromptFragment: 'You have access to document writing tools: update title, write content, insert near matching text, find-and-replace content, insert/remove links, replace text ranges precisely, insert horizontal rules, insert collapsible details blocks, convert block types, and move blocks by blockId.',
    tags: ['write', 'edit', 'content', 'document'],
    source: 'builtin'
}
