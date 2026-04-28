/**
 * Skill Router Types
 *
 * Types for the lightweight pre-conversation skill router that analyzes
 * user intent and pre-activates relevant skills before the main LLM
 * conversation begins, eliminating extra round-trips for skill discovery.
 */

/**
 * Input for the skill router LLM call.
 */
export interface SkillRouterInput {
    /** The user's message to analyze for intent */
    userMessage: string
    /** All available skills the router can recommend */
    availableSkills: SkillDescriptor[]
    /** Optional recent conversation context for multi-turn awareness */
    conversationContext?: string
}

/**
 * Compact skill descriptor used in the router prompt.
 * A simplified view of skills optimized for router decision-making.
 */
export interface SkillDescriptor {
    /** Unique skill name / identifier */
    name: string
    /** Human-readable description of what this skill does */
    description: string
    /** Semantic tags for matching (e.g. ['chart', 'visualization']) */
    tags: string[]
    /** Tools this skill requires to function */
    requiredTools: string[]
}

/**
 * Result returned by the skill router LLM call.
 */
export interface SkillRouterResult {
    /** Skill names recommended for activation */
    recommendedSkills: string[]
    /** Brief explanation of why these skills were chosen */
    reasoning: string
    /** Confidence score from 0 (no match) to 1 (perfect match) */
    confidence: number
}

/**
 * Configuration for the skill router behavior.
 */
export interface SkillRouterConfig {
    /** Maximum number of skills to recommend per call (default: 3) */
    maxSkills: number
    /** Minimum confidence threshold to activate a skill (default: 0.5) */
    confidenceThreshold: number
    /** Timeout in milliseconds for the router LLM call (default: 3000) */
    timeoutMs: number
    /** Feature flag to enable/disable the skill router */
    enabled: boolean
}

/**
 * Sensible defaults for skill router configuration.
 */
export const DEFAULT_SKILL_ROUTER_CONFIG: SkillRouterConfig = {
    maxSkills: 3,
    confidenceThreshold: 0.5,
    timeoutMs: 3000,
    enabled: true,
}
