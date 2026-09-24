/**
 * Plugin Agent Contribution Contract (M0)
 *
 * The kernel agent is independent of any plugin. A plugin grows the agent by
 * declaring an {@link AgentContribution} on its `PluginConfig.agent` field —
 * the first-class, editor-optional contribution point that replaces the
 * "wrap everything in a fake editorExtension" workaround.
 *
 * Design notes:
 * - `editor` is optional context, not a required argument. Tools that act on
 *   the document read `ctx.editor`; tools that don't (plugin management,
 *   integrations, workspace operations) simply ignore it.
 * - `scope` is declarative: the kernel selects tools per run scope instead of
 *   instantiating everything and failing at call time.
 * - Tool names are namespaced on the wire (`{pluginKey}__{tool}`) so two
 *   plugins can never collide. See ./namespace.ts.
 */

import type { ComponentType } from 'react'

/** Where a run operates. `any` means "usable in every scope". */
export type AgentScope = 'workspace' | 'space' | 'page' | 'any'

/** Concrete scope of a run — never `any`. */
export type ResolvedAgentScope = Exclude<AgentScope, 'any'>

export interface AgentNavigationTarget {
    pageId?: string
    spaceId?: string
    path?: string
}

/**
 * The context handed to every agent tool factory. This is the plugin-facing
 * generalization of the old `(editor) => executor` shape.
 */
export interface AgentToolContext {
    /** The scope the run was created with. */
    scope: ResolvedAgentScope
    /** Present only for `page` scope when the host has published an editor. */
    editor?: any
    /**
     * Resolve a host service (e.g. `spacePageService`). Subject to the
     * per-plugin service whitelist (decision 3) — an unauthorized name returns
     * `undefined` rather than throwing, so tools can fail gracefully.
     */
    resolveService: (name: string) => any
    /** Ask the host to navigate. Optional; absent in headless contexts. */
    navigate?: (target: AgentNavigationTarget) => void
    signal?: AbortSignal
}

/** Executor returned by {@link AgentToolDefinition.create}. */
export type AgentToolExecutor = (
    params: any,
    callId?: string,
    context?: any,
) => any

export interface AgentToolDefinition {
    /** Local (unqualified) tool name. Namespaced on the wire unless disabled. */
    name: string
    description: string
    inputSchema: any
    readOnly?: boolean
    /** Defaults to `['any']`. */
    scope?: AgentScope | AgentScope[]
    /**
     * When false, the tool keeps its bare `name` on the wire. Reserved for the
     * legacy adapter, which must not rename tools the model already knows.
     * New declarations should leave this unset (namespaced).
     */
    namespace?: boolean
    /**
     * Map this tool's result to a renderable artifact. The mapping lives with
     * the implementation (core), while the UI that renders it lives with the
     * plugin (`toolRenderers` / `artifactRenderers`).
     */
    artifactFromResult?: (result: unknown, args: unknown) => AgentArtifact | null
    create: (ctx: AgentToolContext) => AgentToolExecutor
}

export interface AgentSkillDefinition {
    name: string
    description: string
    /**
     * Tool names this skill owns. Names may be local to the declaring plugin
     * (resolved to wire names) or already-qualified wire names for cross-plugin
     * references.
     */
    requiredTools: string[]
    optionalTools?: string[]
    systemPromptFragment?: string
    tags?: string[]
}

/**
 * Grounding contributed by a plugin. **Gated by the host context whitelist**
 * (decision 3): a provider only runs when its id is explicitly authorized,
 * because context can read user data.
 */
export interface AgentContextProviderDefinition {
    id: string
    scope?: AgentScope | AgentScope[]
    description?: string
    load: (ctx: AgentToolContext) => Promise<Record<string, unknown>> | Record<string, unknown>
}

/** A product-level quick action (e.g. Notion's "Create Slides"). */
export interface AgentActionDefinition {
    id: string
    label: string
    description?: string
    icon?: string
    scope?: AgentScope | AgentScope[]
    /** Prompt template sent when the user picks this action. */
    prompt: string
    /** Local or wire tool names this action relies on. */
    tools?: string[]
}

/**
 * A plugin-owned agent — the unit of the hybrid delegation model
 * (docs/plugin-agents.md). The kernel agent ORCHESTRATES: it sees only this
 * definition (id/name/description/scope) and delegates work; the tools and
 * skills below belong to the child run alone, so their scope, prompt and naming
 * can never drift from their owner.
 */
