/**
 * RunStore — local persistence of the run handles the UI needs for 断点恢复
 * (reconnect/re-attach): { conversationId → runId, lastSeq, ttl }. Plus a
 * cooperative tab lock so only one tab drives a conversation at a time.
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
const TOOL_RESULTS_PREFIX = 'agentcore:tool-results:'

export interface SavedToolResult {
    status?: 'started' | 'completed'
    ok: boolean
    result?: unknown
    error?: string
}

interface SavedToolResults {
    updatedAt: number
    results: Record<string, SavedToolResult>
}

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

    saveToolStarted(runId: string, callId: string): boolean {
        return this.saveToolResult(runId, callId, {
            status: 'started',
            ok: false,
            error: 'Tool execution started but has no durable result yet',
        })
    }

    saveToolResult(runId: string, callId: string, result: SavedToolResult): boolean {
        try {
            if (!this.storage) return false
            const saved = this.loadToolResults(runId)
            saved.results[callId] = { ...result, status: result.status ?? 'completed' }
            saved.updatedAt = Date.now()
            this.storage.setItem(TOOL_RESULTS_PREFIX + runId, JSON.stringify(saved))
            return true
        } catch {
            return false
        }
    }

    loadToolResult(runId: string, callId: string): SavedToolResult | null {
        return this.loadToolResults(runId).results[callId] ?? null
    }

    clearToolResult(runId: string, callId: string): void {
        try {
            const saved = this.loadToolResults(runId)
            delete saved.results[callId]
            if (Object.keys(saved.results).length === 0) {
                this.storage?.removeItem(TOOL_RESULTS_PREFIX + runId)
            } else {
                saved.updatedAt = Date.now()
                this.storage?.setItem(TOOL_RESULTS_PREFIX + runId, JSON.stringify(saved))
            }
        } catch {
            // ignore
        }
    }

    clearToolResults(runId: string): void {
        try {
            this.storage?.removeItem(TOOL_RESULTS_PREFIX + runId)
        } catch {
            // ignore
        }
    }

    private loadToolResults(runId: string): SavedToolResults {
        try {
            const raw = this.storage?.getItem(TOOL_RESULTS_PREFIX + runId)
            if (!raw) return { updatedAt: Date.now(), results: {} }
            const saved = JSON.parse(raw) as SavedToolResults
            if (!saved || typeof saved.updatedAt !== 'number' || !saved.results || typeof saved.results !== 'object') {
                return { updatedAt: Date.now(), results: {} }
            }
            if (Date.now() - saved.updatedAt > this.ttlMs) {
                this.storage?.removeItem(TOOL_RESULTS_PREFIX + runId)
                return { updatedAt: Date.now(), results: {} }
            }
            return saved
        } catch {
            return { updatedAt: Date.now(), results: {} }
        }
    }
}

// ==================== tab lock ====================

const LOCK_PREFIX = 'agentcore:lock:'
const LOCK_HEARTBEAT_MS = 2000
const LOCK_STALE_MS = 6000

/**
 * Cooperative tab lock: exactly one tab drives a conversation at a time. The
 * Web Locks API provides atomic acquisition; localStorage heartbeats are the
 * compatibility fallback and expire after LOCK_STALE_MS.
 */
export class RunLock {
    private keepAliveTimer: ReturnType<typeof setInterval> | null = null
    private webLockRelease: (() => void) | null = null
    private lockedScopeId: string | null = null
    private claimEpoch = 0
    private readonly tabId = Math.random().toString(36).slice(2)

    private key(scopeId: string): string {
        return LOCK_PREFIX + scopeId
    }

    /** Try to atomically claim a conversation scope for this tab. */
    async acquire(scopeId: string): Promise<number | null> {
        if (this.lockedScopeId === scopeId) return null
        if (this.lockedScopeId) this.release()

        if (typeof navigator !== 'undefined' && navigator.locks) {
            try {
                return await new Promise<number | null>((resolve, reject) => {
                    void navigator.locks.request(
                        this.key(scopeId),
                        { ifAvailable: true },
                        async lock => {
                            if (!lock) {
                                resolve(null)
                                return
                            }
                            this.lockedScopeId = scopeId
                            this.claimEpoch += 1
                            resolve(this.claimEpoch)
                            await new Promise<void>(release => {
                                this.webLockRelease = release
                            })
                        }
                    ).catch(reject)
                })
            } catch {
                // Never mix lock backends: a Web Lock owner does not publish a
                // localStorage heartbeat, so fallback here could double-own.
                return null
            }
        }
        return this.acquireStorage(scopeId)
    }

    private async acquireStorage(scopeId: string): Promise<number | null> {
        try {
            const key = this.key(scopeId)
            const raw = localStorage.getItem(key)
            if (raw) {
                const holder = JSON.parse(raw) as { tabId: string; at: number }
                if (holder.tabId !== this.tabId && Date.now() - holder.at < LOCK_STALE_MS) {
                    return null
                }
            }
            localStorage.setItem(key, JSON.stringify({ tabId: this.tabId, at: Date.now() }))
            // Resolve same-tick read/write races by verifying the claim after
            // competing tabs have had a chance to publish theirs.
            await new Promise(resolve => setTimeout(resolve, 50))
            const verified = JSON.parse(localStorage.getItem(key) || '{}') as { tabId?: string }
            if (verified.tabId !== this.tabId) return null
            this.lockedScopeId = scopeId
            this.claimEpoch += 1
            this.startKeepAlive()
            return this.claimEpoch
        } catch {
            return null
        }
    }

    owns(scopeId: string): boolean {
        return this.lockedScopeId === scopeId
    }

    /** Release the claim and stop heartbeats. */
    release(claimEpoch?: number): void {
        if (claimEpoch !== undefined && claimEpoch !== this.claimEpoch) return
        this.webLockRelease?.()
        this.webLockRelease = null
        this.stopKeepAlive()
        try {
            if (this.lockedScopeId) {
                const key = this.key(this.lockedScopeId)
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
        this.lockedScopeId = null
    }

    private startKeepAlive(): void {
        if (this.keepAliveTimer) return
        this.keepAliveTimer = setInterval(() => {
            try {
                if (this.lockedScopeId) {
                    const key = this.key(this.lockedScopeId)
                    const holder = JSON.parse(localStorage.getItem(key) || '{}') as { tabId?: string }
                    if (holder.tabId !== this.tabId) {
                        this.stopKeepAlive()
                        this.lockedScopeId = null
                        return
                    }
                    localStorage.setItem(key, JSON.stringify({ tabId: this.tabId, at: Date.now() }))
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
