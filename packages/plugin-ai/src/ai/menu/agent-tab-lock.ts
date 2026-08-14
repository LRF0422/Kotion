/**
 * Multi-tab coordination for agent task streams.
 *
 * Two tabs refreshing at the same time would both re-attach to the same task
 * and fight over the shared chat-session localStorage. A tab that wants to
 * stream a task first acquires a claim (with a heartbeat); other tabs seeing a
 * fresh claim for the same task stand down.
 */

const CHANNEL_NAME = 'kn-agent-task-lock'
const CLAIM_KEY = 'kn-agent-task-lock-claim'
/** A claim goes stale this long after the owner's last heartbeat. */
const CLAIM_TTL_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 10_000

let channel: BroadcastChannel | null = null
let claimedTaskId: string | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

function getChannel(): BroadcastChannel | null {
    if (channel) return channel
    try {
        channel = new BroadcastChannel(CHANNEL_NAME)
        channel.onmessage = (e) => {
            const msg = e.data
            // Record a foreign claim so our own claim check fails for the same task.
            if (msg?.type === 'claim' && typeof msg.claim?.taskId === 'string') {
                try {
                    localStorage.setItem(CLAIM_KEY, JSON.stringify(msg.claim))
                } catch { /* ignore */ }
            }
        }
    } catch {
        return null
    }
    return channel
}

function readClaim(): { taskId: string; ts: number } | null {
    try {
        const raw = localStorage.getItem(CLAIM_KEY)
        if (!raw) return null
        const claim = JSON.parse(raw)
        return claim && typeof claim.taskId === 'string' && typeof claim.ts === 'number'
            ? claim
            : null
    } catch {
        return null
    }
}

/**
 * Try to become the tab that streams `taskId`. Returns false when another tab
 * holds a fresh claim for the same task. The claim is kept fresh by a
 * heartbeat while the stream runs; {@link releaseTaskStream} clears it.
 */
export function claimTaskStream(taskId: string): boolean {
    const now = Date.now()
    const last = readClaim()
    if (last && last.taskId === taskId && now - last.ts < CLAIM_TTL_MS) {
        return false
    }
    try {
        localStorage.setItem(CLAIM_KEY, JSON.stringify({ taskId, ts: now }))
    } catch { /* ignore */ }
    getChannel()?.postMessage({ type: 'claim', claim: { taskId, ts: now } })

    claimedTaskId = taskId
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = setInterval(() => {
        try {
            localStorage.setItem(CLAIM_KEY, JSON.stringify({ taskId, ts: Date.now() }))
        } catch { /* ignore */ }
    }, HEARTBEAT_INTERVAL_MS)
    return true
}

/** Release this tab's claim (only when it actually owns `taskId`, if given). */
export function releaseTaskStream(taskId?: string): void {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
    }
    if (taskId && claimedTaskId !== taskId) return
    claimedTaskId = null
    try {
        localStorage.removeItem(CLAIM_KEY)
    } catch { /* ignore */ }
    getChannel()?.postMessage({ type: 'release', taskId })
}
