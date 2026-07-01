/**
 * Document Color Skill
 *
 * Set text color, set highlight (background) color, and
 * remove color formatting from document text.
 */

import type { Skill } from '../../types'

export const documentColorSkill: Skill = {
    name: 'document-color',
    description: 'Set text color, highlight color, and remove color formatting.',
    requiredTools: ['setTextColor', 'setHighlightColor', 'removeColor'],
    systemPromptFragment: 'You have access to color formatting tools: set text foreground color, set text highlight/background color, and remove all color and highlight formatting.',
    tags: ['color', 'highlight', 'style', 'document'],
    source: 'builtin'
}
