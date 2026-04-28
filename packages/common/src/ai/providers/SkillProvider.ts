/**
 * SkillProvider - High-Level Capability Management
 *
 * Manages skill registration, activation, and system prompt fragments.
 * Skills are high-level abstractions that combine multiple tools with
 * specialized prompts for complex tasks.
 */

import type {
    Skill,
    SkillActivationResult,
    ReloadCallback
} from '../types'
import type { SkillDefinition, SkillActivationOptions, SkillDeactivationResult } from '../skills/types'
import type { ToolProvider } from './ToolProvider'
import type { Editor } from '@tiptap/core'
import type { PluginManager } from '../../core/PluginManager'

interface SkillProviderOptions {
    toolProvider: ToolProvider
    onReload?: ReloadCallback
    pluginManager?: PluginManager
    editor?: Editor
}

export class SkillProvider {
    private toolProvider: ToolProvider
    private onReload?: ReloadCallback
    private pluginManager?: PluginManager
    private editor?: Editor

    // Skill registries
    private skills: Map<string, SkillDefinition> = new Map()
    private activeSkills: Set<string> = new Set()

    // Version tracking
    private version: number = 0

    constructor(options: SkillProviderOptions) {
        this.toolProvider = options.toolProvider
        this.onReload = options.onReload
        this.pluginManager = options.pluginManager
        this.editor = options.editor
    }

    /**
     * Set plugin manager after construction (for late binding)
     */
    setPluginManager(pluginManager: PluginManager, editor: Editor): void {
        this.pluginManager = pluginManager
        this.editor = editor
    }

    /**
     * Load plugin tools for a specific plugin
     * This registers the plugin's tools with the ToolProvider if not already registered
     */
    private loadPluginTools(pluginName: string): void {
        if (!this.pluginManager || !this.editor) {
            console.warn('[SkillProvider] Cannot load plugin tools: missing pluginManager or editor')
            return
        }

        // Get plugin tools from PluginManager
        const allPluginTools = this.pluginManager.resloveTools(this.editor)

        // Filter tools to only include those from the specified plugin
        // First, get the plugin's extensions to identify its tools
        const extensions = this.pluginManager.resloveEditorExtension()
        const pluginExtension = extensions.find(ext => ext.name === pluginName)

        if (!pluginExtension) {
            console.warn(`[SkillProvider] Plugin "${pluginName}" not found in extensions`)
            return
        }

        // Get the tool names defined in this plugin's extension
        const pluginToolNames = pluginExtension.tools
            ? (Array.isArray(pluginExtension.tools)
                ? pluginExtension.tools
                : [pluginExtension.tools])
                .map(t => t.name)
            : []

        // Filter to only include tools from this plugin
        const filteredTools: Record<string, any> = {}
        for (const name of pluginToolNames) {
            if (allPluginTools[name]) {
                filteredTools[name] = allPluginTools[name]
            }
        }

        if (Object.keys(filteredTools).length === 0) {
            console.warn(`[SkillProvider] No tools found for plugin "${pluginName}"`)
            return
        }

        console.log(`[SkillProvider] Loading ${Object.keys(filteredTools).length} tools for plugin "${pluginName}"`, Object.keys(filteredTools))

        this.toolProvider.registerPluginTools(filteredTools, pluginName)
    }

    /**
     * Register a skill
     */
    registerSkill(skill: Skill): void {
        const definition: SkillDefinition = {
            ...skill,
            id: skill.name,
            displayName: skill.name,
            active: false
        }

        this.skills.set(skill.name, definition)
    }

    /**
     * Register multiple skills
     */
    registerSkills(skills: Skill[]): void {
        for (const skill of skills) {
            this.registerSkill(skill)
        }
    }

