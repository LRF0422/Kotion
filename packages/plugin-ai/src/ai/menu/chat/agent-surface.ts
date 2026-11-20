/**
 * Which AI surface currently DRIVES a conversation: the side dock or the full
 * `/ai` page.
 *
 * Both surfaces mount the same open conversations (they share the session
 * index), and `useEditorAgent` takes a per-conversation tab lock. Without an
 * owner, the second surface either failed with RUN_BUSY or, worse, closed the
 * first one's tab and cancelled the run. This module makes the ownership
 * explicit:
 *
 *  - the surface that is actually on screen claims the conversation;
 *  - the other one yields at a SAFE boundary (abort the local stream, release
 *    the lock, keep the run) and attaches again when it gets ownership back;
 *  - a surface that is waiting on a frontend tool / approval / plan / budget
 *    KEEPS ownership, and the other surface shows a "running on the other
 *    surface" banner instead of mounting a second agent.
 *
 * The rules are intentionally in a tiny module-level store: both surfaces live
 * in the same JS context, so a synchronous claim is enough (no storage, no
 * cross-tab protocol — the existing RunLock still fences real browser tabs).
 */

import { useSyncExternalStore } from 'react'

export type AgentSurfaceId = 'dock' | 'kernel'

/**
 * Mirrors the SDK's `EditorAgentPhase`. Declared locally so this module (and
 * its plain-node check) does not pull the @kn/common barrel and its JSX graph.
 */
export type AgentSurfacePhase =
    | 'idle'
    | 'creating'
    | 'streaming'
    | 'waiting-tools'
    | 'waiting-approval'
    | 'suspended'
    | 'completed'
    | 'failed'
    | 'cancelled'

const owners = new Map<string, AgentSurfaceId>()
/** Which surfaces currently have a conversation panel mounted (even if passive). */
const mounted = new Map<string, Set<AgentSurfaceId>>()
const listeners = new Set<() => void>()

function emit(): void {
    listeners.forEach(listener => {
        try {
            listener()
        } catch {
            // A subscriber must never break ownership bookkeeping.
        }
    })
}

/** Current driver for a conversation, or null when nobody mounted claims it. */
export function getAgentSurfaceOwner(conversationId: string): AgentSurfaceId | null {
    if (!conversationId) return null
    return owners.get(conversationId) ?? null
}

/**
 * Claim a conversation for one surface. Idempotent for the current owner;
 * returns false while another surface owns it (that surface yields when safe).
 */
export function claimAgentSurface(conversationId: string, surface: AgentSurfaceId): boolean {
    if (!conversationId) return false
    const current = owners.get(conversationId)
    if (current === surface) return true
    if (current) return false
    owners.set(conversationId, surface)
    emit()
    return true
}

/** Release only if this surface still owns it (a late unmount must not steal). */
export function releaseAgentSurface(conversationId: string, surface: AgentSurfaceId): void {
    if (!conversationId) return
    if (owners.get(conversationId) !== surface) return
    owners.delete(conversationId)
    emit()
}

/**
 * Announce that a surface has a panel for this conversation. The dock uses this
 * to decide whether `/ai` can actually take a conversation over: the two
 * `useChatSessions` instances can briefly disagree about the open-tab list, and
 * yielding to a page that has not mounted the conversation would strand it.
 */
export function registerAgentSurfaceMount(conversationId: string, surface: AgentSurfaceId): () => void {
    if (!conversationId) return () => undefined
    const surfaces = mounted.get(conversationId) ?? new Set<AgentSurfaceId>()
    surfaces.add(surface)
    mounted.set(conversationId, surfaces)
    emit()
    let active = true
    return () => {
        if (!active) return
        active = false
        const current = mounted.get(conversationId)
        if (!current) return
        current.delete(surface)
        if (current.size === 0) mounted.delete(conversationId)
        emit()
    }
}

export function isAgentSurfaceMounted(conversationId: string, surface: AgentSurfaceId): boolean {
    return mounted.get(conversationId)?.has(surface) ?? false
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

/** React subscription: re-renders the surface when the owner changes. */
export function useAgentSurfaceOwner(conversationId: string): AgentSurfaceId | null {
    return useSyncExternalStore(
        subscribe,
        () => getAgentSurfaceOwner(conversationId),
        () => null,
    )
}

/** React subscription: whether a given surface has a panel for the conversation. */
export function useAgentSurfaceMounted(conversationId: string, surface: AgentSurfaceId): boolean {
    return useSyncExternalStore(
        subscribe,
        () => isAgentSurfaceMounted(conversationId, surface),
        () => false,
    )
}

/**
 * Whether the current surface may hand the run over: no in-flight create, no
 * pending frontend tool batch, no approval card, no plan/budget pause. A
 * streaming model turn is safe — the backend run does not depend on the stream.
 */
export function canYieldAgentSurface(
    phase: AgentSurfacePhase,
    pendingToolIds: readonly string[],
    hasPendingApproval: boolean,
): boolean {
    if (hasPendingApproval || pendingToolIds.length > 0) return false
    if (phase === 'idle' || phase === 'streaming') return true
    return phase === 'completed' || phase === 'failed' || phase === 'cancelled'
}