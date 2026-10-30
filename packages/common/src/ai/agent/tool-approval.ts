/**
 * Tool Approval Registry — the host-side channel between a tool that needs a
 * human decision and the UI that asks for it.
 *
 * Pure logic: no React, no plugin dependency, no transport. The executor hands
 * every tool `requestApproval` (see `tool-executor.ts`), that channel files a
 * pending entry here, the surface renders it, and `decide()` settles the
 * tool's promise. The host may create private registries (tests, multiple
 * windows); {@link toolApprovals} is the default one the SDK wiring uses.
 *
 * Guarantees the rest of the system relies on:
 *  - **Idempotent by callId.** A concurrent/replayed request returns the SAME
 *    promise, so one call can never produce two approval cards, and a late
 *    replay after the decision returns the recorded decision instead of asking
 *    again.
 *  - **Never hangs.** A pending request auto-denies after `timeoutMs`
 *    (default 5 minutes), and `cancelAll` / `cancelScope` deny everything a
 *    cancelled run still owes.
 *  - **Fail closed.** A missing/duplicated/throwing decision path only ever
 *    results in a denial; nothing here can approve on its own.
 *  - **Stable snapshots.** `snapshot()`/`get()` return referentially stable
 *    values between changes, so `useSyncExternalStore` (see
 *    `kernel/use-tool-approval.ts`) can subscribe without render loops.
 */

import type { ToolApprovalDecision, ToolApprovalRequest } from '../types'

/** Default auto-deny window for a pending approval. */
export const DEFAULT_TOOL_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000

/** Reason recorded when a run/UI is torn down with approvals still pending. */
export const TOOL_APPROVAL_CANCELLED_REASON = '操作已取消，审批自动拒绝'

/** Bound on remembered decisions (late replays of old callIds). */
const DECIDED_CACHE_LIMIT = 256

/** One approval the user has been asked to decide. */
export interface PendingToolApproval {
    callId: string
    request: ToolApprovalRequest
    /**
     * Owner scope (usually the conversation id). Lets a run cancel exactly its
     * own approvals instead of every approval in the window.
     */
    scope: string | null
    createdAt: number
    /** Absolute deadline; the entry auto-denies at this point. */
    expiresAt: number
}

/** Options for {@link ToolApprovalRegistry.request}. */
export interface ToolApprovalRequestOptions {
    /** Owner scope (conversation id) for scoped cancellation. */
    scope?: string | null
}

export type ToolApprovalListener = () => void

interface PendingEntry {
    public: PendingToolApproval
    promise: Promise<ToolApprovalDecision>
    resolve: (decision: ToolApprovalDecision) => void
    timer: ReturnType<typeof setTimeout> | null
}

function normalizeTimeout(timeoutMs: number | undefined): number {
    if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return DEFAULT_TOOL_APPROVAL_TIMEOUT_MS
    }
    return Math.max(1, Math.floor(timeoutMs))
}

export class ToolApprovalRegistry {
    private readonly pending = new Map<string, PendingEntry>()
    /** Decisions already made, kept for a bounded window (late replays). */
    private readonly decided = new Map<string, ToolApprovalDecision>()
    private readonly listeners = new Set<ToolApprovalListener>()
    private snapshotCache: PendingToolApproval[] | null = null

    /**
     * File an approval request for one call. The returned promise ALWAYS
     * settles (decision, timeout, or cancellation) and never rejects.
     *
     * Calling it twice with the same callId is safe: the second caller gets the
     * same promise (or the already-recorded decision), never a second prompt.
     */
    request(
        callId: string,
        request: ToolApprovalRequest,
        options: ToolApprovalRequestOptions = {},
    ): Promise<ToolApprovalDecision> {
        const existing = this.pending.get(callId)
        if (existing) return existing.promise
        const decided = this.decided.get(callId)
        if (decided) return Promise.resolve(decided)

        // `block` is a declaration that the operation is NOT approvable: the
        // tool must reject on its own (see ToolApprovalRequest#level). Denying
        // immediately is the defensive default and never shows a card.
        if (request.level === 'block') {
            const decision: ToolApprovalDecision = {
                allowed: false,
                reason: '该操作被标记为不可审批（block），已拒绝执行',
            }
            this.remember(callId, decision)
            return Promise.resolve(decision)
        }

        const timeoutMs = normalizeTimeout(request.timeoutMs)
        const now = Date.now()
        let resolve!: (decision: ToolApprovalDecision) => void
        const promise = new Promise<ToolApprovalDecision>(res => { resolve = res })
        const entry: PendingEntry = {
            public: {
                callId,
                request,
                scope: options.scope ?? null,
                createdAt: now,
                expiresAt: now + timeoutMs,
            },
            promise,
            resolve,
            timer: null,
        }
        entry.timer = setTimeout(() => {
            this.settle(callId, {
                allowed: false,
                reason: `审批超时（${Math.round(timeoutMs / 1000)} 秒），已自动拒绝`,
            })
        }, timeoutMs)
        this.pending.set(callId, entry)
        this.invalidate()
        this.notify()
        return promise
    }

