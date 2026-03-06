/**
 * AI Agent Service
 *
 * Creates and manages AI Agent instances.
 * Provides a unified interface for AI operations across the application.
 */

import { stepCountIs, ToolLoopAgent } from 'ai'
import type { Editor } from '@kn/editor'
import type {
    AIAgent,
    AgentOptions,
    StreamOptions,
    StreamResult,
    AIModelConfig,
    SkillRegistryFoundation
} from '../types'
import type { GlobalToolRegistryImpl } from '../registry/tool-registry'
import type { SkillActivationResult } from '../../types'
import { deepseek } from '../../ai-utils'
import { FOUNDATION_AGENT_PROMPT, DEFAULT_MAX_STEPS } from '../../constants'

type AgentDestroyCallback = () => void

class AIAgentImpl implements AIAgent {
    private id: string
    private agent: ToolLoopAgent
    private options: AgentOptions
    private toolRegistry: GlobalToolRegistryImpl
    private skillRegistry: SkillRegistryFoundation | null
    private activeSkills: Set<string> = new Set()
    private abortController: AbortController | null = null
    private onDestroy?: AgentDestroyCallback

    // Caching for expensive operations
    private cachedInstructions: string | null = null
    private cachedToolsHash: string | null = null
    private needsRecreation: boolean = false

    constructor(
        id: string,
        toolRegistry: GlobalToolRegistryImpl,
        skillRegistry: SkillRegistryFoundation | null,
        options: AgentOptions = {},
        onDestroy?: AgentDestroyCallback
    ) {
        this.id = id
        this.toolRegistry = toolRegistry
        this.skillRegistry = skillRegistry
        this.options = options
        this.onDestroy = onDestroy

        // Create the agent
        this.agent = this.createAgent()
    }

    private createAgent(): ToolLoopAgent {
        // Get model
        const modelConfig = this.options.model
        const model = this.getModel(modelConfig)

        // Get tools
        const tools = this.getTools()

        // Build instructions
        const instructions = this.buildInstructions()

        return new ToolLoopAgent({
            model,
            stopWhen: stepCountIs(this.options.maxSteps || DEFAULT_MAX_STEPS),
            instructions,
            tools
        })
    }

    private getModel(config?: AIModelConfig) {
        const provider = config?.provider || 'deepseek'
        const modelName = config?.model || 'deepseek-chat'

        // Currently only supporting deepseek
        // In the future, we can add support for other providers
        return deepseek(modelName)
    }

    private getTools(): Record<string, any> {
        const tools: Record<string, any> = {}

        // Get specified tools or all loaded tools
        if (this.options.tools && this.options.tools.length > 0) {
            for (const name of this.options.tools) {
                const tool = this.toolRegistry.get(name)
                if (tool) {
                    tools[name] = tool
                }
            }
        } else {
            // Get all loaded tools
            Object.assign(tools, this.toolRegistry.getLoaded())
        }

        return tools
    }

    private buildInstructions(): string {
        let instructions = this.options.systemPrompt || FOUNDATION_AGENT_PROMPT

        // Add skill prompt fragments
        if (this.skillRegistry && this.activeSkills.size > 0) {
            const enabledSkills = this.skillRegistry.getEnabled()
            const activeSkillFragments = enabledSkills
                .filter(skill => this.activeSkills.has(skill.id) || this.activeSkills.has(skill.name))
                .filter(skill => skill.systemPromptFragment)
                .map(skill => skill.systemPromptFragment)

            if (activeSkillFragments.length > 0) {
                instructions += '\n\n# Active Skills\n\n' + activeSkillFragments.join('\n\n')
            }
        }

        return instructions
    }

    /**
     * Check if the agent needs recreation based on instruction changes.
     * Returns true only if instructions have actually changed.
     */
    private checkNeedsRecreation(): boolean {
        const newInstructions = this.buildInstructions()
        if (newInstructions !== this.cachedInstructions) {
            this.cachedInstructions = newInstructions
            return true
        }
        return false
    }

    /**
     * Lazily recreate the agent only if pending changes exist.
     * Called before stream to avoid unnecessary recreation.
     */
    private ensureAgent(): void {
        if (this.needsRecreation) {
            if (this.checkNeedsRecreation()) {
                this.agent = this.createAgent()
            }
            this.needsRecreation = false
        }
    }

