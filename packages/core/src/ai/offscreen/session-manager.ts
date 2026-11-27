
/**
 * The handle contract is structurally identical to `@kn/common`'s
 * `OffscreenSessionHandle`. It is declared here so this bookkeeping module has
 * no runtime/type dependency on the common package: the engine's bridge
 * (`offscreen/index.ts`) still type-checks the returned shape against the
 * published contract.
 */
export interface OffscreenSessionHandle {
    pageId: string
    title?: string
    editor: any
    flush: () => Promise<void>
    release: () => void
}

/**
 * Mirrors `@kn/common`'s `isLiveEditor`: `isDestroyed` is the only reliable Tiptap
 * signal (after `destroy()` its state/view getters no longer answer).
 */
const editorIsLive = (editor: any): boolean => !!editor && editor.isDestroyed !== true

/**
 * Off-screen editing session manager (module-level singleton, no React).
 *
 * Owns the *bookkeeping* of hidden collaborative editor sessions: which pages
 * have one, who is waiting for readiness, ref-counts, idle expiry and the LRU
 * cap. The actual editor lifecycle (Y.Doc, provider, incremental save) lives
 * in OffscreenEditorHost, which subscribes to this registry, mounts one
 * hidden CollaborationEditor per session and reports back via markReady /
 * markError / the flush hook.
 */

/** Destroy a session this long after its last holder released it. */
const IDLE_TIMEOUT_MS = 60_000
/**
 * Max simultaneously mounted sessions; idle ones beyond this are LRU-evicted.
 * Sessions that still have holders (a conversation target, or a delegated agent
 * editing its own page) are never evicted, so the cap only limits *idle* ones.
 * Raised from 3 because parallel delegation can legitimately hold several.
 */
let maxSessions = 6
/** Acquire wait cap — readiness must arrive within this window or the caller errors. */
let acquireTimeoutMs = 15_000

/** Adjust the acquire wait cap (tests / hosts with very slow rooms). */
export function setAcquireTimeoutMs(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return
    acquireTimeoutMs = Math.floor(ms)
}
/** Generation source: monotonic across the app so a reset never reuses a key. */
let nextGeneration = 1

const newRecord = (pageId: string): SessionRecord => ({
    pageId,
    generation: nextGeneration++,
    status: 'pending',
    refCount: 0,
    lastUsedAt: Date.now(),
    waiters: [],
    editor: null,
    flush: null,
    idleTimer: null,
    closed: null,
    resolveClosed: null,
})

/** Adjust the idle-session cap (host configuration / tests). */
export function setMaxOffscreenSessions(limit: number): void {
    if (!Number.isFinite(limit) || limit < 1) return
    maxSessions = Math.floor(limit)
}

interface Waiter {
    resolve: (handle: OffscreenSessionHandle) => void
    reject: (error: Error) => void
}

interface SessionRecord {
    pageId: string
    /**
     * Identity of THIS mount of the hidden editor.
     *
     * A record can be reset while the page id stays the same (the editor died
     * under a live record, HMR replaced it, the host remounted). The host keys
     * its mounted `OffscreenSession` by `pageId:generation`, so a reset really
     * remounts the editor instead of reusing the dead one, and late callbacks
     * from the old mount (`markReady` / `markError`) cannot touch the new one.
     */
    generation: number
    status: 'pending' | 'ready' | 'error' | 'closing'
    refCount: number
    lastUsedAt: number
    waiters: Waiter[]
    /** Set by the host once the editor is synced + content-ready. */
    editor: any | null
    title?: string
    /** Host-provided persister (incremental saveNow). */
    flush: (() => Promise<void>) | null
    idleTimer: ReturnType<typeof setTimeout> | null
    /** Resolves once a `closing` record has flushed and left the map. */
    closed: Promise<void> | null
    resolveClosed: (() => void) | null
}

type Listener = () => void

const sessions = new Map<string, SessionRecord>()
const listeners = new Set<Listener>()

const notify = (): void => {
    listeners.forEach(l => {
        try { l() } catch { /* listener errors must not break the manager */ }
    })
}

const clearIdleTimer = (record: SessionRecord): void => {
    if (record.idleTimer) {
        clearTimeout(record.idleTimer)
        record.idleTimer = null
    }
}

