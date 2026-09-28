/**
 * SkillProvider - Pure Skill Catalog
 *
 * Holds registered skills (built-in, plugin, user-installed). Their prompt
 * fragments and owned tool names ship inline with every chat request; there is
 * no activation step on either side.
 */

import type { Skill, ReloadCallback } from '../types'
import type { SkillDefinition } from '../skills/types'

interface SkillProviderOptions {
    onReload?: ReloadCallback
}

export class SkillProvider {
    private onReload?: ReloadCallback

    private skills: Map<string, SkillDefinition> = new Map()

    // Version tracking for reactive UI updates
    private version: number = 0

    constructor(options: SkillProviderOptions = {}) {
        this.onReload = options.onReload
    }

    /**
     * Register a single skill. If a skill with the same name already exists it
     * is replaced (last-write-wins).
     */
    registerSkill(skill: Skill): void {
        const definition: SkillDefinition = {
            ...skill,
            id: skill.name,
            displayName: skill.name,
        }

        this.skills.set(skill.name, definition)
        this.incrementVersion()
    }

    /**
     * Register multiple skills in a single batch (only one version bump).
     */
    registerSkills(skills: Skill[]): void {
        if (skills.length === 0) return
        for (const skill of skills) {
            const definition: SkillDefinition = {
                ...skill,
                id: skill.name,
                displayName: skill.name,
            }
            this.skills.set(skill.name, definition)
        }
        this.incrementVersion()
    }

    /**
     * Unregister a skill by name.
     */
    unregisterSkill(skillName: string): void {
        if (this.skills.delete(skillName)) {
            this.incrementVersion()
        }
    }

    /**
     * Get all registered skills.
     */
    getAllSkills(): SkillDefinition[] {
        return Array.from(this.skills.values())
    }

    /**
     * Get a specific skill by name.
     */
    getSkill(skillName: string): SkillDefinition | undefined {
        return this.skills.get(skillName)
    }

    /**
     * Filter skills by tag.
     */
    getSkillsByTag(tag: string): SkillDefinition[] {
        return Array.from(this.skills.values())
            .filter(skill => skill.tags?.includes(tag))
    }

    /**
     * Filter skills by source.
     */
    getSkillsBySource(source: 'builtin' | 'plugin'): SkillDefinition[] {
        return Array.from(this.skills.values())
            .filter(skill => skill.source === source)
    }

    /**
     * Current catalog version.
     */
    getVersion(): number {
        return this.version
    }

    private incrementVersion(): void {
        this.version++
        this.onReload?.()
    }
}