export interface PluginAgentDefinition {
    /** Stable id the kernel agent delegates to. */
    id: string
    /** Display name shown in the sub-agent tree. */
    name: string
    /**
     * What this agent is for — this IS its interface: the kernel agent picks it
     * from this text, so write it like a tool description.
     */
    description: string
    /** The agent's own persona/rules (the child run's system prompt). */
    systemPrompt?: string
    /**
     * When the agent is available: `page` needs a live editor, `workspace` is
     * always offered, `any` is unrestricted. Defaults to `any`.
     */
    scope?: AgentScope | AgentScope[]
    /** Tools that exist ONLY inside this agent's run. */
    tools?: AgentToolDefinition[]
    /**
     * Core-registered implementations this agent exposes (same bridge as the
     * contribution-level `include`). Lets a plugin agent own workspace tools
     * whose implementation lives in core.
     */
    include?: AgentToolInclude[]
    /** Skills that travel with those tools (same owner, so they always match). */
    skills?: AgentSkillDefinition[]
    /** Optional cheaper model for this agent's child run. */
    model?: string
}

/**
 * A reference to a core-registered implementation (see ./registry.ts). The
 * plugin *declares* availability; the implementation stays in core. This is
 * what lets `plugin-main` expose workspace tools without importing @kn/core.
 */
export type AgentToolInclude = string | { name: string; scope?: AgentScope | AgentScope[] }

/**
 * A structured, renderable result of a tool call — the data half of "plugin
 * capabilities surfaced in the conversation". The kernel never interprets
 * `kind`; it only routes it to the plugin-registered renderer.
 */
export interface AgentArtifact {
    /** Renderer key, e.g. 'page' | 'spreadsheet' | 'bitable' | 'chart' | 'source-list'. */
    kind: string
    /** Stable identity of the artifact (pageId, spreadsheet blockId, …). */
    id: string
    title?: string
    spaceId?: string
    subtitle?: string
    /** Renderer-specific, small, already-sanitized payload. */
    data?: unknown
}

/** Props handed to a plugin's conversation card for one tool call. */
export interface AgentToolResultProps {
    tool: string
    /** Sanitized args (see chat-helpers#toolCallsToSteps). */
    args?: unknown
    /** Sanitized result. */
    result?: unknown
    artifact?: AgentArtifact | null
    /** Delegated sub-run that issued the call, when any. */
    owner?: string | null
    /** Open this artifact in the host's side sheet. */
    openArtifact: (artifact: AgentArtifact) => void
    /** Leave the conversation and open the artifact's page. */
    openInPage: (artifact: AgentArtifact) => void
}

/** Props handed to a plugin's side-sheet preview for one artifact kind. */
export interface AgentArtifactProps {
    artifact: AgentArtifact
    close: () => void
    openInPage: (artifact: AgentArtifact) => void
}

/** A plugin's conversation card for a specific tool's result. */
export interface AgentToolRendererContribution {
    /** Tool name this card renders (local or wire name). */
    tool: string
    render: ComponentType<AgentToolResultProps>
    /**
     * Artifact mapper for a tool this plugin does NOT implement — e.g. a backend
     * builtin like `web_search`, or a legacy editor tool. A tool-implementation
     * mapper wins; this only fills the gap, so the artifact still reaches the
     * shelf and the working target.
     */
    artifactFromResult?: (result: unknown, args: unknown) => AgentArtifact | null
}

/** A plugin's preview/detail view for a specific artifact kind. */
export interface AgentArtifactRendererContribution {
    kind: string
    render: ComponentType<AgentArtifactProps>
}

/** Everything a plugin can contribute to the kernel agent. */
export interface AgentContribution {
    tools?: AgentToolDefinition[]
    /**
     * Core-registered implementations this plugin exposes to the agent. A
     * declared name only reaches the catalog when a plugin lists it here.
     */
    include?: AgentToolInclude[]
    skills?: AgentSkillDefinition[]
    context?: AgentContextProviderDefinition[]
    actions?: AgentActionDefinition[]
    agents?: PluginAgentDefinition[]
    /** Conversation cards for this plugin's (or core's) tool results. */
    toolRenderers?: AgentToolRendererContribution[]
    /** Side-sheet previews, keyed by artifact kind. */
    artifactRenderers?: AgentArtifactRendererContribution[]
}

/** Normalize an `AgentScope | AgentScope[] | undefined` to an array. */
export function normalizeAgentScopes(scope?: AgentScope | AgentScope[]): AgentScope[] {
    if (scope === undefined || scope === null) return ['any']
    return Array.isArray(scope) ? scope : [scope]
}

/** Whether a declaration covers a concrete run scope. */
export function agentScopeMatches(
    declared: AgentScope | AgentScope[] | undefined,
    runScope: ResolvedAgentScope,
): boolean {
    const scopes = normalizeAgentScopes(declared)
    return scopes.includes('any') || scopes.includes(runScope)
}
