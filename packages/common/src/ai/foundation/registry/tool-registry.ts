/**
 * Global Tool Registry
 *
 * A centralized tool registry that can be used by all components and plugins.
 * Supports registration, discovery, and on-demand loading of tools.
 */

import type { ToolDefinition, ToolsRecord, ToolMetadata, ToolCategory } from '../../types'
import type { ToolRegistry, ToolRegistryOptions } from '../types'
import {
    BUILTIN_TOOL_METADATA,
    ESSENTIAL_TOOLS,
    getCategoryInfo,
    isEssentialTool
} from '../../discovery/tool-metadata'
import { getToolFactories } from '../../tools/tool-factory-registry'

type ToolFactory = (editor: any) => ToolDefinition
type ReloadCallback = () => void

export interface GlobalToolRegistryOptions extends ToolRegistryOptions {
    /** Reload callback when tools change */
    onReload?: ReloadCallback
}

class GlobalToolRegistryImpl implements ToolRegistry {
    private toolMetadata: Map<string, ToolMetadata> = new Map()
    private toolFactories: Map<string, ToolFactory> = new Map()
    private loadedTools: Map<string, ToolDefinition> = new Map()
    private pluginTools: Map<string, ToolDefinition> = new Map()
    private editor: any | null = null
    private onReload?: ReloadCallback
    private version: number = 0

    constructor(options?: GlobalToolRegistryOptions) {
        this.onReload = options?.onReload
        this.initializeBuiltinMetadata()
    }

    /**
     * Initialize built-in tool metadata
     */
    private initializeBuiltinMetadata(): void {
        for (const meta of BUILTIN_TOOL_METADATA) {
            this.toolMetadata.set(meta.name, { ...meta })
        }
    }

    /**
     * Set the editor instance for tool creation
     */
    setEditor(editor: any): void {
        this.editor = editor
        this.registerToolFactories()
    }

    /**
     * Get the current editor instance
     */
    getEditor(): any | null {
        return this.editor
    }

    /**
     * Register tool factories for lazy creation
     */
    private registerToolFactories(): void {
        if (!this.editor) return

        const editor = this.editor

        // Get all tools from global registry (populated by core)
        const allTools: ToolsRecord = {}
        for (const factory of getToolFactories()) {
            const tools = factory(editor)
            Object.assign(allTools, tools)
        }

        // Store each tool as a factory
        for (const [name, tool] of Object.entries(allTools)) {
            this.toolFactories.set(name, () => tool as ToolDefinition)
        }
    }

    /**
     * Load essential tools on initialization
     */
    loadEssentialTools(): void {
        for (const toolName of ESSENTIAL_TOOLS) {
            this.loadInternal(toolName, false)
        }
    }

    /**
     * Internal tool loading
     */
    private loadInternal(toolName: string, triggerReload: boolean): boolean {
        // Check if already loaded
        if (this.loadedTools.has(toolName) || this.pluginTools.has(toolName)) {
            return true
        }

        // Check if factory exists
        const factory = this.toolFactories.get(toolName)
        if (!factory) {
            return false
        }

        // Create and store tool
        if (this.editor) {
            const tool = factory(this.editor)
            this.loadedTools.set(toolName, tool)
        }

        // Update metadata
        const meta = this.toolMetadata.get(toolName)
        if (meta) {
            meta.loaded = true
        }

        if (triggerReload) {
            this.incrementVersion()
        }

        return true
    }

    /**
     * Increment version and trigger reload
     */
    private incrementVersion(): void {
        this.version++
        this.onReload?.()
    }

    // ============ Public API ============

    register(name: string, tool: ToolDefinition, meta?: Partial<ToolMetadata>): void {
        // Create default metadata if not provided
        const toolMeta: ToolMetadata = {
            name,
            category: meta?.category || 'plugin',
            description: meta?.description || tool.description || `Tool: ${name}`,
            priority: meta?.priority || 5,
            tags: meta?.tags || [],
            loaded: true,
            source: meta?.source || 'plugin',
            pluginName: meta?.pluginName
        }

        this.toolMetadata.set(name, toolMeta)
        this.loadedTools.set(name, tool)
        this.incrementVersion()
    }

    registerAll(tools: ToolsRecord, meta?: Partial<ToolMetadata>): void {
        for (const [name, tool] of Object.entries(tools)) {
            this.register(name, tool, { ...meta, name })
        }
    }

