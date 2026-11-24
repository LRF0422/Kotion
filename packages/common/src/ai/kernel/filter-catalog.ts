/**
 * Scope filtering for the kernel capability catalog.
 *
 * The frontend catalog is assembled from the editor ToolProvider, which eagerly
 * instantiates every built-in editor tool (they are document-bound and need a
 * live editor). A workspace-scoped run has no editor, so those tools must not be
 * advertised — otherwise the model calls them and gets a runtime failure.
 *
 * Plugin-contributed tools are the ones a scope-filtered surface runs on; their
 * availability is decided by the caller (see useWorkspaceAgent, which accepts
 * `source === 'plugin'`). When plugin-main later declares core-implemented
 * workspace tools through `agent.include`, those register as plugin tools too,
 * so they flow through here unchanged.
 *
 * Types come from ./payload-types so this module stays independent of the
 * collector's provider wiring.
 */

import type {
    AgentCapabilityCatalog,
    SkillPayload,
    ToolPayload,
} from '../capabilities/payload-types'
import type { ToolMetadata } from '../types'

export type { AgentCapabilityCatalog }

/**
 * Built-in tool categories that operate on a DOCUMENT. They are advertised even
 * before the workbench has a document, because a run's tool list is fixed when
 * the run is created: a run that starts with no page and calls `createPage` can
 * acquire one mid-run, but a tool the model was never offered cannot be called
 * in that same run. The per-call resolver then binds these tools to the exact
 * target page, and reports "createPage/editPage first" when there is none —
 * which is strictly better than telling the user a document capability is
 * missing after the page already exists.
 */
const DOCUMENT_TOOL_CATEGORIES = new Set<string>([
    'document-read',
    'document-write',
    'document-structure',
    'document-delete',
    'layout',
])

export const isDocumentToolCategory = (category: string | undefined): boolean =>
    category !== undefined && DOCUMENT_TOOL_CATEGORIES.has(category)

/**
 * Whether a run at this scope may be offered a tool.
 *
 * The rule lives here (not inline in the workspace hook) because it is the one
 * place a protocol tool can be lost: without `scope: 'any'` in the metadata, a
 * workbench run — which is exactly where a long build happens — would never be
 * told about `getBackgroundTask`, and the taskId it was just handed would be
 * useless.
 *
 * - a live edit target makes this a document session like any other: everything
 *   registered can run;
 * - with no target, plugin contributions still carry this scope's capabilities
 *   (a page-scoped tool is never registered in the first place);
 * - an unknown tool is unavailable: guessing "it probably works" is how a model
 *   ends up calling a document tool against a document that is not there.
 */
export function agentToolAvailableAtScope(
    meta: ToolMetadata | undefined,
    hasDocument: boolean,
): boolean {
    if (!meta) return false
    if (hasDocument) return true
    if (meta.source === 'plugin') return true
    // Editor-free by declaration: a workspace run can execute it (page
    // management, background tasks, discovery) regardless of the scope name.
    if (meta.requiresEditor === false) return true
    // A workbench run can acquire a document mid-run (createPage / editPage).
    // Its tool list was frozen at run creation, so document tools must be
    // advertised up front; execution is what enforces "only against the exact
    // target, or fail with a request to acquire one".
    if (isDocumentToolCategory(meta.category)) return true
    return meta.scope === 'any' || meta.scope === 'workspace'
}

/**
 * Drop every tool the scope cannot run, and reconcile the skills that
 * referenced them: a skill whose required tools all vanished is dropped, so it
 * never advertises an unusable workflow.
 *
 * Generic over the catalog type so the caller keeps its concrete type.
 */
export function filterAgentCatalog<T extends AgentCapabilityCatalog>(
    catalog: T,
    isAvailable: (name: string) => boolean,
): T {
    const tools: ToolPayload[] = catalog.tools.filter(tool => isAvailable(tool.function.name))
    const skills: SkillPayload[] = []

    for (const skill of catalog.skills) {
        const originalRequired = skill.requiredTools ?? []
        const requiredTools = originalRequired.filter(isAvailable)
        const optionalTools = skill.optionalTools?.filter(isAvailable)

        const lostAllRequired = originalRequired.length > 0 && requiredTools.length === 0
        if (lostAllRequired) continue

        skills.push({ ...skill, requiredTools, optionalTools })
    }

    return {
        ...catalog,
        tools,
        skills,
        // The filtered catalog is a distinct capability set. Keep a stable but
        // distinct version so the backend's capabilitiesVersion cache can never
        // answer with schemas from the unfiltered catalog.
        version: `${catalog.version}:f`,
    }
}
