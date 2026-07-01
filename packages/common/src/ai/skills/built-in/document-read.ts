/**
 * Document Read Skill (always-on)
 *
 * Provides document reading and navigation capabilities: get structure,
 * read content chunks, search, get current selection, and undo changes.
 * Tagged `always-on` because almost every task needs to read the document.
 */

import type { Skill } from '../../types'

export const documentReadSkill: Skill = {
    name: 'document-read',
    description: 'Read and navigate document structure, search content, and undo changes.',
    requiredTools: ['getDocumentStructure', 'readChunk', 'searchInDocument', 'getSelection', 'undo'],
    systemPromptFragment: 'You have access to document reading tools: get document structure, read content chunks, search within the document, get current selection, and undo changes.',
    tags: ['always-on', 'read', 'document'],
    source: 'builtin'
}
