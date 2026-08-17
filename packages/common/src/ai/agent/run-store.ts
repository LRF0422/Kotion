/**
 * RunStore — local persistence of the run handles the UI needs for 断点恢复
 * (reconnect/re-attach): { conversationId → runId, lastSeq, ttl }. Plus a
 * BroadcastChannel tab lock so only one tab streams a given run at a time.
 */

export interface SavedRun {
    conversationId: string
    runId: string
    lastSeq: number
    /** Status snapshot at save time (attach decision). */
    status?: string
    updatedAt: number
}

export interface RunStoreOptions {
    storage?: Storage
    /** Default TTL after which a saved handle is considered stale (ms). */
    ttlMs?: number
}

const PREFIX = 'agentcore:run:'

export class RunStore {
    private readonly storage: Storage
    private readonly ttlMs: number

    constructor(options: RunStoreOptions = {}) {
        this.storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined as any)
        this.ttlMs = options.ttlMs ?? 30 * 60 * 1000
    }

    private key(conversationId: string): string {
        return PREFIX + conversationId
    }

    save(entry: SavedRun): void {
        try {
            this.storage?.setItem(this.key(entry.conversationId), JSON.stringify({ ...entry, updatedAt: Date.now() }))
        } catch {
            // storage unavailable — recovery simply won't survive a refresh
        }
    }

    /** Load a handle; returns null when absent or beyond the TTL. */
    load(conversationId: string): SavedRun | null {
        try {
            const raw = this.storage?.getItem(this.key(conversationId))
            if (!raw) return null
            const entry = JSON.parse(raw) as SavedRun
            if (Date.now() - entry.updatedAt > this.ttlMs) {
                this.clear(conversationId)
                return null
            }
            return entry
        } catch {
            return null
        }
    }

    updateLastSeq(conversationId: string, lastSeq: number, status?: string): void {
        const entry = this.load(conversationId)
        if (!entry) return
        this.save({ ...entry, lastSeq, status })
    }

    clear(conversationId: string): void {
        try {
            this.storage?.removeItem(this.key(conversationId))
        } catch {
            // ignore
        }
    }
}

// ==================== tab lock ====================

const LOCK_PREFIX = 'agentcore:lock:'
const LOCK_HEARTBEAT_MS = 2000
const LOCK_STALE_MS = 6000

/**
 * Cooperative tab lock: exactly one tab streams a run at a time. Claims are
 * heartbeats in localStorage; a claim is stale after LOCK_STALE_MS.
 */
export class RunLock {
    private channel: BroadcastChannel | null = null
    private keepAliveTimer: ReturnType<typeof setInterval> | null = null
    private lockedRunId: string | null = null
    private readonly tabId = Math.random().toString(36).slice(2)

    private key(runId: string): string {
        return LOCK_PREFIX + runId
    }

    /** Try to claim the run for this tab. */
    acquire(runId: string): boolean {
        try {
            const key = this.key(runId)
            const raw = localStorage.getItem(key)
            if (raw) {
                const holder = JSON.parse(raw) as { tabId: string; at: number }
                if (holder.tabId !== this.tabId && Date.now() - holder.at < LOCK_STALE_MS) {
                    return false // another tab is actively streaming it
                }
            }
            localStorage.setItem(key, JSON.stringify({ tabId: this.tabId, at: Date.now() }))
            this.lockedRunId = runId
            this.startKeepAlive()
            return true
        } catch {
            return true // storage unavailable — don't block the stream
        }
    }

    /** Release the claim and stop heartbeats. */
    release(): void {
        this.stopKeepAlive()
        try {
            if (this.lockedRunId) {
                const key = this.key(this.lockedRunId)
                const raw = localStorage.getItem(key)
                if (raw) {
                    const holder = JSON.parse(raw) as { tabId: string }
                    if (holder.tabId === this.tabId) {
                        localStorage.removeItem(key)
                    }
                }
            }
        } catch {
            // ignore
        }
        this.lockedRunId = null
    }

    private startKeepAlive(): void {
        if (this.keepAliveTimer) return
        this.keepAliveTimer = setInterval(() => {
            try {
                if (this.lockedRunId) {
                    localStorage.setItem(this.key(this.lockedRunId),
                        JSON.stringify({ tabId: this.tabId, at: Date.now() }))
                }
            } catch {
                // ignore
            }
        }, LOCK_HEARTBEAT_MS)
    }

    private stopKeepAlive(): void {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer)
            this.keepAliveTimer = null
        }
    }
}
