/**
 * Skill Router Service
 *
 * Lightweight pre-conversation skill router that analyzes user intent
 * via a fast LLM call and recommends skills to pre-activate before
 * the main conversation begins. This eliminates extra round-trips
 * for skill discovery during the conversation.
 *
 * Design principles:
 * - Fast: uses non-streaming chatComplete() with aggressive timeout
 * - Safe: never throws — returns empty result on any failure
 * - Deterministic: temperature 0 for consistent routing decisions
 */

import type { KnowledgeChatClient } from '../chat-client/index'
import type { ChatRequest } from '../chat-client/types'
import type { SkillProvider } from '../providers/SkillProvider'
import type {
    SkillRouterInput,
    SkillDescriptor,
    SkillRouterResult,
    SkillRouterConfig,
} from './skill-router-types'
import { DEFAULT_SKILL_ROUTER_CONFIG } from './skill-router-types'
import { buildRouterMessages, SKILL_ROUTER_FUNCTION_SCHEMA } from './skill-router-prompt'

/** Empty result returned on any failure or when routing is not needed. */
const EMPTY_RESULT: SkillRouterResult = {
    recommendedSkills: [],
    reasoning: '',
    confidence: 0,
}

export class SkillRouter {
    private config: SkillRouterConfig
    private chatClient: KnowledgeChatClient

    constructor(chatClient: KnowledgeChatClient, config?: Partial<SkillRouterConfig>) {
        this.chatClient = chatClient
        this.config = { ...DEFAULT_SKILL_ROUTER_CONFIG, ...config }
    }

    /**
     * Update router configuration. Merges with defaults.
     */
    updateConfig(config: Partial<SkillRouterConfig>): void {
        this.config = { ...DEFAULT_SKILL_ROUTER_CONFIG, ...config }
    }

    /**
     * Build condensed skill descriptors from SkillProvider for the router prompt.
     * Converts full Skill objects to lightweight SkillDescriptor format.
     * Only includes inactive skills (already-active ones don't need routing).
     */
    buildSkillCatalog(skillProvider: SkillProvider): SkillDescriptor[] {
        const allSkills = skillProvider.getAllSkills()
        const activeSkills = skillProvider.getActiveSkills()
        const activeNames = new Set(activeSkills.map(s => s.name))

        const inactiveSkills = allSkills.filter(s => !activeNames.has(s.name))

        if (inactiveSkills.length === 0) {
            return []
        }

        return inactiveSkills.map(skill => ({
            name: skill.name,
            description: skill.description,
            tags: skill.tags || [],
            requiredTools: skill.requiredTools,
        }))
    }

    /**
     * Main routing method. Calls LLM to match user intent to skills.
     * Uses KnowledgeChatClient.chatComplete() for non-streaming fast response.
     * Uses OpenAI function calling for structured output.
     *
     * Returns empty result on ANY failure (timeout, parse error, API error).
     */
    async route(input: SkillRouterInput): Promise<SkillRouterResult> {
        try {
            // Short-circuit: disabled or no skills to route
            if (!this.config.enabled) {
                return EMPTY_RESULT
            }

            if (!input.availableSkills || input.availableSkills.length === 0) {
                return EMPTY_RESULT
            }

            // Build the chat messages for the router
            const messages = buildRouterMessages(input)

            // Construct the ChatRequest
            const request: ChatRequest = {
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                tools: [SKILL_ROUTER_FUNCTION_SCHEMA],
                stream: false,
                temperature: 0,
            }

            // Execute with timeout via Promise.race
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Skill router timeout')), this.config.timeoutMs)
            })

            const response = await Promise.race([
                this.chatClient.chatComplete(request),
                timeoutPromise,
            ])

            // Parse tool call from the response
            if (!response.toolCalls || response.toolCalls.length === 0) {
                console.warn('[SkillRouter] No tool calls in response, returning empty result')
                return EMPTY_RESULT
            }

            const toolCall = response.toolCalls[0]
            if (toolCall.function.name !== 'recommend_skills') {
                console.warn(`[SkillRouter] Unexpected function call: ${toolCall.function.name}`)
                return EMPTY_RESULT
            }

            const parsed: SkillRouterResult = JSON.parse(toolCall.function.arguments)

            // Validate parsed result structure
            if (!Array.isArray(parsed.recommendedSkills)) {
                console.warn('[SkillRouter] Invalid result: recommendedSkills is not an array')
                return EMPTY_RESULT
            }

            // Apply confidence threshold filter
            if (typeof parsed.confidence === 'number' && parsed.confidence < this.config.confidenceThreshold) {
                return EMPTY_RESULT
            }

            // Limit to maxSkills
            return {
                recommendedSkills: parsed.recommendedSkills.slice(0, this.config.maxSkills),
                reasoning: parsed.reasoning || '',
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
            }
        } catch (error) {
            console.warn('[SkillRouter] Route failed, returning empty result:', error)
            return EMPTY_RESULT
        }
    }
}
