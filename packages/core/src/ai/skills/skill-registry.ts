/**
 * Skill Registry - Manages installed skills with persistence
 *
 * Supports both server-side storage (web) and local storage (desktop)
 */

import type { Skill } from '../types'

// Serializable skill format for storage/sharing
export interface SerializableSkill {
    id: string
    name: string
    displayName: string
    description: string
    version: string
    author?: string
    homepage?: string
    requiredTools: string[]
    optionalTools?: string[]
    systemPromptFragment?: string
    tags?: string[]
    createdAt?: string
    updatedAt?: string
}

// Skill installation status
export interface InstalledSkill extends SerializableSkill {
    installedAt: string
    enabled: boolean
    source: 'marketplace' | 'custom' | 'import'
    sourceUrl?: string
}

// Storage adapter interface
export interface SkillStorageAdapter {
    load(): Promise<InstalledSkill[]>
    save(skills: InstalledSkill[]): Promise<void>
    clear(): Promise<void>
}

// Local storage adapter (for desktop/browser)
export class LocalSkillStorage implements SkillStorageAdapter {
    private storageKey: string

    constructor(storageKey: string = 'kn_installed_skills') {
        this.storageKey = storageKey
    }

    async load(): Promise<InstalledSkill[]> {
        try {
            const data = localStorage.getItem(this.storageKey)
            return data ? JSON.parse(data) : []
        } catch (error) {
            console.error('Failed to load skills from local storage:', error)
            return []
        }
    }

    async save(skills: InstalledSkill[]): Promise<void> {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(skills))
        } catch (error) {
            console.error('Failed to save skills to local storage:', error)
            throw error
        }
    }

    async clear(): Promise<void> {
        localStorage.removeItem(this.storageKey)
    }
}

// API storage adapter (for web/server)
export class ApiSkillStorage implements SkillStorageAdapter {
    private apiBase: string
    private getHeaders: () => Record<string, string>

    constructor(
        apiBase: string = '/api/skills',
        getHeaders: () => Record<string, string> = () => ({})
    ) {
        this.apiBase = apiBase
        this.getHeaders = getHeaders
    }

    async load(): Promise<InstalledSkill[]> {
        try {
            const response = await fetch(`${this.apiBase}/installed`, {
                headers: this.getHeaders()
            })
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }
            const data = await response.json()
            return data.skills || []
        } catch (error) {
            console.error('Failed to load skills from API:', error)
            return []
        }
    }

    async save(skills: InstalledSkill[]): Promise<void> {
        const response = await fetch(`${this.apiBase}/installed`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...this.getHeaders()
            },
            body: JSON.stringify({ skills })
        })
        if (!response.ok) {
            throw new Error(`Failed to save skills: HTTP ${response.status}`)
        }
    }

    async clear(): Promise<void> {
        await this.save([])
    }
}

// Hybrid storage (tries API first, falls back to local)
export class HybridSkillStorage implements SkillStorageAdapter {
    private apiStorage: ApiSkillStorage
    private localStorage: LocalSkillStorage

    constructor(apiBase?: string, getHeaders?: () => Record<string, string>) {
        this.apiStorage = new ApiSkillStorage(apiBase, getHeaders)
        this.localStorage = new LocalSkillStorage()
    }

    async load(): Promise<InstalledSkill[]> {
        try {
            return await this.apiStorage.load()
        } catch {
            console.warn('API storage unavailable, using local storage')
            return await this.localStorage.load()
        }
    }

    async save(skills: InstalledSkill[]): Promise<void> {
        // Save to both storages
        await this.localStorage.save(skills)
        try {
            await this.apiStorage.save(skills)
        } catch {
            console.warn('Failed to sync to API, saved locally only')
        }
    }

    async clear(): Promise<void> {
        await this.localStorage.clear()
        try {
            await this.apiStorage.clear()
        } catch {
            // Ignore API errors
        }
    }
}

// Skill Registry - main class
export class SkillRegistry {
    private storage: SkillStorageAdapter
    private installedSkills: Map<string, InstalledSkill> = new Map()
    private listeners: Set<() => void> = new Set()
    private initialized: boolean = false

    constructor(storage: SkillStorageAdapter) {
        this.storage = storage
    }

    /**
     * Initialize the registry by loading from storage
     */
    async initialize(): Promise<void> {
        if (this.initialized) return

        const skills = await this.storage.load()
        this.installedSkills.clear()
        for (const skill of skills) {
            this.installedSkills.set(skill.id, skill)
        }
        this.initialized = true
    }

    /**
     * Add a change listener
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener())
    }

    private async persist(): Promise<void> {
        await this.storage.save(Array.from(this.installedSkills.values()))
        this.notifyListeners()
    }

    /**
     * Install a skill
     */
    async install(
        skill: SerializableSkill,
        source: InstalledSkill['source'] = 'custom',
        sourceUrl?: string
    ): Promise<{ success: boolean; message: string }> {
        if (this.installedSkills.has(skill.id)) {
            return {
                success: false,
                message: `Skill "${skill.name}" is already installed`
            }
        }

        const installed: InstalledSkill = {
            ...skill,
            installedAt: new Date().toISOString(),
            enabled: true,
            source,
            sourceUrl
        }

        this.installedSkills.set(skill.id, installed)
        await this.persist()

        return {
            success: true,
            message: `Skill "${skill.name}" installed successfully`
        }
    }

