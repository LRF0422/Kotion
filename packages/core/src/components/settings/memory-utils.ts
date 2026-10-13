/**
 * Pure list logic behind the memory-management panel (设置 → 记忆管理).
 *
 * Deliberately import-free: the panel's list behaviours (scope parsing, scope
 * grouping, sorting, "load more" merging) are exercised by plain `tsc` + `node`
 * in `memory-utils.check.ts`, the same way the other `*.check.ts` files are.
 * Callers pass real `MemoryItem`s — the local interfaces are structural.
 */

/** The fields this module reads from a long-term memory row. */
export interface MemoryLike {
    memoryId: string
    /** Scope key: `u:{userId}` / `u:{userId}:s:{spaceId}` / `…:p:{pageId}`. */
    scope: string
    type: string
    importance: number
    createTime: number
    lastAccessTime?: number
}

export type MemoryScopeKind = 'user' | 'space' | 'page' | 'unknown'

export interface ParsedMemoryScope {
    kind: MemoryScopeKind
    /** Owner id from the scope key; `''` when the key is malformed. */
    userId: string
    spaceId?: string
    pageId?: string
}

/**
 * Parse the backend scope key. `:s:` / `:p:` are the only separators that
 * matter, and an id may itself contain `:` — so split on the separators and
 * re-join the remainder instead of assuming a fixed number of segments.
 */
export function parseMemoryScope(scope?: string | null): ParsedMemoryScope {
    const raw = (scope ?? '').trim()
    if (!raw.startsWith('u:')) {
        return { kind: 'unknown', userId: '' }
    }
    const [head, ...pageRest] = raw.split(':p:')
    const [ownerPart, ...spaceRest] = head.split(':s:')
    const userId = ownerPart.slice(2)
    if (!userId) {
        return { kind: 'unknown', userId: '' }
    }
    const spaceId = spaceRest.join(':s:')
    const pageId = pageRest.join(':p:')
    if (pageId) {
        return { kind: 'page', userId, spaceId, pageId }
    }
    if (spaceId) {
        return { kind: 'space', userId, spaceId }
    }
    return { kind: 'user', userId }
}

/** Display order of scope kinds: broadest first, malformed last. */
export const MEMORY_SCOPE_ORDER: readonly MemoryScopeKind[] = ['user', 'space', 'page', 'unknown']

export interface MemoryScopeGroup<T> {
    kind: MemoryScopeKind
    items: T[]
}

/**
 * Group rows by scope kind, dropping empty groups and keeping the caller's
 * order inside each group (the server already sorted them).
 */
export function groupMemoriesByScope<T extends MemoryLike>(items: T[]): Array<MemoryScopeGroup<T>> {
    const buckets = new Map<MemoryScopeKind, T[]>()
    for (const item of items) {
        const { kind } = parseMemoryScope(item.scope)
        const bucket = buckets.get(kind)
        if (bucket) {
            bucket.push(item)
        } else {
            buckets.set(kind, [item])
        }
    }
    return MEMORY_SCOPE_ORDER
        .filter(kind => buckets.has(kind))
        .map(kind => ({ kind, items: buckets.get(kind)! }))
}

export type MemorySortKey = 'recent' | 'importance'

/**
 * Sort for display. `recent` = newest first (the server's browse order, kept as
 * the default); `importance` = importance desc, then newest first. Both are
 * stable, so equal rows never shuffle between renders.
 */
export function sortMemories<T extends MemoryLike>(items: T[], key: MemorySortKey): T[] {
    const sorted = [...items]
    if (key === 'recent') {
        sorted.sort((a, b) => b.createTime - a.createTime)
    } else {
        sorted.sort((a, b) => b.importance - a.importance || b.createTime - a.createTime)
    }
    return sorted
}

/**
 * Merge an appended page into the loaded list. Ids are stable server-side, so
 * a row re-sent because it moved between pages (offset paging over a changing
 * set) must not render twice — and the fresh copy wins.
 */
export function mergeMemoryPages<T extends MemoryLike>(loaded: T[], incoming: T[]): T[] {
    const merged: T[] = []
    const indexById = new Map<string, number>()
    for (const item of [...loaded, ...incoming]) {
        const existing = indexById.get(item.memoryId)
        if (existing == null) {
            indexById.set(item.memoryId, merged.length)
            merged.push(item)
        } else {
            merged[existing] = item
        }
    }
    return merged
}

/** Memory kinds the backend stores; anything else is shown as a note. */
export const MEMORY_KINDS = ['fact', 'preference', 'note', 'episode'] as const

export type MemoryKind = (typeof MEMORY_KINDS)[number]

/** Coerce an unknown wire value to a known kind (i18n keys are derived from it). */
export function memoryKind(type?: string | null): MemoryKind {
    const value = (type ?? '').trim().toLowerCase()
    return (MEMORY_KINDS as readonly string[]).includes(value) ? (value as MemoryKind) : 'note'
}
