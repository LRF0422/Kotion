/**
 * Capability payload types — the OpenAI-shaped skill/tool envelopes shipped
 * inline with every chat request.
 *
 * `tools[]` carries the callable catalogue of this run; a NON-CORE tool that a
 * skill's fragment names is withheld from it and delivered on demand by
 * `load_skill` (progressive discovery), and a skill this conversation already
 * loaded rides `deferredTools` instead — callable from the first step, still out
 * of the advertised array so the provider's cached prefix survives.
 *
 * These were previously defined in chat-client/types.ts; they moved here when
 * the legacy chat-client was removed so the CapabilityCatalog collector keeps a
 * dependency-free home for the catalog wire format.
 */

/**
 * Skill payload sent to the backend as part of the capability catalog.
 *
 * Carries the skill's prompt fragment and the names of the tools it owns. The
 * schemas of those tools travel either in the catalog's top-level `tools[]` (the
 * editor baseline) or through the discovery/deferred channel — a skill cannot
 * embed them itself.
 */
export interface SkillPayload {
    name: string
    description: string
    requiredTools: string[]
    optionalTools?: string[]
    /**
     * @deprecated No longer produced. Skills used to embed their tools' schemas
     * so the backend could register them as *deferred*; every tool is now
     * advertised in `tools[]` with its schema. Kept only so a consumer reading
     * an older catalog still typechecks.
     */
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
    /**
     * Frontend-only classification: true when the tool is a built-in editor tool
     * rather than a plugin contribution. A core tool is never dropped from the
     * advertised list when the tool budget is applied (see
     * `buildAgentRunInputs`) — hiding one is what broke basic editing.
     */
    core?: boolean
    /** Frontend-only: metadata priority (1-10). Ranks tools against the budget. */
    priority?: number
    /** Frontend-only: run scopes this tool may be offered in ('any' = all). */
    scope?: 'any' | 'page' | 'workspace'
}

/**
 * Structural view of a capability catalog.
 *
 * Consumers accept this shape rather than the collector's concrete type so the
 * check harness can exercise catalog logic without the collector's provider
 * dependencies.
 */
export interface AgentCapabilityCatalog {
    skills: SkillPayload[]
    tools: ToolPayload[]
    /**
     * Max client tools to advertise to the model (0/undefined = the module
     * default). Carried on the catalog because a host reads it from its env.
     */
    toolBudget?: number
    /**
     * Progressive-discovery policy (default on): a tool a skill's fragment names is
     * withheld and delivered on demand by `load_skill`. Applied when the run input
     * is built, on the already scope-filtered catalogue.
     */
    skillDiscovery?: boolean
    version: string
}