    /**
     * Resolve a pending approval. Returns false when the call has no pending
     * entry (already decided, timed out, cancelled, or never asked) — a late or
     * duplicated click is a no-op, never an error.
     */
    decide(callId: string, decision: ToolApprovalDecision): boolean {
        const entry = this.pending.get(callId)
        if (!entry) return false
        // Normalise the decision so a malformed object can only ever deny.
        const normalised: ToolApprovalDecision = decision?.allowed === true
            ? { allowed: true, ...(decision.note ? { note: decision.note } : {}) }
            : { allowed: false, ...(decision?.reason ? { reason: decision.reason } : {}) }
        this.settle(callId, normalised)
        return true
    }

    /** The pending approval for a call, or undefined. Stable while pending. */
    get(callId: string): PendingToolApproval | undefined {
        return this.pending.get(callId)?.public
    }

    /** Every pending approval, oldest first. Stable between changes. */
    snapshot(): PendingToolApproval[] {
        if (!this.snapshotCache) {
            this.snapshotCache = [...this.pending.values()]
                .map(entry => entry.public)
                .sort((a, b) => a.createdAt - b.createdAt)
        }
        return this.snapshotCache
    }

    /** Number of approvals still waiting for a human. */
    get size(): number {
        return this.pending.size
    }

    /** Subscribe to pending/resolved changes. Returns the unsubscribe. */
    subscribe(listener: ToolApprovalListener): () => void {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    /**
     * Deny every pending approval owned by `scope` (a run cancel / tab close).
     * Returns how many were denied.
     */
    cancelScope(scope: string | null, reason?: string): number {
        let cancelled = 0
        for (const callId of [...this.pending.keys()]) {
            const entry = this.pending.get(callId)
            if (!entry || entry.public.scope !== scope) continue
            this.settle(callId, { allowed: false, reason: reason ?? TOOL_APPROVAL_CANCELLED_REASON })
            cancelled += 1
        }
        return cancelled
    }

    /** Deny every pending approval (tests / whole-window teardown). */
    cancelAll(reason?: string): number {
        const callIds = [...this.pending.keys()]
        for (const callId of callIds) {
            this.settle(callId, { allowed: false, reason: reason ?? TOOL_APPROVAL_CANCELLED_REASON })
        }
        return callIds.length
    }

    /** Deny everything, drop listeners and remembered decisions (unmount). */
    dispose(): void {
        this.cancelAll()
        this.listeners.clear()
        this.decided.clear()
        this.invalidate()
    }

    private settle(callId: string, decision: ToolApprovalDecision): void {
        const entry = this.pending.get(callId)
        if (!entry) return
        this.pending.delete(callId)
        if (entry.timer) {
            clearTimeout(entry.timer)
            entry.timer = null
        }
        this.remember(callId, decision)
        this.invalidate()
        // Resolve BEFORE notifying: the awaiting tool can resume while the UI
        // re-renders the resolved state in the same tick.
        entry.resolve(decision)
        this.notify()
    }

    private remember(callId: string, decision: ToolApprovalDecision): void {
        this.decided.set(callId, decision)
        while (this.decided.size > DECIDED_CACHE_LIMIT) {
            const oldest = this.decided.keys().next().value
            if (oldest === undefined) break
            this.decided.delete(oldest)
        }
    }

    private invalidate(): void {
        this.snapshotCache = null
    }

    private notify(): void {
        for (const listener of [...this.listeners]) {
            try {
                listener()
            } catch (error) {
                // A broken subscriber must not break the approval channel.
                console.warn('[agent] tool approval subscriber failed:', error)
            }
        }
    }
}

/** Create an isolated registry (tests, multi-window hosts). */
export function createToolApprovalRegistry(): ToolApprovalRegistry {
    return new ToolApprovalRegistry()
}

/**
 * The default process-wide registry used by the SDK wiring. One host window has
 * one approval surface, and callIds are unique per run, so a single board is
 * both sufficient and what lets a card anywhere in the conversation decide a
 * call filed by the executor.
 */
export const toolApprovals = new ToolApprovalRegistry()
