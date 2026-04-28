/**
 * Skill Router Prompt Builder
 *
 * Builds the prompt and function-calling schema for the lightweight
 * skill router LLM call. The router analyzes user intent and recommends
 * skills to pre-activate before the main conversation begins.
 *
 * Design goals:
 * - Minimal token usage for fast inference
 * - Bilingual awareness (Chinese & English)
 * - Structured output via function calling
 */

import type { SkillDescriptor, SkillRouterInput } from './skill-router-types'

// ============ System Prompt ============

/**
 * Build the system prompt for the skill router.
 * Kept deliberately concise to minimize latency.
 */
export function buildRouterSystemPrompt(): string {
    return `You are a skill router. Analyze the user's message and recommend which skills to activate.

Rules:
- Match user intent to available skills by name, description, and tags.
- Recommend 0 skills if the message is a simple greeting, chitchat, or needs no specialized capability.
- Return only the most relevant skills (prefer fewer, higher-confidence matches).
- Consider both English and Chinese messages equally.
- Respond ONLY via the recommend_skills function call.`
}

// ============ Skill Catalog Formatter ============

/**
 * Convert skill descriptors into a compact text catalog for the prompt.
 * Uses a terse format to minimize token count while preserving key info.
 *
 * Output format per skill:
 *   [name] description | tags: tag1, tag2
 */
export function formatSkillCatalog(skills: SkillDescriptor[]): string {
    if (skills.length === 0) return '(no skills available)'

    return skills
        .map(s => `[${s.name}] ${s.description} | tags: ${s.tags.join(', ')}`)
        .join('\n')
}

// ============ Message Builder ============

/**
 * Message shape used by the router (compatible with OpenAI chat format).
 */
export interface RouterMessage {
    role: 'system' | 'user'
    content: string
}

/**
 * Build the messages array for the skill router LLM call.
 *
 * - System message: router instructions + condensed skill catalog
 * - User message: the actual user input (with optional conversation context)
 */
export function buildRouterMessages(input: SkillRouterInput): RouterMessage[] {
    const systemPrompt = buildRouterSystemPrompt()
    const catalog = formatSkillCatalog(input.availableSkills)

    const systemContent = `${systemPrompt}\n\nAvailable skills:\n${catalog}`

    // Build user content — include conversation context when present
    let userContent = input.userMessage
    if (input.conversationContext) {
        userContent = `[Recent context]\n${input.conversationContext}\n\n[Current message]\n${input.userMessage}`
    }

    return [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
    ]
}

// ============ Function Calling Schema ============

/**
 * OpenAI function calling schema for structured skill router output.
 * Used as the `tools` parameter in the chat completion request.
 */
export const SKILL_ROUTER_FUNCTION_SCHEMA = {
    type: 'function' as const,
    function: {
        name: 'recommend_skills',
        description: 'Recommend skills to activate based on user intent analysis',
        parameters: {
            type: 'object',
            properties: {
                recommendedSkills: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Skill names to activate',
                },
                reasoning: {
                    type: 'string',
                    description: 'Brief explanation of why these skills match',
                },
                confidence: {
                    type: 'number',
                    description: 'Confidence score 0-1',
                },
            },
            required: ['recommendedSkills', 'reasoning', 'confidence'],
        },
    },
} as const
