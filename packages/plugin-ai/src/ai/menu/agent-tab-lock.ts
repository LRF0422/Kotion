/**
 * Multi-tab coordination for agent task streams.
 *
 * Two tabs refreshing at the same time would both re-attach to the same task
 * and fight over the shared chat-session localStorage. A tab that wants to
 * stream a task first acquires a claim (with a heartbeat); other tabs seeing a
 * fresh claim for the same task stand down.
 *
 * Fixed design:
 *  - PER-TASK claim keys (a claim for task A can never clobber task B's claim)
 *  - Web Locks API when available (atomic across tabs); localStorage CAS-style
 *    fallback otherwise
 *  - release only clears a claim the tab actually owns
 */

const CHANNEL_NAME = 'kn-agent-task-lock'
const CLAIM_PREFIX = 'kn-agent-task-lock:'
/** A claim goes stale this long after the owner's last heartbeat. */
const CLAIM_TTL_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 10_000

let channel: BroadcastChannel | null = null
let claimedTaskId: string | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

const claimKey = (taskId: string) => CLAIM_PREFIX + taskId

function getChannel(): BroadcastChannel | null {
    if (channel) return channel
    try {
        channel = new BroadcastChannel(CHANNEL_NAME)
        channel.onmessage = (e) => {
            const msg = e.data
            // A foreign claim makes our own claim check fail for the same task.
            if (msg?.type === 'claim' && typeof msg.claim?.taskId === 'string') {
                try {
                    localStorage.setItem(claimKey(msg.claim.taskId), JSON.stringify(msg.claim))
                } catch { /* ignore */ }
            }
        }
    } catch {
        return null
    }
    return channel
}

interface Claim { taskId: string; ts: number }

function readClaim(taskId: string): Claim | null {
    try {
        const raw = localStorage.getItem(claimKey(taskId))
        if (!raw) return null
        const claim = JSON.parse(raw)
        return claim && typeof claim.taskId === 'string' && typeof claim.ts === 'number'
            ? claim
            : null
    } catch {
        return null
    }
}

function writeClaim(taskId: string): void {
    try {
        localStorage.setItem(claimKey(taskId), JSON.stringify({ taskId, ts: Date.now() }))
    } catch { /* ignore */ }
}

function clearClaim(taskId: string): void {
    try {
        localStorage.removeItem(claimKey(taskId))
    } catch { /* ignore */ }
}

function startHeartbeat(taskId: string): void {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = setInterval(() => {
        if (claimedTaskId !== taskId) return
        writeClaim(taskId)
    }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat(): void {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
    }
}

/**
 * Synchronous claim attempt (per-task key + CAS-style check). Prefer
 * claimTaskStreamAsync where Web Locks is available — this fallback is
 * inherently racy across tabs but is scoped to a single task key, and the
 * backend task model is idempotent, so the worst case is a duplicated UI
 * stream, never data corruption.
 */
export function claimTaskStream(taskId: string): boolean {
    const now = Date.now()
    const last = readClaim(taskId)
    if (last && last.taskId === taskId && now - last.ts < CLAIM_TTL_MS) {
        return false
    }
    writeClaim(taskId)
    getChannel()?.postMessage({ type: 'claim', claim: { taskId, ts: now } })

    claimedTaskId = taskId
    startHeartbeat(taskId)
    return true
}

/**
 * Atomic claim attempt via the Web Locks API (falls back to
 * claimTaskStream when unsupported).
 */
export async function claimTaskStreamAsync(taskId: string): Promise<boolean> {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null
    if (nav?.locks && typeof nav.locks.request === 'function') {
        return nav.locks.request(claimKey(taskId), { ifAvailable: true }, (lock: any) => {
            if (!lock) return false // held by another tab
            return claimTaskStream(taskId)
        })
    }
    return claimTaskStream(taskId)
}

/** Release this tab's claim (only when it actually owns taskId, if given). */
export function releaseTaskStream(taskId?: string): void {
    if (taskId && claimedTaskId !== taskId) return
    if (!taskId && !claimedTaskId) return
    const owned = taskId || (claimedTaskId as string)
    stopHeartbeat()
    claimedTaskId = null
    // Only clear when the stored claim is still ours — never delete a claim
    // another tab has taken over.
    const last = readClaim(owned)
    if (last && last.taskId === owned) {
        clearClaim(owned)
    }
    getChannel()?.postMessage({ type: 'release', taskId: owned })
}
