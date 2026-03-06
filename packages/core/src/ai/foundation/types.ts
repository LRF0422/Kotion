/**
 * AI Foundation Types
 *
 * Type definitions for the global AI foundation architecture.
 * This module provides a unified interface for AI capabilities across the application.
 */

import type { Editor } from '@kn/editor'
import type { ToolDefinition, ToolsRecord, ToolMetadata, ToolCategory } from '../types'
import type { Skill, SkillActivationResult } from '../types'
import type { InstalledSkill } from '../skills/skill-registry'

// ============ AI Configuration Types ============

export interface AIModelConfig {
    /** Model provider */
    provider: 'deepseek' | 'anthropic' | 'openai'
    /** Model identifier */
    model: string
    /** API key for the provider */
    apiKey?: string
    /** Base URL for API calls */
    apiBaseUrl?: string
}

export interface AIFoundationConfig {
    /** Default model configuration */
    defaultModel?: AIModelConfig
    /** Maximum tokens for responses */
    maxTokens?: number
    /** Temperature for generation */
    temperature?: number
    /** Enable debug logging */
    debug?: boolean
}

// ============ AI Context Types ============

export type AIContextType = 'editor' | 'chat' | 'plugin' | 'general'

export interface AIContext<T = any> {
    /** Context type identifier */
    type: AIContextType
    /** Unique context identifier */
    id: string
    /** Context data */
    data: T
    /** Context metadata */
    metadata?: Record<string, any>
}

export interface EditorContextData {
    /** Editor instance */
    editor: Editor
    /** Current document ID */
    documentId?: string
    /** Current selection */
    selection?: {
        from: number
        to: number
    }
}

// ============ Tool Registry Types ============

export interface ToolRegistryOptions {
    /** Auto-load essential tools on initialization */
    autoLoadEssential?: boolean
}

export interface ToolRegistry {
    /** Register a single tool */
    register(name: string, tool: ToolDefinition, meta?: Partial<ToolMetadata>): void

    /** Register multiple tools */
    registerAll(tools: ToolsRecord, meta?: Partial<ToolMetadata>): void

    /** Register plugin tools */
    registerPluginTools(tools: ToolsRecord, pluginName: string): void

    /** Unregister a tool */
    unregister(name: string): void

    /** Get a tool by name */
    get(name: string): ToolDefinition | undefined

    /** Get all registered tools */
    getAll(): ToolsRecord

    /** Get loaded tools only */
    getLoaded(): ToolsRecord

    /** Get tools by category */
    getByCategory(category: ToolCategory): ToolDefinition[]

    /** Get tool metadata */
    getMetadata(name: string): ToolMetadata | undefined

    /** Get all metadata */
    getAllMetadata(): ToolMetadata[]

    /** Load a tool by name */
    load(name: string): Promise<boolean>

    /** Load multiple tools */
    loadMany(names: string[]): Promise<{ loaded: string[]; failed: string[] }>

    /** Check if tool is loaded */
    isLoaded(name: string): boolean

    /** Check if tool exists */
    has(name: string): boolean

    /** Get tool names */
    getNames(): string[]

    /** Get loaded tool names */
    getLoadedNames(): string[]
}

// ============ Skill Registry Types (Foundation) ============

export interface SkillRegistryFoundation {
    /** Initialize the registry */
    initialize(): Promise<void>

    /** Install a skill */
    install(skill: Omit<InstalledSkill, 'installedAt' | 'enabled'>): Promise<{ success: boolean; message: string }>

    /** Uninstall a skill */
    uninstall(skillId: string): Promise<{ success: boolean; message: string }>

    /** Enable/disable a skill */
    setEnabled(skillId: string, enabled: boolean): Promise<{ success: boolean; message: string }>

    /** Get all installed skills */
    getInstalled(): InstalledSkill[]

    /** Get enabled skills */
    getEnabled(): InstalledSkill[]

    /** Get a specific skill */
    get(skillId: string): InstalledSkill | undefined

    /** Subscribe to changes */
    subscribe(listener: () => void): () => void
}

// ============ Agent Types ============

