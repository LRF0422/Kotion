/**
 * Skill System Types
 *
 * Skills are high-level capability abstractions that combine multiple tools
 * with specialized prompts to accomplish complex tasks. The frontend only
 * stores the catalog; activation is owned by the backend.
 */

import type { Skill } from '../types'

export interface SkillDefinition extends Skill {
    /** Unique identifier */
    id: string
    /** Display name */
    displayName: string
}
