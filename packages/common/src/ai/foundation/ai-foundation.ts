/**
 * AI Foundation Service
 *
 * The main AI service that provides unified access to AI capabilities.
 * Manages tools, skills, contexts, and agents in a centralized manner.
 */

import type { Editor } from '@kn/editor'
import type {
    AIFoundation,
    AIFoundationConfig,
    AIEvent,
    AIEventListener,
    AIContext,
    AgentOptions,
    AIAgent
} from './types'
import type { ToolDefinition, ToolMetadata, SkillActivationResult } from '../types'
import type { InstalledSkill } from '../skills/skill-registry'
import { getAIConfigManager, type AIConfigManager } from './ai-config'
import { GlobalToolRegistryImpl, getGlobalToolRegistry } from './registry/tool-registry'
import { createSkillRegistry, type SkillRegistry } from '../skills/skill-registry'
import { getEditorContextManager, type EditorContextManager } from './context-providers/editor-context'
import { AgentService } from './agent/agent-service'

/**
 * AI Foundation Implementation
 */
class AIFoundationImpl implements AIFoundation {
    private configManager: AIConfigManager
    private toolRegistry: GlobalToolRegistryImpl
    private skillRegistry: SkillRegistry
    private editorContextManager: EditorContextManager
    private agentService: AgentService
    private contexts: Map<string, AIContext> = new Map()
    private listeners: Set<AIEventListener> = new Set()
    private initialized: boolean = false

    constructor() {
        this.configManager = getAIConfigManager()
        this.toolRegistry = getGlobalToolRegistry()
        this.skillRegistry = createSkillRegistry()
        this.editorContextManager = getEditorContextManager()
        this.agentService = new AgentService(this.toolRegistry)

        // Set skill registry for agent service
        this.agentService.setSkillRegistry(this.skillRegistry as any)
    }

    // ============ Configuration ============

    getConfig(): AIFoundationConfig {
        return this.configManager.getConfig()
    }

    setConfig(config: Partial<AIFoundationConfig>): void {
        this.configManager.setConfig(config)
        this.emit({
            type: 'config:changed',
            payload: { config: this.getConfig() },
            timestamp: Date.now()
        })
    }

    // ============ Tool Management ============

    getToolRegistry() {
        return this.toolRegistry
    }

    registerTool(name: string, tool: ToolDefinition, meta?: Partial<ToolMetadata>): void {
        this.toolRegistry.register(name, tool, meta)
        this.emit({
            type: 'tool:registered',
            payload: { name, tool, meta },
            timestamp: Date.now()
        })
    }

    unregisterTool(name: string): void {
        this.toolRegistry.unregister(name)
        this.emit({
            type: 'tool:unregistered',
            payload: { name },
            timestamp: Date.now()
        })
    }

    // ============ Skill Management ============

    getSkillRegistry() {
        // Create adapter for SkillRegistry
        return {
            initialize: () => this.skillRegistry.initialize(),
            install: (skill: Omit<InstalledSkill, 'installedAt' | 'enabled'>) =>
                this.skillRegistry.install(skill as InstalledSkill, 'custom'),
            uninstall: (skillId: string) => this.skillRegistry.uninstall(skillId),
            setEnabled: (skillId: string, enabled: boolean) =>
                this.skillRegistry.setEnabled(skillId, enabled),
            getInstalled: () => this.skillRegistry.getInstalled(),
            getEnabled: () => this.skillRegistry.getEnabled(),
            get: (skillId: string) => this.skillRegistry.get(skillId),
            subscribe: (listener: () => void) => this.skillRegistry.subscribe(listener)
        }
    }

    async installSkill(skill: Omit<InstalledSkill, 'installedAt' | 'enabled'>): Promise<{ success: boolean; message: string }> {
        const result = await this.skillRegistry.install(skill as InstalledSkill, 'custom')
        if (result.success) {
            this.emit({
                type: 'skill:installed',
                payload: { skill },
                timestamp: Date.now()
            })
        }
        return result
    }

    // ============ Context Management ============

    setEditorContext(editor: Editor, documentId?: string): void {
        this.editorContextManager.setEditor(editor, documentId)
        this.toolRegistry.setEditor(editor)

        // Load essential tools
        this.toolRegistry.loadEssentialTools()

        this.emit({
            type: 'context:changed',
            payload: { type: 'editor', documentId },
            timestamp: Date.now()
        })
    }

    getEditorContext(): Editor | undefined {
        return this.editorContextManager.getEditor()
    }

    setContext<T>(context: AIContext<T>): void {
        this.contexts.set(context.id, context as AIContext)
        this.emit({
            type: 'context:changed',
            payload: { contextId: context.id, type: context.type },
            timestamp: Date.now()
        })
    }

    getContext<T = any>(id: string): AIContext<T> | undefined {
        return this.contexts.get(id) as AIContext<T> | undefined
    }

    getActiveContext(): AIContext | undefined {
        // Return editor context if available
        const editorContext = this.editorContextManager.getContext()
        if (editorContext) {
            return editorContext as AIContext
        }
        // Return the first context in the map
        const firstContext = this.contexts.values().next().value
        return firstContext
    }

    // ============ Agent Management ============

    createAgent(options?: AgentOptions): AIAgent {
        const agent = this.agentService.createAgent(options)
        this.emit({
            type: 'agent:created',
            payload: { agentId: agent.getId(), options },
            timestamp: Date.now()
        })
        return agent
    }

    getDefaultAgent(): AIAgent {
        return this.agentService.getDefaultAgent()
    }

    getAgent(id: string): AIAgent | undefined {
        return this.agentService.getAgent(id)
    }

    destroyAgent(id: string): void {
        this.agentService.destroyAgent(id)
        this.emit({
            type: 'agent:destroyed',
            payload: { agentId: id },
            timestamp: Date.now()
        })
    }

    // ============ Events ============

    subscribe(listener: AIEventListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    emit(event: AIEvent): void {
        this.listeners.forEach(listener => {
            try {
                listener(event)
            } catch (error) {
                console.error('Error in AI event listener:', error)
            }
        })
    }

    // ============ Lifecycle ============

    async initialize(): Promise<void> {
        if (this.initialized) return

        // Initialize skill registry
        await this.skillRegistry.initialize()

        this.initialized = true
    }

    isInitialized(): boolean {
        return this.initialized
    }

    dispose(): void {
        // Destroy all agents
        this.agentService.destroyAll()

        // Clear contexts
        this.contexts.clear()

        // Clear editor context
        this.editorContextManager.clear()

        // Clear listeners
        this.listeners.clear()

        this.initialized = false
    }
}

// Singleton instance
let aiFoundationInstance: AIFoundationImpl | null = null

/**
 * Get the singleton AI Foundation instance
 */
export function getAIFoundation(): AIFoundation {
    if (!aiFoundationInstance) {
        aiFoundationInstance = new AIFoundationImpl()
    }
    return aiFoundationInstance
}

/**
 * Create a new AI Foundation instance (for testing)
 */
export function createAIFoundation(): AIFoundation {
    return new AIFoundationImpl()
}

/**
 * Initialize the AI Foundation
 */
export async function initializeAIFoundation(): Promise<AIFoundation> {
    const foundation = getAIFoundation()
    await foundation.initialize()
    return foundation
}

/**
 * Reset the AI Foundation (for testing)
 */
export function resetAIFoundation(): void {
    if (aiFoundationInstance) {
        aiFoundationInstance.dispose()
        aiFoundationInstance = null
    }
}

export { AIFoundationImpl }