    /**
     * Activate a skill
     *
     * This loads all required tools and marks the skill as active.
     * The system prompt will include the skill's prompt fragment.
     */
    activateSkill(
        skillName: string,
        options: SkillActivationOptions = {}
    ): SkillActivationResult {
        const skill = this.skills.get(skillName)

        if (!skill) {
            console.warn(`[SkillProvider] Skill "${skillName}" not found`)
            return {
                success: false,
                skillName,
                loadedTools: [],
                failedTools: [],
                message: `Skill "${skillName}" not found`
            }
        }

        // Check if already active
        if (this.activeSkills.has(skillName) && !options.forceReload) {
            return {
                success: true,
                skillName,
                loadedTools: [],
                failedTools: [],
                message: `Skill "${skillName}" is already active`
            }
        }

        // Load required tools
        const toolsToLoad = [
            ...skill.requiredTools,
            ...(options.skipOptional ? [] : skill.optionalTools || [])
        ]

        console.log(`[SkillProvider] Activating skill "${skillName}" (source: ${skill.source}, pluginName: ${skill.pluginName || 'none'})`, {
            requiredTools: skill.requiredTools,
            optionalTools: skill.optionalTools,
            toolsToLoad
        })

        // If this is a plugin skill, load plugin tools first
        if (skill.source === 'plugin' && this.pluginManager && this.editor && skill.pluginName) {
            console.log(`[SkillProvider] Loading plugin tools for "${skill.pluginName}"`)
            this.loadPluginTools(skill.pluginName)
        }

        const loadResult = this.toolProvider.loadTools(toolsToLoad)
        console.log(`[SkillProvider] Tool loading result:`, loadResult)

        // Check if all required tools loaded successfully
        const failedRequired = skill.requiredTools.filter(
            t => loadResult.failed.includes(t)
        )

        if (failedRequired.length > 0) {
            console.error(`[SkillProvider] Failed to load required tools:`, failedRequired)
            return {
                success: false,
                skillName,
                loadedTools: loadResult.loaded,
                failedTools: loadResult.failed,
                message: `Failed to load required tools: ${failedRequired.join(', ')}`
            }
        }

        // Mark skill as active
        this.activeSkills.add(skillName)
        skill.active = true

        this.incrementVersion()

        return {
            success: true,
            skillName,
            loadedTools: loadResult.loaded,
            failedTools: loadResult.failed,
            message: `Skill "${skillName}" activated successfully`
        }
    }

    /**
     * Batch activate multiple skills with a single version increment.
     *
     * Unlike calling activateSkill() in a loop, this method:
     * - Deduplicates tool requirements across all skills
     * - Loads all tools in one batch via ToolProvider
     * - Only increments version ONCE at the end to avoid intermediate re-renders
     */
    async batchActivate(skillNames: string[]): Promise<{
        activated: string[]
        failed: string[]
        skipped: string[]
    }> {
        const activated: string[] = []
        const failed: string[] = []
        const skipped: string[] = []

        // Phase 1: Classify skills and collect plugin names that need tool loading
        const skillsToActivate: Array<{ name: string; definition: SkillDefinition }> = []
        const pluginNamesToLoad = new Set<string>()

        for (const name of skillNames) {
            const skill = this.skills.get(name)
            if (!skill) {
                console.warn(`[SkillProvider] batchActivate: Skill "${name}" not found`)
                failed.push(name)
                continue
            }
            if (this.activeSkills.has(name)) {
                skipped.push(name)
                continue
            }
            skillsToActivate.push({ name, definition: skill })

            // Collect plugin names for plugin-sourced skills
            if (skill.source === 'plugin' && skill.pluginName && this.pluginManager && this.editor) {
                pluginNamesToLoad.add(skill.pluginName)
            }
        }

        // Phase 2: Load all required plugin tools up front
        for (const pluginName of pluginNamesToLoad) {
            try {
                this.loadPluginTools(pluginName)
            } catch (err) {
                console.error(`[SkillProvider] batchActivate: Failed to load plugin tools for "${pluginName}"`, err)
            }
        }

        // Phase 3: Collect and deduplicate all required tool names
        const allToolNames = new Set<string>()
        for (const { definition } of skillsToActivate) {
            for (const t of definition.requiredTools) allToolNames.add(t)
            if (definition.optionalTools) {
                for (const t of definition.optionalTools) allToolNames.add(t)
            }
        }

        // Phase 4: Batch-load all tools at once via ToolProvider
        const loadResult = this.toolProvider.loadTools(Array.from(allToolNames))
        const failedToolSet = new Set(loadResult.failed)

        console.log(`[SkillProvider] batchActivate: tool loading result`, loadResult)

        // Phase 5: Validate each skill and mark as active
        for (const { name, definition } of skillsToActivate) {
            const failedRequired = definition.requiredTools.filter(t => failedToolSet.has(t))

            if (failedRequired.length > 0) {
                console.error(
                    `[SkillProvider] batchActivate: Skill "${name}" failed — missing required tools:`,
                    failedRequired
                )
                failed.push(name)
                continue
            }

            // Mark skill as active
            this.activeSkills.add(name)
            definition.active = true
            activated.push(name)
        }

        // Phase 6: Single version increment
        if (activated.length > 0) {
            this.incrementVersion()
        }

        console.log(`[SkillProvider] batchActivate complete:`, { activated, failed, skipped })

        return { activated, failed, skipped }
    }