/** Flush (best effort) THEN drop the session; the host unmounts its editor. */
const destroySession = async (pageId: string): Promise<void> => {
    const record = sessions.get(pageId)
    if (!record) return
    // A second caller must not start a second flush. It waits for this one and
    // then can re-acquire: `acquire` treats `closing` as "wait, then start a
    // fresh generation", so it can never hand out the editor being destroyed.
    if (record.status === 'closing') {
        await record.closed
        return
    }
    record.status = 'closing'
    clearIdleTimer(record)
    record.closed = new Promise<void>(resolve => { record.resolveClosed = resolve })
    // Flush FIRST: previously the record was deleted before the await, so a
    // re-acquire during the flush installed a NEW record whose refCount was
    // then decremented by the old handle's release — a refCount leak.
    try {
        await record.flush?.()
    } catch { /* stays dirty server-side; the collab doc still has the edits */ }
    // Only drop when the map still holds THIS record (re-acquire race guard).
    if (sessions.get(pageId) === record) {
        sessions.delete(pageId)
        notify()
    }
    record.resolveClosed?.()
    record.resolveClosed = null
}

const scheduleIdleDestroy = (record: SessionRecord): void => {
    clearIdleTimer(record)
    record.idleTimer = setTimeout(() => {
        const current = sessions.get(record.pageId)
        if (current && current.refCount <= 0) {
            void destroySession(record.pageId)
        }
    }, IDLE_TIMEOUT_MS)
}

/** Evict the least-recently-used idle session when over the cap. */
const evictIfNeeded = (): void => {
    if (sessions.size < maxSessions) return
    const idle = [...sessions.values()]
        .filter(s => s.status !== 'closing' && s.refCount <= 0)
        .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
    // Evict enough *idle* sessions to make room for one more. Held sessions
    // (conversation target, delegated agent) are never dropped: over-cap while
    // everything is in use is expected, and correctness beats the cap.
    for (const record of idle) {
        if (sessions.size < maxSessions) break
        void destroySession(record.pageId)
    }
}

/** Idle sessions currently held for eviction accounting (diagnostics). */
export function offscreenSessionStats(): {
    total: number
    held: number
    cap: number
    pageIds: string[]
} {
    const all = [...sessions.values()]
    return {
        total: all.length,
        held: all.filter(s => s.refCount > 0).length,
        cap: maxSessions,
        pageIds: all.map(s => s.pageId),
    }
}

/** Build the per-acquire handle; `release` is idempotent per holder. */
const buildHandle = (record: SessionRecord): OffscreenSessionHandle => {
    let released = false
    return {
        pageId: record.pageId,
        title: record.title,
        editor: record.editor,
        flush: async () => {
            const current = sessions.get(record.pageId)
            if (current) current.lastUsedAt = Date.now()
            await record.flush?.()
        },
        release: () => {
            if (released) return
            released = true
            const current = sessions.get(record.pageId)
            // The record may have been REPLACED (stale generation) or dropped
            // since this handle was issued. Decrementing whatever record now
            // owns the page would steal a ref from a live consumer and make the
            // fresh session eligible for idle destruction — one of the ways a
            // page ended up "ready" but with a dead editor.
            if (current !== record) return
            current.refCount = Math.max(0, current.refCount - 1)
            current.lastUsedAt = Date.now()
            if (current.refCount <= 0) scheduleIdleDestroy(current)
        },
    }
}

/** Bounded wait for a NEW record to become ready. */
const waitForReady = (record: SessionRecord): Promise<OffscreenSessionHandle> => new Promise((resolve, reject) => {
    // Bounded wait: a host that never reaches readiness (page load failure
    // without markError, dead WS, etc.) used to leave the caller's promise
    // pending forever. Time out and surface an error.
    const timeout = setTimeout(() => {
        const idx = record.waiters.findIndex(w => w.reject === reject)
        if (idx < 0) return
        record.waiters.splice(idx, 1)
        record.refCount = Math.max(0, record.refCount - 1)
        if (record.refCount <= 0) scheduleIdleDestroy(record)
        reject(new Error('Offscreen editor session timed out waiting for readiness'))
    }, acquireTimeoutMs)
    record.waiters.push({
        resolve: handle => {
            clearTimeout(timeout)
            resolve(handle)
        },
        reject: error => {
            clearTimeout(timeout)
            reject(error)
        },
    })
})

/**
 * Acquire a session that is GUARANTEED to expose a live editor.
 *
 * The old path trusted `record.status === 'ready'` and handed the editor over
 * without asking whether it still existed. A ready record whose editor had been
 * destroyed (HMR replaced it, the host remounted it, the collaboration provider
 * was rebuilt) was therefore returned forever: every document tool failed with
 * "无法取得编辑目标…的编辑器" and nothing ever repaired the session.
 *
 * Here a dead ready record is dropped and a NEW generation is created, so the
 * host remounts a real editor; a record that is still flushing is awaited
 * instead of being handed out just before it disappears.
 */
