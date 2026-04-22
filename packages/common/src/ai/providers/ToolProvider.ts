/**
 * ToolProvider - Progressive Tool Discovery and On-Demand Loading
 *
 * Manages tool registration, metadata, and dynamic loading for the AI agent.
 * Implements a progressive discovery pattern to reduce initial context size.
 */

import type {
    ToolDefinition,
    ToolsRecord,
    ToolMetadata,
    ToolCategory,
    CategoryInfo,
    ReloadCallback,
    OnUserChoiceRequest
} from '../types'
import {
    BUILTIN_TOOL_METADATA,
    ESSENTIAL_TOOLS,
    getCategoryInfo,
    isEssentialTool
} from '../discovery/tool-metadata'
import { getToolFactories, type ToolFactory } from '../tools/tool-factory-registry'

// Re-export ToolFactory for consumers
export type { ToolFactory } from '../tools/tool-factory-registry'

interface ToolProviderOptions {
    editor: any
    onUserChoiceRequest?: OnUserChoiceRequest
    onReload?: ReloadCallback
}

export class ToolProvider {
    private editor: any
    private onUserChoiceRequest?: OnUserChoiceRequest
    private onReload?: ReloadCallback

    // Tool registries
    private toolMetadata: Map<string, ToolMetadata> = new Map()
    private toolFactories: Map<string, () => ToolDefinition> = new Map()
    private loadedTools: Map<string, ToolDefinition> = new Map()
    private pluginTools: Map<string, ToolDefinition> = new Map()

    // Version tracking for reactive updates
    private version: number = 0

    constructor(options: ToolProviderOptions) {
        this.editor = options.editor
        this.onUserChoiceRequest = options.onUserChoiceRequest
        this.onReload = options.onReload

        this.initializeBuiltinTools()
    }

    /**
     * Initialize built-in tool metadata and factories
     */
    private initializeBuiltinTools(): void {
        // Register metadata
        for (const meta of BUILTIN_TOOL_METADATA) {
            this.toolMetadata.set(meta.name, { ...meta })
        }

        // Create tool factory map (lazy creation)
        this.registerToolFactories()

        // Pre-load essential tools
        for (const toolName of ESSENTIAL_TOOLS) {
            this.loadToolInternal(toolName, false)
        }
    }

    /**
     * Register tool factories for lazy initialization
     */
    private registerToolFactories(): void {
        // Get all tools from global registry (populated by core)
        const allTools: ToolsRecord = {}
        for (const factory of getToolFactories()) {
            const tools = factory(this.editor, this.onUserChoiceRequest)
            Object.assign(allTools, tools)
        }

        // Register each tool as a factory
        for (const [name, tool] of Object.entries(allTools)) {
            this.toolFactories.set(name, () => tool as ToolDefinition)
        }
    }

    /**
     * Register plugin tools with their metadata
     */
    registerPluginTools(tools: ToolsRecord, pluginName: string): void {
        for (const [name, tool] of Object.entries(tools)) {
            // Create metadata for plugin tool
            const metadata: ToolMetadata = {
                name,
                category: 'plugin',
                description: tool.description || `Plugin tool: ${name}`,
                priority: 5,
                tags: ['plugin', pluginName],
                loaded: true, // Plugin tools are loaded when registered
                source: 'plugin',
                pluginName
            }

            this.toolMetadata.set(name, metadata)
            this.pluginTools.set(name, tool)
        }

        this.incrementVersion()
    }

    /**
     * Load a specific tool by name
     */
    loadTool(toolName: string): { success: boolean; message: string } {
        return this.loadToolInternal(toolName, true)
    }

