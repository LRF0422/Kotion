/**
 * Pure helpers for the conversation list (the `/ai` page's left session column).
 *
 * The list groups conversations by recency the way every chat app does —
 * today / yesterday / the previous week / everything older — so the user finds
 * "the chat I had this morning" without reading timestamps. Keeping the bucket
 * arithmetic here (instead of in the component) means it can be pinned by a
 * plain node check: `session-list.check.ts`.
 *
 * Deliberately dependency-free (structural input types, no imports): the UI
 * supplies the localised labels by bucket key, and the check runs without the
 * app's module graph.
 */

/** The slice of a conversation this module needs; `ChatSessionMeta` matches it. */
export interface SessionListMeta {
    id: string
    updatedAt: number
    boundPage?: { title?: string }
    targetPage?: { title?: string }
}

export type SessionDateBucket = 'today' | 'yesterday' | 'previous7' | 'earlier'

export interface SessionDateGroup<T extends SessionListMeta = SessionListMeta> {
    bucket: SessionDateBucket
    sessions: T[]
}

/** Fixed display order; a bucket with no conversations is never rendered. */
export const SESSION_DATE_BUCKET_ORDER: SessionDateBucket[] = [
    'today',
    'yesterday',
    'previous7',
    'earlier',
]

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Coerce a stored timestamp to epoch milliseconds.
 *
 * The index is a merge of the backend list and a local cache, and the local
 * cache still carries rows migrated from the pre-engine era whose timestamps
 * were persisted as STRINGS. A string would make the bucket return "earlier"
 * for a conversation from this morning, so numbers are normalised here rather
 * than trusting the declared type.
 */
export function toEpochMs(value: unknown): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : Number.NaN
    }
    return Number.NaN
}

/** Local midnight of `timestamp` — the boundary every bucket is measured from. */
function startOfLocalDay(timestamp: number): number {
    const date = new Date(timestamp)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
}

/**
 * Bucket a conversation timestamp against local midnight.
 *
 * `previous7` covers the seven local days before yesterday (days −8 … −2), so
 * the bucket label is honest. Anything older — or a broken/missing timestamp —
 * falls into `earlier` rather than being dropped, so a conversation can never
 * vanish from the list because of a bad clock.
 */
export function sessionDateBucket(updatedAt: unknown, now: number = Date.now()): SessionDateBucket {
    const ts = toEpochMs(updatedAt)
    const todayStart = startOfLocalDay(now)
    if (!Number.isFinite(ts) || ts < todayStart - 8 * DAY_MS) return 'earlier'
    if (ts >= todayStart) return 'today'
    if (ts >= todayStart - DAY_MS) return 'yesterday'
    return 'previous7'
}

/**
 * Group conversations by recency, newest first inside each bucket.
 *
 * Input order is not trusted: the caller merges a backend list with a local
 * cache, and a metadata write (title, bound page) does not re-sort that merge.
 * Timestamps are compared once here so the rendered order always agrees with
 * the bucket a row lands in.
 */
export function groupSessionsByDate<T extends SessionListMeta>(
    sessions: T[],
    now: number = Date.now(),
): SessionDateGroup<T>[] {
    const buckets = new Map<SessionDateBucket, T[]>()
    const sorted = [...sessions].sort((a, b) => toEpochMs(b.updatedAt) - toEpochMs(a.updatedAt))
    for (const session of sorted) {
        const bucket = sessionDateBucket(session.updatedAt, now)
        const list = buckets.get(bucket)
        if (list) list.push(session)
        else buckets.set(bucket, [session])
    }
    return SESSION_DATE_BUCKET_ORDER
        .filter(bucket => (buckets.get(bucket)?.length ?? 0) > 0)
        .map(bucket => ({ bucket, sessions: buckets.get(bucket) as T[] }))
}

/**
 * Page a conversation belongs to: the page it was bound to on first use wins,
 * else the off-screen target it was pointed at. Mirrors the tab strip / history
 * dropdown so a conversation is named the same way everywhere.
 */
export function sessionPageTitle(session?: SessionListMeta | null): string | undefined {
    return session?.boundPage?.title || session?.targetPage?.title
}
