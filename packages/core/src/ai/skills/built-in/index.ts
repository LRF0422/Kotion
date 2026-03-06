/**
 * Built-in Skills Export
 */

export { documentRefactorSkill } from './document-refactor'
export { contentAnalysisSkill } from './content-analysis'
export { writingImprovementSkill } from './writing-improvement'
export { translationSkill } from './translation'
export { contentGenerationSkill } from './content-generation'
export { formattingLayoutSkill } from './formatting-layout'

import { documentRefactorSkill } from './document-refactor'
import { contentAnalysisSkill } from './content-analysis'
import { writingImprovementSkill } from './writing-improvement'
import { translationSkill } from './translation'
import { contentGenerationSkill } from './content-generation'
import { formattingLayoutSkill } from './formatting-layout'
import type { Skill } from '../../types'

/**
 * All built-in skills
 */
export const builtinSkills: Skill[] = [
    documentRefactorSkill,
    contentAnalysisSkill,
    writingImprovementSkill,
    translationSkill,
    contentGenerationSkill,
    formattingLayoutSkill
]
