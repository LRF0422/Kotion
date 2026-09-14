/**
 * Per-document write lease for agent tool execution.
 *
 * Two agents can be bound to the *same* page (the parent and a child, or two
 * children): they share one Y.Doc, so mutating tools from different owners would
 * otherwise interleave and lose updates (read → someone else writes → write
 * based on the stale read). The backend serializes the *dispatch* of frontend
 * calls, but read tools and mutating tools of different children can still be in
 * flight around each other, and reconnect/replay can overlap batches.
 *
 * This module gives every mutating frontend tool call an exclusive, FIFO lease
 * keyed by the editor target, so reads and writes of one document are ordered:
 *
 *   - the queue is per `pageId` (per document), not per owner;
 *   - it is fair (FIFO by request order) and reentrancy is not needed because
 *     tool executors never route an inner call through this lock;
 *   - a waiter gives up after {@link DEFAULT_ACQUIRE_TIMEOUT_MS} instead of
 *     hanging forever behind a wedged holder.
 *
 * Scope note: the lock lives in one JS context. Two browser tabs editing the
 * same page have separate queues; cross-tab serialization would need the Web
 * Locks API and is deliberately out of scope here.
 */

/** Give up (and fail the call) rather than waiting behind a wedged holder. */
export const DEFAULT_ACQUIRE_TIMEOUT_MS = 120_000

interface Waiter {
    resolve: (release: () => void) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout> | null
}

class DocumentLock {
    private locked = false
    private waiters: Waiter[] = []

    acquire(timeoutMs: number, label: string): Promise<() => void> {
        return new Promise<() => void>((resolve, reject) => {
            const waiter: Waiter = {
                resolve,
                reject,
                timer: null,
            }
            if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
                waiter.timer = setTimeout(() => {
                    const index = this.waiters.indexOf(waiter)
                    if (index >= 0) this.waiters.splice(index, 1)
                    reject(new Error(
                        `等待文档写锁超时（${label}，${Math.round(timeoutMs / 1000)}s）：另一处编辑长时间未释放`
                    ))
                }, timeoutMs)
            }
            this.waiters.push(waiter)
            this.pump()
        })
    }

    /** True while a holder or at least one waiter is queued. */
    get busy(): boolean {
        return this.locked || this.waiters.length > 0
    }

    private pump(): void {
        if (this.locked) return
        const next = this.waiters.shift()
        if (!next) return
        this.locked = true
        if (next.timer) {
            clearTimeout(next.timer)
            next.timer = null
        }
        next.resolve(this.makeRelease())
    }

    private makeRelease(): () => void {
        let released = false
        return () => {
            if (released) return
            released = true
            this.locked = false
            this.pump()
        }
    }
}

const locks = new Map<string, DocumentLock>()

const lockFor = (pageId: string): DocumentLock => {
    let lock = locks.get(pageId)
    if (!lock) {
        lock = new DocumentLock()
        locks.set(pageId, lock)
    }
    return lock
}

/**
 * Run `task` while holding the document's exclusive write lease. The lease is
 * released as soon as `task` settles (success or failure).
 */
export async function withDocumentWrite<T>(
    pageId: string,
    task: () => Promise<T>,
    options?: { timeoutMs?: number; label?: string }
): Promise<T> {
    const lock = lockFor(String(pageId))
    const release = await lock.acquire(
        options?.timeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS,
        options?.label ?? String(pageId)
    )
    try {
        return await task()
    } finally {
        release()
    }
}

/** Documents with a held lease or queued waiters (diagnostics/tests). */
export function busyDocumentIds(): string[] {
    return [...locks.entries()].filter(([, lock]) => lock.busy).map(([pageId]) => pageId)
}

/** Drop every queue (tests / teardown). Never call while calls are in flight. */
export function resetDocumentWriteLocks(): void {
    locks.clear()
}