export interface AgentOptions {
    /** Model configuration override */
    model?: AIModelConfig
    /** Tools to load for this agent */
    tools?: string[]
    /** Skills to activate */
    skills?: string[]
    /** System prompt */
    systemPrompt?: string
    /** Context ID to bind */
    contextId?: string
    /** Maximum steps for tool loop */
    maxSteps?: number
}

export interface StreamOptions {
    /** User prompt */
    prompt: string
    /** Conversation history */
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    /** Abort signal */
    abortSignal?: AbortSignal
    /** System prompt override */
    systemPrompt?: string
}

export interface StreamResult {
    /** Full text content */
    text: string
    /** Stream result object from AI SDK */
    stream: any
    /** Tool calls made */
    toolCalls?: any[]
    /** Whether completed successfully */
    finished: boolean
}

export interface AIAgent {
    /** Stream a response */
    stream(options: StreamOptions): Promise<StreamResult>

    /** Stop current generation */
    stop(): void

    /** Check if generating */
    isGenerating(): boolean

    /** Set tools for this agent */
    setTools(toolNames: string[]): void

    /** Activate a skill */
    activateSkill(skillName: string): SkillActivationResult

    /** Deactivate a skill */
    deactivateSkill(skillName: string): { success: boolean; message: string }

    /** Get active skills */
    getActiveSkills(): string[]

    /** Get agent ID */
    getId(): string
}

// ============ AI Event Types ============

export type AIEventType =
    | 'tool:registered'
    | 'tool:unregistered'
    | 'tool:loaded'
    | 'skill:installed'
    | 'skill:uninstalled'
    | 'skill:activated'
    | 'skill:deactivated'
    | 'context:changed'
    | 'agent:created'
    | 'agent:destroyed'
    | 'config:changed'

export interface AIEvent {
    type: AIEventType
    payload: any
    timestamp: number
}

export type AIEventListener = (event: AIEvent) => void

// ============ AI Foundation Interface ============

export interface AIFoundation {
    // ============ Configuration ============
    /** Get current configuration */
    getConfig(): AIFoundationConfig

    /** Update configuration */
    setConfig(config: Partial<AIFoundationConfig>): void

    // ============ Tool Management ============
    /** Get tool registry */
    getToolRegistry(): ToolRegistry

    /** Register a tool */
    registerTool(name: string, tool: ToolDefinition, meta?: Partial<ToolMetadata>): void

    /** Unregister a tool */
    unregisterTool(name: string): void

    // ============ Skill Management ============
    /** Get skill registry */
    getSkillRegistry(): SkillRegistryFoundation

    /** Install a skill */
    installSkill(skill: Omit<InstalledSkill, 'installedAt' | 'enabled'>): Promise<{ success: boolean; message: string }>

    // ============ Context Management ============
    /** Set editor context */
    setEditorContext(editor: Editor, documentId?: string): void

    /** Get editor context */
    getEditorContext(): Editor | undefined

    /** Set custom context */
    setContext<T>(context: AIContext<T>): void

    /** Get context by ID */
    getContext<T = any>(id: string): AIContext<T> | undefined

    /** Get active context */
    getActiveContext(): AIContext | undefined

    // ============ Agent Management ============
    /** Create a new agent */
    createAgent(options?: AgentOptions): AIAgent

    /** Get default agent */
    getDefaultAgent(): AIAgent

    /** Get agent by ID */
    getAgent(id: string): AIAgent | undefined

    /** Destroy an agent */
    destroyAgent(id: string): void

    // ============ Events ============
    /** Subscribe to events */
    subscribe(listener: AIEventListener): () => void

    /** Emit an event */
    emit(event: AIEvent): void

    // ============ Lifecycle ============
    /** Initialize the foundation */
    initialize(): Promise<void>

    /** Check if initialized */
    isInitialized(): boolean

    /** Dispose resources */
    dispose(): void
}

// ============ Provider Types (for context) ============

export interface AIFoundationProviderProps {
    children: React.ReactNode
    /** Initial configuration */
    config?: AIFoundationConfig
    /** Auto-initialize on mount */
    autoInit?: boolean
}
