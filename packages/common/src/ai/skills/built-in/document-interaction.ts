/**
 * Document Interaction Skill
 *
 * Interact with the user for choices (askUserChoice) and
 * highlight document elements visually (highlight).
 */

import type { Skill } from '../../types'

export const documentInteractionSkill: Skill = {
    name: 'document-interaction',
    description: 'Interact with the user for choices and highlight document elements.',
    requiredTools: ['askUserChoice', 'highlight'],
    systemPromptFragment: 'You have access to interaction tools: ask the user a question and get their choice/confirmation, and highlight text ranges visually in the document for feedback.',
    tags: ['interaction', 'user-choice', 'highlight', 'document'],
    source: 'builtin'
}
