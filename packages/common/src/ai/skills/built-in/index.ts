/**
 * Built-in Skills Export
 */

export { capabilityDiscoverySkill } from './capability-discovery'
export { generalAssistantSkill } from './general-assistant'
export { documentEditingSkill } from './document-editing'
export { documentRefactorSkill } from './document-refactor'
export { contentAnalysisSkill } from './content-analysis'
export { writingImprovementSkill } from './writing-improvement'
export { translationSkill } from './translation'
export { contentGenerationSkill } from './content-generation'
export { formattingLayoutSkill } from './formatting-layout'
export { columnsLayoutSkill } from './columns-layout'
export { documentReadSkill } from './document-read'
export { documentWriteSkill } from './document-write'
export { documentDeleteSkill } from './document-delete'
export { documentFormatSkill } from './document-format'
export { documentTableSkill } from './document-table'
export { documentLayoutSkill } from './document-layout'
export { documentCalloutSkill } from './document-callout'
export { documentColorSkill } from './document-color'
export { documentInteractionSkill } from './document-interaction'

import { capabilityDiscoverySkill } from './capability-discovery'
import { generalAssistantSkill } from './general-assistant'
import { documentEditingSkill } from './document-editing'
import { documentRefactorSkill } from './document-refactor'
import { contentAnalysisSkill } from './content-analysis'
import { writingImprovementSkill } from './writing-improvement'
import { translationSkill } from './translation'
import { contentGenerationSkill } from './content-generation'
import { formattingLayoutSkill } from './formatting-layout'
import { columnsLayoutSkill } from './columns-layout'
import { documentReadSkill } from './document-read'
import { documentWriteSkill } from './document-write'
import { documentDeleteSkill } from './document-delete'
import { documentFormatSkill } from './document-format'
import { documentTableSkill } from './document-table'
import { documentLayoutSkill } from './document-layout'
import { documentCalloutSkill } from './document-callout'
import { documentColorSkill } from './document-color'
import { documentInteractionSkill } from './document-interaction'
import type { Skill } from '../../types'

/**
 * All built-in skills
 */
export const builtinSkills: Skill[] = [
    // Client-owned mechanism description: how the model reaches a skill's tools.
    capabilityDiscoverySkill,
    // The agent's identity. The backend persona is deliberately domain-blind,
    // so the client owns "who you are" too — and the answer is "a general
    // assistant", not "a document editor".
    generalAssistantSkill,
    // Document editing is a CAPABILITY (tagged `capability:document`), not the
    // identity: its prose is eager only while a document target is in play and
    // otherwise arrives through `load_skill` when the task actually needs it.
    documentEditingSkill,
    documentRefactorSkill,
    contentAnalysisSkill,
    writingImprovementSkill,
    translationSkill,
    contentGenerationSkill,
    formattingLayoutSkill,
    columnsLayoutSkill,
    documentReadSkill,
    documentWriteSkill,
    documentDeleteSkill,
    documentFormatSkill,
    documentTableSkill,
    documentLayoutSkill,
    documentCalloutSkill,
    documentColorSkill,
    documentInteractionSkill
]