    /**
     * Uninstall a skill
     */
    async uninstall(skillId: string): Promise<{ success: boolean; message: string }> {
        const skill = this.installedSkills.get(skillId)
        if (!skill) {
            return {
                success: false,
                message: `Skill "${skillId}" is not installed`
            }
        }

        this.installedSkills.delete(skillId)
        await this.persist()

        return {
            success: true,
            message: `Skill "${skill.name}" uninstalled successfully`
        }
    }

    /**
     * Enable/disable a skill
     */
    async setEnabled(skillId: string, enabled: boolean): Promise<{ success: boolean; message: string }> {
        const skill = this.installedSkills.get(skillId)
        if (!skill) {
            return {
                success: false,
                message: `Skill "${skillId}" is not installed`
            }
        }

        skill.enabled = enabled
        await this.persist()

        return {
            success: true,
            message: `Skill "${skill.name}" ${enabled ? 'enabled' : 'disabled'}`
        }
    }

    /**
     * Update a skill
     */
    async update(
        skillId: string,
        updates: Partial<SerializableSkill>
    ): Promise<{ success: boolean; message: string }> {
        const skill = this.installedSkills.get(skillId)
        if (!skill) {
            return {
                success: false,
                message: `Skill "${skillId}" is not installed`
            }
        }

        Object.assign(skill, updates, { updatedAt: new Date().toISOString() })
        await this.persist()

        return {
            success: true,
            message: `Skill "${skill.name}" updated successfully`
        }
    }

    /**
     * Get all installed skills
     */
    getInstalled(): InstalledSkill[] {
        return Array.from(this.installedSkills.values())
    }

    /**
     * Get enabled skills only
     */
    getEnabled(): InstalledSkill[] {
        return this.getInstalled().filter(s => s.enabled)
    }

    /**
     * Get a specific skill
     */
    get(skillId: string): InstalledSkill | undefined {
        return this.installedSkills.get(skillId)
    }

    /**
     * Check if a skill is installed
     */
    isInstalled(skillId: string): boolean {
        return this.installedSkills.has(skillId)
    }

    /**
     * Convert installed skills to Skill format for SkillProvider
     */
    toSkillFormat(): Skill[] {
        return this.getEnabled().map(installed => ({
            name: installed.name,
            description: installed.description,
            requiredTools: installed.requiredTools,
            optionalTools: installed.optionalTools,
            systemPromptFragment: installed.systemPromptFragment,
            tags: installed.tags,
            source: 'plugin' as const, // Treat user-installed as plugin source
            pluginName: `user:${installed.id}`
        }))
    }

    /**
     * Import skill from JSON
     */
    async importFromJson(json: string): Promise<{ success: boolean; message: string; skill?: InstalledSkill }> {
        try {
            const skill = JSON.parse(json) as SerializableSkill

            // Validate required fields
            if (!skill.id || !skill.name || !skill.requiredTools) {
                return {
                    success: false,
                    message: 'Invalid skill format: missing required fields (id, name, requiredTools)'
                }
            }

            const result = await this.install(skill, 'import')
            return {
                ...result,
                skill: result.success ? this.get(skill.id) : undefined
            }
        } catch (error) {
            return {
                success: false,
                message: `Failed to parse skill JSON: ${error}`
            }
        }
    }

    /**
     * Export a skill to JSON
     */
    exportToJson(skillId: string): string | null {
        const skill = this.installedSkills.get(skillId)
        if (!skill) return null

        const exportable: SerializableSkill = {
            id: skill.id,
            name: skill.name,
            displayName: skill.displayName,
            description: skill.description,
            version: skill.version,
            author: skill.author,
            homepage: skill.homepage,
            requiredTools: skill.requiredTools,
            optionalTools: skill.optionalTools,
            systemPromptFragment: skill.systemPromptFragment,
            tags: skill.tags
        }

        return JSON.stringify(exportable, null, 2)
    }
}

/**
 * Create default skill registry based on environment
 */
export function createSkillRegistry(options?: {
    apiBase?: string
    getHeaders?: () => Record<string, string>
    forceLocal?: boolean
}): SkillRegistry {
    const isDesktop = typeof window !== 'undefined' &&
        (window as any).__ELECTRON__ !== undefined

    let storage: SkillStorageAdapter

    if (options?.forceLocal || isDesktop) {
        storage = new LocalSkillStorage()
    } else if (options?.apiBase) {
        storage = new HybridSkillStorage(options.apiBase, options.getHeaders)
    } else {
        storage = new LocalSkillStorage()
    }

    return new SkillRegistry(storage)
}
