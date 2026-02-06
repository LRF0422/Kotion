/**
 * Skill System Types
 *
 * Skills are high-level capability abstractions that combine multiple tools
 * with specialized prompts to accomplish complex tasks.
 */

import type { Skill } from '../types'

export interface SkillDefinition extends Skill {
    /** Unique identifier */
    id: string
    /** Display name */
    displayName: string
    /** Whether the skill is currently active */
    active: boolean
}

export interface SkillRegistryState {
    skills: Map<string, SkillDefinition>
    activeSkills: Set<string>
}

export interface SkillActivationOptions {
    /** Force reload tools even if already loaded */
    forceReload?: boolean
    /** Skip optional tools */
    skipOptional?: boolean
}

export interface SkillDeactivationResult {
    success: boolean
    skillName: string
    unloadedTools: string[]
    message: string
}
