/**
 * Document Read Skill (always-on)
 *
 * Provides document reading and navigation capabilities: get structure,
 * read content chunks, search, look at an embedded image, get the current
 * selection, and undo changes.
 * Tagged `always-on` because almost every task needs to read the document.
 */

import type { Skill } from '../../types'

export const documentReadSkill: Skill = {
    name: 'document-read',
    description: 'Read and navigate document structure, search content, and undo changes.',
    requiredTools: ['getDocumentStructure', 'readChunk', 'searchInDocument', 'getSelection', 'undo'],
    // Reading is the one capability the model needs unprompted, so the tools stay
    // advertised; the skill only supplies the prose that makes them usable.
    optionalTools: ['readImage'],
    systemPromptFragment: 'You have access to document reading tools: get document structure, read content chunks, search within the document, '
        + 'look at an image embedded in the document (readImage — it hands the image to your own vision, so use it instead of guessing what a picture shows), '
        + 'get current selection, and undo changes.',
    tags: ['always-on', 'read', 'document'],
    source: 'builtin'
}
