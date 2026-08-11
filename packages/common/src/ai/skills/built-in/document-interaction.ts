/**
 * Document Interaction Skill
 *
 * Interact with the user for choices (askUserChoice), highlight document
 * elements visually (highlight), and cite document blocks as clickable
 * references in the chat reply (referenceBlocks).
 */

import type { Skill } from '../../types'

export const documentInteractionSkill: Skill = {
    name: 'document-interaction',
    description: 'Interact with the user for choices, highlight document elements, and cite document blocks as clickable references.',
    requiredTools: ['askUserChoice', 'highlight', 'referenceBlocks'],
    systemPromptFragment: 'You have access to interaction tools: ask the user a question and get their choice/confirmation, highlight text ranges visually in the document for feedback, and call referenceBlocks with blockIds (from getDocumentStructure/searchInDocument) so the chat renders clickable citation chips that jump to the referenced blocks — use it whenever your answer points at specific places in the document.',
    tags: ['interaction', 'user-choice', 'highlight', 'reference', 'document'],
    source: 'builtin'
}
