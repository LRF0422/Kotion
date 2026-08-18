/**
 * Document Delete Skill
 *
 * Precise deletion: matched text, whole blocks by blockId,
 * a span between two anchors, an exact position range,
 * or clearing the entire document / deleting tables.
 */

import type { Skill } from '../../types'

export const documentDeleteSkill: Skill = {
    name: 'document-delete',
    description: 'Delete content precisely: matched text, blocks by blockId, a section between anchors, or the whole document.',
    requiredTools: ['deleteText', 'deleteBlocks', 'deleteBlocksBetween', 'deleteRange', 'clearDocument', 'deleteTable'],
    systemPromptFragment: 'You have precise deletion tools: deleteText removes matched text only (when several matches exist, disambiguate with blockId or occurrence, or set deleteAllMatches); deleteBlocks removes whole blocks by blockId (batch, single transaction, fails fast on missing ids); deleteBlocksBetween removes the span between two anchor blocks (section deletion); deleteRange removes an exact from/to range (pass expectedText for self-healing); clearDocument wipes the document keeping the title. Never delete the title — use updateTitle instead.',
    tags: ['delete', 'remove', 'document'],
    source: 'builtin'
}
