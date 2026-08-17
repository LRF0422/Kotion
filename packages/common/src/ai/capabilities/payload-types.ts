/**
 * Capability payload types — the OpenAI-shaped skill/tool envelopes shipped
 * inline with every chat request (backend performs progressive discovery).
 *
 * These were previously defined in chat-client/types.ts; they moved here when
 * the legacy chat-client was removed so the CapabilityCatalog collector keeps a
 * dependency-free home for the catalog wire format.
 */

/**
 * Skill payload sent to the backend as part of the capability catalog.
 * The backend uses this catalog to perform progressive discovery; the frontend
 * no longer tracks activation state.
 *
 * The `tools` field carries the full OpenAI-shaped definitions of the skill's
 * `requiredTools` (+ `optionalTools`). This lets the backend learn the schema
 * of plugin tools through the skill envelope — plugin tools are not shipped
 * in the top-level `tools[]` array.
 */
export interface SkillPayload {
    name: string
    description: string
    requiredTools: string[]
    optionalTools?: string[]
    /** Detailed OpenAI function-call definitions for this skill's required + optional tools. */
    tools?: ToolPayload[]
    systemPromptFragment?: string
    tags?: string[]
    domain?: string
    source: 'builtin' | 'plugin' | 'user'
    pluginName?: string
}

/**
 * Tool payload sent to the backend as part of the capability catalog.
 * Uses the standard OpenAI function-call shape so the backend can forward
 * it directly to the LLM without conversion.
 * `parameters` carries a JSON Schema produced from the tool's Zod input schema.
 */
export interface ToolPayload {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: any // JSON Schema
    }
    /** Whether this tool only reads document/editor state (safe in PLAN mode). */
    readOnly?: boolean
}