    async stream(options: StreamOptions): Promise<StreamResult> {
        // Abort any previous stream
        if (this.abortController) {
            this.abortController.abort()
        }

        // Create new AbortController
        this.abortController = new AbortController()

        // Use provided signal or our own
        const signal = options.abortSignal || this.abortController.signal

        // Handle system prompt override
        if (options.systemPrompt) {
            this.options.systemPrompt = options.systemPrompt
            this.cachedInstructions = null // Invalidate cache
            this.needsRecreation = true
        }

        // Ensure agent is up to date before streaming
        this.ensureAgent()

        try {
            const stream = await this.agent.stream({
                prompt: options.prompt,
                abortSignal: signal
            })

            return {
                text: '',
                stream,
                finished: true
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return {
                    text: '',
                    stream: [][Symbol.iterator]() as any,
                    finished: false
                }
            }
            throw error
        }
    }

    stop(): void {
        if (this.abortController) {
            this.abortController.abort()
            this.abortController = null
        }
    }

    isGenerating(): boolean {
        return this.abortController !== null && !this.abortController.signal.aborted
    }

    setTools(toolNames: string[]): void {
        this.options.tools = toolNames
        // Mark for lazy recreation on next stream call
        this.needsRecreation = true
        this.cachedInstructions = null
    }

    activateSkill(skillName: string): SkillActivationResult {
        // Check if skill exists
        if (this.skillRegistry) {
            const skill = this.skillRegistry.get(skillName)
            if (!skill) {
                return {
                    success: false,
                    skillName,
                    loadedTools: [],
                    failedTools: [],
                    message: `Skill "${skillName}" not found`
                }
            }
        }

        // Mark as active
        this.activeSkills.add(skillName)

        // Load required tools
        const loadedTools: string[] = []
        const failedTools: string[] = []

        // Mark for lazy recreation - only recreate when actually streaming
        this.needsRecreation = true

        return {
            success: true,
            skillName,
            loadedTools,
            failedTools,
            message: `Skill "${skillName}" activated successfully`
        }
    }

    deactivateSkill(skillName: string): { success: boolean; message: string } {
        if (!this.activeSkills.has(skillName)) {
            return {
                success: true,
                message: `Skill "${skillName}" is not active`
            }
        }

        this.activeSkills.delete(skillName)

        // Mark for lazy recreation - only recreate when actually streaming
        this.needsRecreation = true

        return {
            success: true,
            message: `Skill "${skillName}" deactivated successfully`
        }
    }

    getActiveSkills(): string[] {
        return Array.from(this.activeSkills)
    }

    getId(): string {
        return this.id
    }

    destroy(): void {
        this.stop()
        this.activeSkills.clear()
        this.onDestroy?.()
    }
}

/**
 * Agent Service - Manages agent instances
 */
class AgentService {
    private agents: Map<string, AIAgentImpl> = new Map()
    private toolRegistry: GlobalToolRegistryImpl
    private skillRegistry: SkillRegistryFoundation | null = null
    private defaultAgentId: string = 'default'
    private agentCounter: number = 0

    constructor(toolRegistry: GlobalToolRegistryImpl) {
        this.toolRegistry = toolRegistry
    }

    /**
     * Set the skill registry
     */
    setSkillRegistry(skillRegistry: SkillRegistryFoundation): void {
        this.skillRegistry = skillRegistry
    }

    /**
     * Create a new agent
     */
    createAgent(options?: AgentOptions): AIAgent {
        const id = `agent-${++this.agentCounter}`

        const agent = new AIAgentImpl(
            id,
            this.toolRegistry,
            this.skillRegistry,
            options,
            () => this.agents.delete(id)
        )

        this.agents.set(id, agent)
        return agent
    }

    /**
     * Get or create default agent
     */
    getDefaultAgent(): AIAgent {
        let agent = this.agents.get(this.defaultAgentId)
        if (!agent) {
            agent = new AIAgentImpl(
                this.defaultAgentId,
                this.toolRegistry,
                this.skillRegistry,
                {},
                () => { /* Don't remove default agent */ }
            )
            this.agents.set(this.defaultAgentId, agent)
        }
        return agent
    }

    /**
     * Get agent by ID
     */
    getAgent(id: string): AIAgent | undefined {
        return this.agents.get(id)
    }

    /**
     * Destroy an agent
     */
    destroyAgent(id: string): void {
        const agent = this.agents.get(id)
        if (agent) {
            agent.destroy()
            this.agents.delete(id)
        }
    }

    /**
     * Destroy all agents
     */
    destroyAll(): void {
        this.agents.forEach(agent => agent.destroy())
        this.agents.clear()
    }

    /**
     * Get all agent IDs
     */
    getAgentIds(): string[] {
        return Array.from(this.agents.keys())
    }
}

export { AgentService, AIAgentImpl }