    /**
     * Deactivate a skill
     *
     * Note: Tools are not unloaded, only the skill's prompt fragment is removed.
     */
    deactivateSkill(skillName: string): SkillDeactivationResult {
        const skill = this.skills.get(skillName)

        if (!skill) {
            return {
                success: false,
                skillName,
                unloadedTools: [],
                message: `Skill "${skillName}" not found`
            }
        }

        if (!this.activeSkills.has(skillName)) {
            return {
                success: true,
                skillName,
                unloadedTools: [],
                message: `Skill "${skillName}" is not active`
            }
        }

        // Mark skill as inactive
        this.activeSkills.delete(skillName)
        skill.active = false

        this.incrementVersion()

        return {
            success: true,
            skillName,
            unloadedTools: [], // Tools are not unloaded
            message: `Skill "${skillName}" deactivated successfully`
        }
    }

    /**
     * Get all registered skills
     */
    getAllSkills(): SkillDefinition[] {
        return Array.from(this.skills.values())
    }

    /**
     * Get active skills
     */
    getActiveSkills(): SkillDefinition[] {
        return Array.from(this.skills.values()).filter(s => s.active)
    }

    /**
     * Get skill by name
     */
    getSkill(skillName: string): SkillDefinition | undefined {
        return this.skills.get(skillName)
    }

    /**
     * Check if a skill is active
     */
    isSkillActive(skillName: string): boolean {
        return this.activeSkills.has(skillName)
    }

    /**
     * Get system prompt fragments from active skills
     *
     * These fragments are appended to the base system prompt to provide
     * specialized instructions for the active skills.
     */
    getSystemPromptFragments(): string[] {
        return this.getActiveSkills()
            .filter(skill => skill.systemPromptFragment)
            .map(skill => skill.systemPromptFragment!)
    }

    /**
     * Get combined system prompt addition
     */
    getSystemPromptAddition(): string {
        const fragments = this.getSystemPromptFragments()

        if (fragments.length === 0) {
            return ''
        }

        return `\n\n# Active Skills\n\n${fragments.join('\n\n')}`
    }

    /**
     * Get skills by tag
     */
    getSkillsByTag(tag: string): SkillDefinition[] {
        return Array.from(this.skills.values())
            .filter(skill => skill.tags?.includes(tag))
    }

    /**
     * Get skills by source
     */
    getSkillsBySource(source: 'builtin' | 'plugin'): SkillDefinition[] {
        return Array.from(this.skills.values())
            .filter(skill => skill.source === source)
    }

    /**
     * Get current version
     */
    getVersion(): number {
        return this.version
    }

    /**
     * Increment version and trigger reload
     */
    private incrementVersion(): void {
        this.version++
        this.onReload?.()
    }

    /**
     * Get active skill names
     */
    getActiveSkillNames(): string[] {
        return Array.from(this.activeSkills)
    }

    /**
     * Clear all active skills
     */
    clearActiveSkills(): void {
        this.activeSkills.forEach(skillName => {
            const skill = this.skills.get(skillName)
            if (skill) {
                skill.active = false
            }
        })
        this.activeSkills.clear()
        this.incrementVersion()
    }
}
