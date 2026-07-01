/**
 * Document Format Skill
 *
 * Format text styles (bold/italic/underline/strikethrough/code),
 * set block alignment, configure code block language, and
 * indent/outdent list items.
 */

import type { Skill } from '../../types'

export const documentFormatSkill: Skill = {
    name: 'document-format',
    description: 'Format text styles, alignment, code block language, and list indentation.',
    requiredTools: [
        'formatText',
        'formatRange',
        'setBlockAlignment',
        'setCodeBlockLanguage',
        'indentListItem',
        'outdentListItem'
    ],
    systemPromptFragment: 'You have access to document formatting tools: apply inline formats (bold/italic/underline/strikethrough/code), format text by precise position range, set block text alignment (left/center/right/justify), set code block programming language, and indent/outdent list items.',
    tags: ['format', 'style', 'alignment', 'document'],
    source: 'builtin'
}
