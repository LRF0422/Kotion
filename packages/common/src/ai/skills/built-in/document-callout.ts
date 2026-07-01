/**
 * Document Callout Skill
 *
 * Insert and manage callout (InfoPanel) blocks in the document:
 * insert callouts with various types, get callout info, update
 * callout type and content, and delete callouts.
 */

import type { Skill } from '../../types'

export const documentCalloutSkill: Skill = {
    name: 'document-callout',
    description: 'Insert and manage callout blocks in the document.',
    requiredTools: ['insertCallout', 'getCalloutInfo', 'updateCalloutType', 'updateCalloutContent', 'deleteCallout'],
    systemPromptFragment: 'You have access to callout tools: insert highlight callout blocks (info/success/warning/error/tip/bookmark/default types), get info about all callouts in the document, update callout type (e.g. info to warning), update callout text content, and delete callouts.',
    tags: ['callout', 'annotation', 'document'],
    source: 'builtin'
}