    /**
     * Internal tool loading with optional reload trigger
     */
    private loadToolInternal(
        toolName: string,
        triggerReload: boolean
    ): { success: boolean; message: string } {
        // Check if already loaded
        if (this.loadedTools.has(toolName) || this.pluginTools.has(toolName)) {
            return {
                success: true,
                message: `Tool "${toolName}" is already loaded`
            }
        }

        // Check if factory exists
        const factory = this.toolFactories.get(toolName)
        if (!factory) {
            return {
                success: false,
                message: `Tool "${toolName}" not found`
            }
        }

        // Create and store tool
        const tool = factory()
        this.loadedTools.set(toolName, tool)

        // Update metadata
        const meta = this.toolMetadata.get(toolName)
        if (meta) {
            meta.loaded = true
        }

        if (triggerReload) {
            this.incrementVersion()
        }

        return {
            success: true,
            message: `Tool "${toolName}" loaded successfully`
        }
    }

    /**
     * Load multiple tools at once
     */
    loadTools(toolNames: string[]): { loaded: string[]; failed: string[] } {
        const loaded: string[] = []
        const failed: string[] = []

        for (const name of toolNames) {
            const result = this.loadToolInternal(name, false)
            if (result.success) {
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

    /**
     * Get all currently loaded tools
     */
    getLoadedTools(): ToolsRecord {
        const result: ToolsRecord = {}

        this.loadedTools.forEach((tool, name) => {
            result[name] = tool
        })

        this.pluginTools.forEach((tool, name) => {
            result[name] = tool
        })

        return result
    }

    /**
     * Get all tool categories with info
     */
    getCategories(): CategoryInfo[] {
        return getCategoryInfo(Array.from(this.toolMetadata.values()))
    }

    /**
     * Get tools in a specific category
     */
    getToolsByCategory(category: ToolCategory): ToolMetadata[] {
        return Array.from(this.toolMetadata.values())
            .filter(meta => meta.category === category)
            .sort((a, b) => b.priority - a.priority)
    }

    /**
     * Search tools by query
     */
    searchTools(query: string): ToolMetadata[] {
        const lowerQuery = query.toLowerCase()
        return Array.from(this.toolMetadata.values())
            .filter(meta =>
                meta.name.toLowerCase().includes(lowerQuery) ||
                meta.description.toLowerCase().includes(lowerQuery) ||
                meta.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
            )
            .sort((a, b) => b.priority - a.priority)
    }

    /**
     * Get all tool metadata
     */
    getAllMetadata(): ToolMetadata[] {
        return Array.from(this.toolMetadata.values())
    }

    /**
     * Get metadata for a specific tool
     */
    getToolMetadata(toolName: string): ToolMetadata | undefined {
        return this.toolMetadata.get(toolName)
    }

    /**
     * Check if a tool is loaded
     */
    isToolLoaded(toolName: string): boolean {
        return this.loadedTools.has(toolName) || this.pluginTools.has(toolName)
    }

    /**
     * Get the current version number (for reactive updates)
     */
    getVersion(): number {
        return this.version
    }

    /**
     * Get list of loaded tool names
     */
    getLoadedToolNames(): string[] {
        return [
            ...Array.from(this.loadedTools.keys()),
            ...Array.from(this.pluginTools.keys())
        ]
    }

    /**
     * Increment version and trigger reload
     */
    private incrementVersion(): void {
        this.version++
        this.onReload?.()
    }

    /**
     * Update editor reference (useful for editor recreation)
     */
    updateEditor(editor: any): void {
        this.editor = editor
        // Re-register factories with new editor
        this.registerToolFactories()
        // Re-load all previously loaded tools
        const loadedNames = Array.from(this.loadedTools.keys())
        this.loadedTools.clear()
        for (const name of loadedNames) {
            this.loadToolInternal(name, false)
        }
        this.incrementVersion()
    }

    /**
     * Get essential tool names
     */
    static getEssentialToolNames(): readonly string[] {
        return ESSENTIAL_TOOLS
    }

    /**
     * Check if a tool is essential
     */
    static isEssential(toolName: string): boolean {
        return isEssentialTool(toolName)
    }
}
