/**
 * Agent persistence contract + registry.
 *
 * The SDK needs crash-recovery persistence (run handle + per-call tool-result
 * journal) and a cross-tab lock, but it must not hard-code browser policy
 * (localStorage keys, Web Locks, TTL) in @kn/common. This module defines the
 * contract and a registry; the host registers the concrete implementation at
 * startup. A dependency-free in-memory implementation is the fallback so SSR
 * and tests never crash.
 */

export interface SavedRun {
    conversationId: string
    runId: string
    lastSeq: number
    /** Status snapshot at save time (attach decision). */
    status?: string
    updatedAt: number
}

export interface SavedToolResult {
    status?: 'started' | 'completed'
    ok: boolean
    result?: unknown
    error?: string
    /** True when the body was too large to persist and was dropped. */
    resultOmitted?: boolean
}

/** Crash-recovery persistence used by the run hook and the sub-run worker. */
export interface AgentRunStore {
    save(entry: SavedRun): void
    load(conversationId: string): SavedRun | null
    updateLastSeq(conversationId: string, lastSeq: number, status?: string): void
    clear(conversationId: string): void
    saveToolStarted(runId: string, callId: string): boolean
    saveToolResult(runId: string, callId: string, result: SavedToolResult): boolean
    loadToolResult(runId: string, callId: string): SavedToolResult | null
    clearToolResult(runId: string, callId: string): void
    clearToolResults(runId: string): void
}

/** Exactly-one-tab-drives-a-conversation lock. */
export interface AgentTabLock {
    acquire(scopeId: string): Promise<number | null>
    owns(scopeId: string): boolean
    release(claimEpoch?: number): void
}

export interface AgentPersistence {
    store: AgentRunStore
    lock: AgentTabLock
}

let factory: (() => AgentPersistence) | null = null

/** Register the host persistence factory. Called once at application startup. */
export function configureAgentPersistence(next: () => AgentPersistence): void {
    factory = next
}

/** Create the configured persistence, or a safe in-memory fallback. */
export function createAgentPersistence(): AgentPersistence {
    return factory ? factory() : createInMemoryPersistence()
}

/** Dependency-free fallback: correct for a single session, survives no reload. */
export function createInMemoryPersistence(): AgentPersistence {
    return { store: new InMemoryRunStore(), lock: new NoopTabLock() }
}

class InMemoryRunStore implements AgentRunStore {
    private readonly runs = new Map<string, SavedRun>()
    private readonly toolResults = new Map<string, Map<string, SavedToolResult>>()

    save(entry: SavedRun): void {
        this.runs.set(entry.conversationId, { ...entry, updatedAt: Date.now() })
    }

    load(conversationId: string): SavedRun | null {
        return this.runs.get(conversationId) ?? null
    }

    updateLastSeq(conversationId: string, lastSeq: number, status?: string): void {
        const entry = this.runs.get(conversationId)
        if (!entry) return
        this.runs.set(conversationId, { ...entry, lastSeq, status, updatedAt: Date.now() })
    }

    clear(conversationId: string): void {
        this.runs.delete(conversationId)
    }

    saveToolStarted(runId: string, callId: string): boolean {
        return this.saveToolResult(runId, callId, { status: 'started', ok: false, error: 'started' })
    }

    saveToolResult(runId: string, callId: string, result: SavedToolResult): boolean {
        const map = this.toolResults.get(runId) ?? new Map<string, SavedToolResult>()
        map.set(callId, { ...result, status: result.status ?? 'completed' })
        this.toolResults.set(runId, map)
        return true
    }

    loadToolResult(runId: string, callId: string): SavedToolResult | null {
        return this.toolResults.get(runId)?.get(callId) ?? null
    }

    clearToolResult(runId: string, callId: string): void {
        this.toolResults.get(runId)?.delete(callId)
    }

    clearToolResults(runId: string): void {
        this.toolResults.delete(runId)
    }
}

class NoopTabLock implements AgentTabLock {
    async acquire(): Promise<number | null> {
        return 1
    }

    owns(): boolean {
        return true
    }

    release(): void {
        /* no-op */
    }
}
