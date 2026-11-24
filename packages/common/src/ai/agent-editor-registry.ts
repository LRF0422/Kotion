/**
 * AgentEditorRegistry — the app-global answer to "is this page already open in
 * a live editor, and which one?".
 *
 * This is the missing *page-scoped* layer between the four surfaces that show a
 * document and the conversation-scoped edit target:
 *
 *   page-navigation-bridge   which page is current (and where to navigate)
 *   agent-editor-registry    which page currently has a visible editor  ← this
 *   session-page-binding     which page a conversation edits (and its owner leases)
 *   offscreen-editor-bridge  hidden editors for pages nothing shows on screen
 *
 * Why it is app-global rather than part of `SessionPageBinding`: a side pane or
 * a floating window can be opened before the conversation binding exists, by a
 * surface that never publishes one (the `/ai` workbench, a page-tree window),
 * or while a *different* conversation tab is focused. Routing the claim through
 * the conversation singleton made those claims disappear, so the agent acquired
 * a hidden editor for a page the user was literally looking at — two writers,
 * or no writer when the hidden one failed.
 *
 * Claims are keyed by page id and hold the LATEST live editor for that page
 * (kernel spec I10/I11: one writer per page, claims are idempotent per editor).
 * Consumers must still treat the returned editor as the single writer and drop
 * their hidden lease; this registry only records who that writer is.
 */

import { isLiveEditor } from "./plugin-agent/live-editor"
import { getOffscreenEditorBridge } from "./offscreen-editor-bridge"

/** Where the claiming editor lives. Diagnostics + future policy, not authority. */
export type AgentEditorRole = "visible" | "window" | "pane"

export interface AgentEditorRegistration {
    readonly pageId: string
    /** Tiptap editor bound to the page's collaborative Y.Doc. */
    readonly editor: any
    readonly role: AgentEditorRole
    readonly title?: string
    readonly spaceId?: string
}

interface Claim extends AgentEditorRegistration {
    /** Identity-stable token so one window's cleanup cannot drop another's claim. */
    readonly token: symbol
}

/**
 * Per-page stack: the newest claim is the active writer; older claims are still
 * live editors (a route tab and a side pane can show the same page). When the
 * newest one closes, the previous claim becomes active again instead of leaving
 * the page with no visible owner and silently spawning a hidden writer.
 */
const claims = new Map<string, Claim[]>()
const listeners = new Set<() => void>()

const toId = (pageId: string | number): string => String(pageId)

const notify = (): void => {
    for (const listener of [...listeners]) {
        try {
            listener()
        } catch {
            // A broken subscriber must not break the claim registry.
        }
    }
}

const activeClaim = (pageId: string): Claim | undefined => {
    const stack = claims.get(pageId)
    if (!stack) return undefined
    while (stack.length > 0 && !isLiveEditor(stack[stack.length - 1].editor)) {
        stack.pop()
    }
    if (stack.length === 0) {
        claims.delete(pageId)
        return undefined
    }
    return stack[stack.length - 1]
}

/**
 * Register `editor` as a visible writer for `pageId` (side pane, floating
 * window, route editor). Returns an idempotent unregister.
 *
 * Re-registering the same editor updates its metadata and moves it to the top
 * (it is the surface the user just interacted with) without creating a
 * duplicate entry.
 */
export function registerAgentEditor(registration: {
    pageId: string | number
    editor: any
    role?: AgentEditorRole
    title?: string
    spaceId?: string
}): () => void {
    const pageId = toId(registration.pageId)
    const role = registration.role ?? "visible"
    const stack = claims.get(pageId) ?? []
    const existingIndex = stack.findIndex(claim => claim.editor === registration.editor)
    if (existingIndex >= 0) {
        const existing = stack[existingIndex]
        const unchanged = existing.role === role
            && existing.title === registration.title
            && existing.spaceId === registration.spaceId
            && existingIndex === stack.length - 1
        if (unchanged) {
            return () => { unregisterAgentEditor(pageId, registration.editor, existing.token) }
        }
        stack.splice(existingIndex, 1)
        const updated: Claim = {
            ...existing,
            role,
            title: registration.title,
            spaceId: registration.spaceId,
        }
        stack.push(updated)
        claims.set(pageId, stack)
        getOffscreenEditorBridge()?.destroyIdle?.(pageId)
        notify()
        return () => { unregisterAgentEditor(pageId, registration.editor, updated.token) }
    }

    const claim: Claim = {
        pageId,
        editor: registration.editor,
        role,
        title: registration.title,
        spaceId: registration.spaceId,
        token: Symbol(pageId),
    }
    stack.push(claim)
    claims.set(pageId, stack)
    // Destroy an UNHELD hidden session immediately (held ones are released by
    // the surfaces on the notification below). This is the one place that knows
    // a visible editor took over, so the "only one writer" rule does not depend
    // on every surface remembering to call destroyIdle.
    getOffscreenEditorBridge()?.destroyIdle?.(pageId)
    notify()
    return () => { unregisterAgentEditor(pageId, registration.editor, claim.token) }
}

/**
 * Drop a claim. Without a token the TOP claim is dropped only when it still
 * belongs to `editor`, which makes a stale React cleanup harmless. Dropping a
 * non-top claim (a pane that closed while the route tab still shows the page)
 * just removes it from the stack and leaves the active writer unchanged.
 */
export function unregisterAgentEditor(
    pageId: string | number,
    editor: any,
    token?: symbol,
): void {
    const id = toId(pageId)
    const stack = claims.get(id)
    if (!stack) return
    let index = -1
    if (token) {
        index = stack.findIndex(claim => claim.token === token)
    } else {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
            if (stack[i].editor === editor) {
                index = i
                break
            }
        }
    }
    if (index < 0) return
    stack.splice(index, 1)
    if (stack.length === 0) claims.delete(id)
    notify()
}

/** The live editor showing `pageId`, or undefined. Destroyed editors are dropped. */
export function getAgentEditor(pageId: string | number | null | undefined): AgentEditorRegistration | undefined {
    if (pageId === null || pageId === undefined) return undefined
    return activeClaim(toId(pageId))
}

/** Reverse lookup: which page (and role) this editor is claimed for. */
export function findAgentEditor(editor: any): AgentEditorRegistration | undefined {
    if (!editor) return undefined
    for (const [pageId, stack] of claims) {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
            const claim = stack[i]
            if (claim.editor !== editor) continue
            if (!isLiveEditor(claim.editor)) continue
            return claim
        }
        // Prune a dead top claim lazily.
        activeClaim(pageId)
    }
    return undefined
}

/** Every live claim, for diagnostics and hosts that need to reconcile leases. */
export function listAgentEditors(): AgentEditorRegistration[] {
    const result: AgentEditorRegistration[] = []
    for (const [pageId, stack] of claims) {
        activeClaim(pageId)
        for (const { token: _token, ...claim } of stack) {
            if (isLiveEditor(claim.editor)) result.push(claim)
        }
    }
    return result
}

/**
 * Notified when a page is claimed or released. Surfaces subscribe to move their
 * conversation/owner leases to the claiming editor (and to re-acquire a hidden
 * one when the visible editor goes away) without waiting for the next render.
 */
export function subscribeAgentEditors(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

/** Test/teardown helper: drop every claim. */
export function clearAgentEditors(): void {
    if (claims.size === 0) return
    claims.clear()
    notify()
}
