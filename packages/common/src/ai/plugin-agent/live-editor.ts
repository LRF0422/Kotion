/**
 * Which editor a plugin agent tool must act on, read from the CALL.
 *
 * A plugin tool is instantiated around the editor that was published when the
 * catalog was built. That instance dies with the surface that owns it — a page
 * switch, a plugin route, a re-opened document — while the tool stays advertised
 * for the rest of the run. The call itself already carries the answer: the
 * executor's context has the conversation's `sessionBinding` and the delegated
 * `owner`, so the editor can be resolved at the moment of use instead of being
 * frozen at instantiation.
 *
 * Resolution here is deliberately SYNC and side-effect free: it never switches
 * an edit target on the tool's behalf. A tool that has no editor yet must not
 * silently retarget the conversation — that is `page-tools#resolveEditorForPage`'s
 * job for page tools, which run inside the writing lifecycle.
 */

import type { SessionPageBinding } from '../session-page-binding'

/**
 * Whether an editor can still take transactions.
 *
 * `isDestroyed` is Tiptap's own liveness flag — the same one the rest of the
 * codebase tests — and it must stay the ONLY probe: after `destroy()` the
 * `state` and `view` getters are `null`-backed and no longer answer, while on a
 * live editor `state` is a ProseMirror `EditorState` (it has no `view` of its
 * own), so probing deeper rejects every editor that would have worked.
 */
export function isLiveEditor(editor: any): boolean {
    return !!editor && editor.isDestroyed !== true
}

/** The part of a tool executor's call context that names the editor. */
export interface ToolCallEditorContext {
    /** Delegated sub-run id; `null`/undefined for the conversation's own target. */
    owner?: string | null
    /** The executing conversation's page binding. */
    sessionBinding?: SessionPageBinding | null
}

/**
 * The editor the calling agent edits right now, or `undefined` when the host
 * cannot name a live one.
 *
 * A delegated run reads its OWN target (`getEditorFor`), never the
 * conversation's: handing a child the parent's document is a silent write to
 * the wrong page, which is worse than reporting no editor.
 */
export function pickLiveEditor(execCtx?: ToolCallEditorContext): any | undefined {
    const binding = execCtx?.sessionBinding
    if (!binding) return undefined
    const owner = execCtx?.owner ?? null
    const candidate = owner ? binding.getEditorFor?.(owner) : binding.getEditor?.()
    return isLiveEditor(candidate) ? candidate : undefined
}