async function acquireSession(id: string): Promise<OffscreenSessionHandle> {
    for (;;) {
        let record = sessions.get(id)
        if (record?.status === 'closing') {
            // Never hand out the editor that is currently being destroyed.
            await record.closed
            continue
        }
        if (record && (record.status === 'error'
            || (record.status === 'ready' && !editorIsLive(record.editor)))) {
            // Stale record: the host must mount a NEW editor. Removing it and
            // notifying before installing the replacement changes the
            // generation, which is what makes the host remount instead of
            // reusing the dead instance.
            console.warn('[agent] offscreen session editor is gone; rebuilding the session', {
                pageId: id,
                generation: record.generation,
            })
            clearIdleTimer(record)
            sessions.delete(id)
            notify()
            record = undefined
        }
        if (!record) {
            evictIfNeeded()
            record = newRecord(id)
            sessions.set(id, record)
            notify()
        }

        record.refCount++
        record.lastUsedAt = Date.now()
        clearIdleTimer(record)

        if (record.status === 'ready') {
            if (editorIsLive(record.editor)) return buildHandle(record)
            // It died between the check and here; give the ref back and retry.
            record.refCount = Math.max(0, record.refCount - 1)
            if (sessions.get(id) === record) {
                clearIdleTimer(record)
                sessions.delete(id)
                notify()
            }
            continue
        }
        return waitForReady(record)
    }
}

export const offscreenSessionManager = {
    /**
     * Acquire (or reuse) a session for the page. Resolves once the host has
     * reported readiness (collab synced or timeout fallback + content ready).
     */
    acquire(pageId: string): Promise<OffscreenSessionHandle> {
        return acquireSession(String(pageId))
    },

    /**
     * Destroy a page's session immediately when it has no holders. A visible
     * editor claiming the page must stop the hidden one from writing at once —
     * the idle timeout would leave two writers for up to a minute.
     */
    destroyIdle(pageId: string): void {
        const record = sessions.get(String(pageId))
        if (!record || record.status === 'closing' || record.refCount > 0) return
        void destroySession(String(pageId))
    },

    /**
     * Host callback: the session's editor is ready for programmatic edits.
     *
     * Allowed (and expected) more than once per page: if React/HMR produces a
     * NEW editor instance, the host reports it again and this replaces the old
     * one before any consumer can see it. `generation` pins the report to the
     * mount that produced it, so a late callback from a superseded mount can
     * never overwrite the current editor.
     */
    markReady(
        pageId: string,
        ready: { editor: any; title?: string; flush: () => Promise<void> },
        generation?: number,
    ): void {
        const record = sessions.get(String(pageId))
        if (!record) return
        if (generation !== undefined && record.generation !== generation) return
        // A record being destroyed must not go back to ready; its editor is
        // about to unmount and consumers would get a doomed handle.
        if (record.status === 'closing') return
        // A destroyed editor must never become the session's answer.
        if (!editorIsLive(ready.editor)) return
        record.status = 'ready'
        record.editor = ready.editor
        record.title = ready.title
        record.flush = ready.flush
        const waiters = record.waiters.splice(0)
        waiters.forEach(w => w.resolve(buildHandle(record)))
    },

    /** Host callback: the session failed (page load error, etc.). */
    markError(pageId: string, error: Error, generation?: number): void {
        const record = sessions.get(String(pageId))
        if (!record) return
        // A superseded mount reporting its own teardown must not kill the new
        // generation (this was a real race during remounts).
        if (generation !== undefined && record.generation !== generation) return
        record.status = 'error'
        const waiters = record.waiters.splice(0)
        sessions.delete(String(pageId))
        clearIdleTimer(record)
        notify()
        waiters.forEach(w => w.reject(error))
    },

    /** Page ids the host should currently have mounted. */
    getSessionIds(): string[] {
        return [...sessions.keys()]
    },

    /**
     * Sessions the host must mount, WITH their generation.
     *
     * The host keys each mounted editor by `pageId:generation`. A stale record
     * reset (dead editor) therefore remounts a fresh editor instead of keeping
     * the dead one, and a late callback from the old mount is ignored.
     */
    getSessions(): Array<{ pageId: string; generation: number }> {
        return [...sessions.values()].map(s => ({ pageId: s.pageId, generation: s.generation }))
    },

    /** Subscribe to session add/remove; returns an unsubscribe fn. */
    subscribe(listener: Listener): () => void {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
    },

    /** Flush and drop every session (host unmount / app teardown). */
    async destroyAll(): Promise<void> {
        const ids = [...sessions.keys()]
        await Promise.all(ids.map(id => destroySession(id)))
    },
}
