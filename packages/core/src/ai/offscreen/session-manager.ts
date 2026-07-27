import type { OffscreenEditorHandle } from "@kn/common"

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
/** Max simultaneously mounted sessions; idle ones beyond this are LRU-evicted. */
const MAX_SESSIONS = 3

interface Waiter {
    resolve: (handle: OffscreenEditorHandle) => void
    reject: (error: Error) => void
}

interface SessionRecord {
    pageId: string
    status: 'pending' | 'ready' | 'error'
    refCount: number
    lastUsedAt: number
    waiters: Waiter[]
    /** Set by the host once the editor is synced + content-ready. */
    editor: any | null
    title?: string
    /** Host-provided persister (incremental saveNow). */
    flush: (() => Promise<void>) | null
    idleTimer: ReturnType<typeof setTimeout> | null
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

/** Flush (best effort) then drop the session; the host unmounts its editor. */
const destroySession = async (pageId: string): Promise<void> => {
    const record = sessions.get(pageId)
    if (!record) return
    clearIdleTimer(record)
    sessions.delete(pageId)
    try {
        await record.flush?.()
    } catch { /* stays dirty server-side; the collab doc still has the edits */ }
    notify()
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
    if (sessions.size < MAX_SESSIONS) return
    const idle = [...sessions.values()]
        .filter(s => s.refCount <= 0)
        .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
    // Evict enough idle sessions to make room for one more.
    for (const record of idle) {
        if (sessions.size < MAX_SESSIONS) break
        void destroySession(record.pageId)
    }
}

/** Build the per-acquire handle; `release` is idempotent per holder. */
const buildHandle = (record: SessionRecord): OffscreenEditorHandle => {
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
            if (!current) return
            current.refCount = Math.max(0, current.refCount - 1)
            current.lastUsedAt = Date.now()
            if (current.refCount <= 0) scheduleIdleDestroy(current)
        },
    }
}

export const offscreenSessionManager = {
    /**
     * Acquire (or reuse) a session for the page. Resolves once the host has
     * reported readiness (collab synced or timeout fallback + content ready).
     */
    acquire(pageId: string): Promise<OffscreenEditorHandle> {
        const id = String(pageId)
        let record = sessions.get(id)

        if (!record) {
            evictIfNeeded()
            record = {
                pageId: id,
                status: 'pending',
                refCount: 0,
                lastUsedAt: Date.now(),
                waiters: [],
                editor: null,
                flush: null,
                idleTimer: null,
            }
            sessions.set(id, record)
            notify()
        }

        record.refCount++
        record.lastUsedAt = Date.now()
        clearIdleTimer(record)

        if (record.status === 'ready') {
            return Promise.resolve(buildHandle(record))
        }
        return new Promise<OffscreenEditorHandle>((resolve, reject) => {
            record!.waiters.push({ resolve, reject })
        })
    },

    /** Host callback: the session's editor is ready for programmatic edits. */
    markReady(pageId: string, ready: { editor: any; title?: string; flush: () => Promise<void> }): void {
        const record = sessions.get(String(pageId))
        if (!record) return
        record.status = 'ready'
        record.editor = ready.editor
        record.title = ready.title
        record.flush = ready.flush
        const waiters = record.waiters.splice(0)
        waiters.forEach(w => w.resolve(buildHandle(record)))
    },

    /** Host callback: the session failed (page load error, etc.). */
    markError(pageId: string, error: Error): void {
        const record = sessions.get(String(pageId))
        if (!record) return
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
