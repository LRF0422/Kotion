/**
 * Merge rules between the backend session index and the browser's local cache.
 *
 * These live outside the React hook because the tie-breaks decide whether the
 * user's own action survives a reload, and that is worth pinning with a plain
 * node check (`chat-session-merge.check.ts`) instead of a browser test.
 *
 * Structural input types only: `ChatSessionMeta` / `ChatSessionGroup` match them
 * and the check runs without the app's module graph.
 */

/** The slice of session metadata the merge cares about. */
export interface MergeSessionMeta {
    id: string
    updatedAt?: number
    /**
     * Conversation group. A group MOVE is a metadata-only write that must not
     * advance `updatedAt` (that column orders the recency list), so the merge
     * needs its own tie-break for it — see {@link mergeSessionMeta}.
     */
    groupId?: string
}

/** The slice of group metadata the merge cares about. */
export interface MergeGroupMeta {
    id: string
    sortIndex: number
    createdAt: number
    updatedAt?: number
}

/** Display order shared by the hook and the sidebar: position, then age, then id. */
export function compareGroups(a: MergeGroupMeta, b: MergeGroupMeta): number {
    return a.sortIndex - b.sortIndex
        || a.createdAt - b.createdAt
        || a.id.localeCompare(b.id)
}

/**
 * Union of remote and local SESSION metadata.
 *
 * The backend list is authoritative on recency, but the local copy still wins
 * two cases:
 *  - it is strictly newer (a metadata PUT that has not been observed yet);
 *  - the timestamps are EQUAL and the group assignment differs. A move never
 *    bumps `updatedAt`, so an equal-timestamp remote row would otherwise undo a
 *    move the client had just saved. This also covers "moved on this device,
 *    then reloaded before the server list refreshed".
 */
export function mergeSessionMeta<T extends MergeSessionMeta>(remote: T[], local: T[]): T[] {
    const byId = new Map<string, T>()
    for (const session of remote) byId.set(session.id, session)
    for (const session of local) {
        const existing = byId.get(session.id)
        if (!existing) {
            byId.set(session.id, session)
            continue
        }
        const localTime = session.updatedAt || 0
        const remoteTime = existing.updatedAt || 0
        if (localTime > remoteTime) {
            byId.set(session.id, session)
            continue
        }
        // Only an EXACT tie falls back to the group tie-break: a newer remote row
        // (moved on another device) must keep its assignment.
        if (localTime === remoteTime && (session.groupId ?? '') !== (existing.groupId ?? '')) {
            byId.set(session.id, { ...existing, groupId: session.groupId })
        }
    }
    return [...byId.values()]
}

/**
 * Union of remote and local GROUP metadata, in display order.
 *
 * Groups are created offline first, so a local-only group must survive the merge
 * (the hook uploads it afterwards). For the same id the newer write wins, and an
 * exact tie keeps the backend copy — unlike sessions there is no client-only
 * field to protect.
 */
export function mergeGroupMeta<T extends MergeGroupMeta>(remote: T[], local: T[]): T[] {
    const byId = new Map<string, T>()
    for (const group of remote) byId.set(group.id, group)
    for (const group of local) {
        const existing = byId.get(group.id)
        if (!existing || (group.updatedAt || 0) > (existing.updatedAt || 0)) {
            byId.set(group.id, group)
        }
    }
    return [...byId.values()].sort(compareGroups)
}