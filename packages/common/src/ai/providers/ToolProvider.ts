/**
 * ToolProvider - Eager Tool Catalog
 *
 * Maintains the full catalog of executable tools (built-in + plugin) so the
 * frontend can (a) ship the complete catalog to the backend in each chat
 * request and (b) execute any tool call the backend dispatches.
 *
 * Frontend no longer performs progressive discovery — that concern now lives
 * on the backend, which receives the catalog inline with every chat request.
 */

import type {
    ToolDefinition,
    ToolsRecord,
    ToolMetadata,
    OnUserChoiceRequest,
    ReloadCallback,
} from '../types'
import { BUILTIN_TOOL_METADATA } from '../discovery/tool-metadata'
import { getToolFactories } from '../tools/tool-factory-registry'

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

    // Metadata for all known tools (built-in + plugin)
    private toolMetadata: Map<string, ToolMetadata> = new Map()
    // Every executable tool is instantiated eagerly and kept here.
    private tools: Map<string, ToolDefinition> = new Map()

    // Version tracking for reactive UI updates (bumped when the catalog changes)
    private version: number = 0

    constructor(options: ToolProviderOptions) {
        this.editor = options.editor
        this.onUserChoiceRequest = options.onUserChoiceRequest
        this.onReload = options.onReload

        this.initializeBuiltinTools()
    }

    /**
     * Load built-in tool metadata and eagerly instantiate every built-in tool.
     */
    private initializeBuiltinTools(): void {
        // Seed metadata from the canonical registry
        for (const meta of BUILTIN_TOOL_METADATA) {
            this.toolMetadata.set(meta.name, { ...meta, loaded: true })
        }

        // Instantiate every tool from factories; the backend may request any of them.
        this.instantiateBuiltinTools()
    }

    private instantiateBuiltinTools(): void {
        this.tools.clear()
        const allTools: ToolsRecord = {}
        for (const factory of getToolFactories()) {
            const tools = factory(this.editor, this.onUserChoiceRequest)
            Object.assign(allTools, tools)
        }
        for (const [name, tool] of Object.entries(allTools)) {
            this.tools.set(name, tool as ToolDefinition)
            const meta = this.toolMetadata.get(name)
            if (meta) meta.loaded = true
        }
    }

    /**
     * Register plugin tools. Tools are instantiated immediately and added to
     * the catalog with metadata derived from the plugin.
     */
    registerPluginTools(tools: ToolsRecord, pluginName: string): void {
        let changed = false
        for (const [name, tool] of Object.entries(tools)) {
            const metadata: ToolMetadata = {
                name,
                category: 'plugin',
                description: tool.description || `Plugin tool: ${name}`,
                priority: 5,
                tags: ['plugin', pluginName],
                loaded: true,
                source: 'plugin',
                pluginName,
            }

            const existing = this.tools.get(name)
            this.toolMetadata.set(name, metadata)
            this.tools.set(name, tool as ToolDefinition)
            if (!existing) changed = true
        }

        if (changed) this.incrementVersion()
    }

    /**
     * Get the full executable tool catalog (built-in + plugin).
     */
    getAllTools(): ToolsRecord {
        const result: ToolsRecord = {}
        this.tools.forEach((tool, name) => {
            result[name] = tool
        })
        return result
    }

    /**
     * Resolve a single tool's executor, used when the backend asks the frontend
     * to run a specific tool call.
     */
    getToolExecutor(name: string): ToolDefinition | undefined {
        return this.tools.get(name)
    }

    /**
     * All tool metadata entries (used by UI and CapabilityCatalog).
     */
    getAllMetadata(): ToolMetadata[] {
        return Array.from(this.toolMetadata.values())
    }

    /**
     * Metadata lookup for a specific tool.
     */
    getToolMetadata(name: string): ToolMetadata | undefined {
        return this.toolMetadata.get(name)
    }

    /**
     * Tool names currently in the catalog.
     */
    getAllToolNames(): string[] {
        return Array.from(this.tools.keys())
    }

    /**
     * Current catalog version (incremented whenever the catalog mutates).
     */
    getVersion(): number {
        return this.version
    }

    /**
     * Swap the editor reference (e.g. on editor recreation) and rebuild
     * built-in tools. Plugin tools are preserved as-is.
     */
    updateEditor(editor: any): void {
        this.editor = editor
        // Rebuild built-in tools against the new editor instance.
        const pluginEntries = Array.from(this.tools.entries()).filter(([name]) => {
            const meta = this.toolMetadata.get(name)
            return meta?.source === 'plugin'
        })
        this.instantiateBuiltinTools()
        // Restore plugin tools captured before rebuild.
        for (const [name, tool] of pluginEntries) {
            this.tools.set(name, tool)
        }
        this.incrementVersion()
    }

    private incrementVersion(): void {
        this.version++
        this.onReload?.()
    }
}