    registerPluginTools(tools: ToolsRecord, pluginName: string): void {
        for (const [name, tool] of Object.entries(tools)) {
            const metadata: ToolMetadata = {
                name,
                category: 'plugin',
                description: tool.description || `Plugin tool: ${name}`,
                priority: 5,
                tags: ['plugin', pluginName],
                loaded: true,
                source: 'plugin',
                pluginName
            }

            this.toolMetadata.set(name, metadata)
            this.pluginTools.set(name, tool)
        }

        this.incrementVersion()
    }

    unregister(name: string): void {
        this.toolMetadata.delete(name)
        this.loadedTools.delete(name)
        this.pluginTools.delete(name)
        this.incrementVersion()
    }

    get(name: string): ToolDefinition | undefined {
        return this.loadedTools.get(name) || this.pluginTools.get(name)
    }

    getAll(): ToolsRecord {
        const result: ToolsRecord = {}

        this.toolMetadata.forEach((_, name) => {
            const tool = this.get(name)
            if (tool) {
                result[name] = tool
            }
        })

        return result
    }

    getLoaded(): ToolsRecord {
        const result: ToolsRecord = {}

        this.loadedTools.forEach((tool, name) => {
            result[name] = tool
        })

        this.pluginTools.forEach((tool, name) => {
            result[name] = tool
        })

        return result
    }

    getByCategory(category: ToolCategory): ToolDefinition[] {
        const tools: ToolDefinition[] = []

        this.toolMetadata.forEach((meta, name) => {
            if (meta.category === category) {
                const tool = this.get(name)
                if (tool) {
                    tools.push(tool)
                }
            }
        })

        return tools
    }

    getMetadata(name: string): ToolMetadata | undefined {
        return this.toolMetadata.get(name)
    }

    getAllMetadata(): ToolMetadata[] {
        return Array.from(this.toolMetadata.values())
    }

    async load(name: string): Promise<boolean> {
        return this.loadInternal(name, true)
    }

    async loadMany(names: string[]): Promise<{ loaded: string[]; failed: string[] }> {
        const loaded: string[] = []
        const failed: string[] = []

        for (const name of names) {
            const success = this.loadInternal(name, false)
            if (success) {
                loaded.push(name)
            } else {
                failed.push(name)
            }
        }

        if (loaded.length > 0) {
            this.incrementVersion()
        }

        return { loaded, failed }
    }

    isLoaded(name: string): boolean {
        return this.loadedTools.has(name) || this.pluginTools.has(name)
    }

    has(name: string): boolean {
        return this.toolMetadata.has(name)
    }

    getNames(): string[] {
        return Array.from(this.toolMetadata.keys())
    }

    getLoadedNames(): string[] {
        return [
            ...Array.from(this.loadedTools.keys()),
            ...Array.from(this.pluginTools.keys())
        ]
    }

    /**
     * Get categories info
     */
    getCategories(): Array<{
        category: ToolCategory
        description: string
        toolCount: number
        loadedCount: number
    }> {
        return getCategoryInfo(Array.from(this.toolMetadata.values()))
    }

    /**
     * Get tools by priority
     */
    getToolsByPriority(minPriority: number = 0): ToolMetadata[] {
        return this.getAllMetadata()
            .filter(meta => meta.priority >= minPriority)
            .sort((a, b) => b.priority - a.priority)
    }

    /**
     * Search tools
     */
    searchTools(query: string): ToolMetadata[] {
        const lowerQuery = query.toLowerCase()
        return this.getAllMetadata()
            .filter(meta =>
                meta.name.toLowerCase().includes(lowerQuery) ||
                meta.description.toLowerCase().includes(lowerQuery) ||
                meta.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
            )
            .sort((a, b) => b.priority - a.priority)
    }

    /**
     * Get version
     */
    getVersion(): number {
        return this.version
    }

    /**
     * Check if tool is essential
     */
    isEssential(name: string): boolean {
        return isEssentialTool(name)
    }

    /**
     * Clear all tools
     */
    clear(): void {
        this.toolMetadata.clear()
        this.toolFactories.clear()
        this.loadedTools.clear()
        this.pluginTools.clear()
        this.initializeBuiltinMetadata()
        this.incrementVersion()
    }
}

// Singleton instance
let globalToolRegistryInstance: GlobalToolRegistryImpl | null = null

export function getGlobalToolRegistry(): GlobalToolRegistryImpl {
    if (!globalToolRegistryInstance) {
        globalToolRegistryInstance = new GlobalToolRegistryImpl()
    }
    return globalToolRegistryInstance
}

export function createGlobalToolRegistry(options?: GlobalToolRegistryOptions): GlobalToolRegistryImpl {
    return new GlobalToolRegistryImpl(options)
}

export { GlobalToolRegistryImpl }
