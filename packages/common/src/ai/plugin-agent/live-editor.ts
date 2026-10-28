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
 * Resolution here is deliberately split in two:
 *  - {@link pickLiveEditor} / {@link pickTargetEditor} are SYNC and side-effect
 *    free. They never switch an edit target on a tool's behalf.
 *  - {@link acquireCallEditor} is the async last resort for a call that found
 *    none, and only a WRITE may use it: re-acquiring the conversation's own
 *    target keeps an editor resident for the agent, while a read that quietly
 *    claimed one would move the user's edit target for a tool that only wanted
 *    to look. Crossing documents on purpose stays
 *    `page-tools#resolveEditorForPage`'s job, inside the writing lifecycle.
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

/**
 * The editor the conversation's edit target publishes right now, if any.
 *
 * Used when building the catalog rather than answering a call: a chat session
 * keeps its target alive (visible editor, claimed pane, off-screen session)
 * even while no page route owns an editor, and those tools must not fall out of
 * the catalog because the UI momentarily published none.
 */
export function pickTargetEditor(binding?: SessionPageBinding | null): any | undefined {
    const candidate = binding?.getEditor?.()
    return isLiveEditor(candidate) ? candidate : undefined
}

/**
 * A live editor for a call whose executor found none.
 *
 * The executor was built around the editor published when the catalog was
 * built; between two calls that instance can be destroyed (tab closed, route
 * changed, document re-opened) while the conversation still HAS an edit
 * target. Re-acquiring it here is what keeps an editor resident for the agent
 * instead of "whatever instance happened to exist at registration time".
 *
 * A READ never claims a target: acquiring one can move the conversation's edit
 * target on behalf of a tool that only wanted to look, so a read without a live
 * editor reports that instead. A WRITE may, because the page is already the
 * conversation's target and re-acquiring it cannot redirect the user.
 */
export async function acquireCallEditor(
    execCtx: ToolCallEditorContext | undefined,
    options: { mutating?: boolean } = {},
): Promise<any | undefined> {
    const binding = execCtx?.sessionBinding
    if (!binding) return undefined
    const owner = execCtx?.owner ?? null

    // A delegated run asks for ITS OWN target first: the host can fork or
    // acquire that document on demand, while a read is served by the live page.
    if (owner && binding.getEditorForAsync) {
        try {
            const acquired = await binding.getEditorForAsync(owner, { mutating: options.mutating })
            if (isLiveEditor(acquired)) return acquired
        } catch {
            // No private document for this owner — try the conversation target.
        }
    }

    if (!options.mutating || !binding.editPage) return undefined
    const page = binding.getPageFor?.(owner) ?? binding.getBoundPage?.()
    if (!page?.pageId) return undefined
    try {
        const target = await binding.editPage({
            pageId: String(page.pageId),
            title: page.title,
            spaceId: page.spaceId,
        })
        return isLiveEditor(target?.editor) ? target.editor : undefined
    } catch {
        return undefined
    }
}
