/**
 * Built-in Skills Export
 */

export { documentRefactorSkill } from './document-refactor'
export { contentAnalysisSkill } from './content-analysis'

import { documentRefactorSkill } from './document-refactor'
import { contentAnalysisSkill } from './content-analysis'
import type { Skill } from '../../types'

/**
 * All built-in skills
 */
export const builtinSkills: Skill[] = [
    documentRefactorSkill,
    contentAnalysisSkill
]
