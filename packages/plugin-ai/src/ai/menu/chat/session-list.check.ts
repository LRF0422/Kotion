import { strict as assert } from 'node:assert'
import {
    SESSION_DATE_BUCKET_ORDER,
    groupSessionsByDate,
    sessionDateBucket,
    sessionPageTitle,
    type SessionListMeta,
} from './session-list'

/**
 * The conversation list is sorted/grouped client-side from merged metadata, so
 * the rules are pinned here: local-midnight boundaries, newest-first inside a
 * bucket, fixed bucket order, empty buckets hidden, and a broken timestamp
 * landing in "earlier" instead of dropping the row.
 */

const DAY = 24 * 60 * 60 * 1000
/** Local noon, so "today"/"yesterday" cannot drift with the runner's TZ. */
const NOW = new Date(2026, 10, 4, 12, 0, 0).getTime()
const startOfDay = (ts: number) => {
    const date = new Date(ts)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
}

const session = (id: string, updatedAt: number, patch: Partial<SessionListMeta> = {}): SessionListMeta => ({
    id,
    updatedAt,
    ...patch,
})

// 1. Bucket boundaries are local midnights, not 24h windows from "now".
assert.equal(sessionDateBucket(NOW, NOW), 'today')
assert.equal(sessionDateBucket(startOfDay(NOW) + 1, NOW), 'today')
assert.equal(sessionDateBucket(startOfDay(NOW) - 1, NOW), 'yesterday')
assert.equal(sessionDateBucket(startOfDay(NOW) - DAY, NOW), 'yesterday')
assert.equal(sessionDateBucket(startOfDay(NOW) - DAY - 1, NOW), 'previous7')
// "Previous 7 days" = the seven whole local days before yesterday (days −8 … −2).
assert.equal(sessionDateBucket(startOfDay(NOW) - 8 * DAY, NOW), 'previous7')
assert.equal(sessionDateBucket(startOfDay(NOW) - 8 * DAY - 1, NOW), 'earlier')
assert.equal(sessionDateBucket(startOfDay(NOW) - 400 * DAY, NOW), 'earlier')

// 2. Ordering: buckets in fixed order, newest first inside each bucket.
const ordered = groupSessionsByDate([
    session('older', NOW - 40 * DAY),
    session('today-early', startOfDay(NOW) + 1),
    session('yesterday', startOfDay(NOW) - 1),
    session('today-late', NOW),
    session('last-week', startOfDay(NOW) - 3 * DAY),
], NOW)
assert.deepEqual(
    ordered.map(group => group.bucket),
    ['today', 'yesterday', 'previous7', 'earlier'],
)
assert.deepEqual(
    ordered.map(group => group.sessions.map(item => item.id)),
    [['today-late', 'today-early'], ['yesterday'], ['last-week'], ['older']],
)

// 3. Empty buckets are not emitted, and an empty list renders nothing.
assert.deepEqual(groupSessionsByDate([]), [])
assert.deepEqual(
    groupSessionsByDate([session('only', NOW)], NOW).map(group => group.bucket),
    ['today'],
)
assert.deepEqual(SESSION_DATE_BUCKET_ORDER, ['today', 'yesterday', 'previous7', 'earlier'])

// 4. Input order is not trusted: a stale merge order still renders newest-first.
const unsorted = groupSessionsByDate([
    session('a', NOW - 2 * DAY),
    session('b', NOW),
    session('c', NOW - DAY),
], NOW)
assert.deepEqual(unsorted.flatMap(group => group.sessions.map(item => item.id)), ['b', 'c', 'a'])

// 5. A broken / missing timestamp must not drop the conversation — and a
//    STRING timestamp (legacy local-index rows) must still bucket correctly.
assert.equal(sessionDateBucket(Number.NaN, NOW), 'earlier')
assert.equal(sessionDateBucket(0, NOW), 'earlier')
assert.equal(sessionDateBucket(String(NOW - DAY), NOW), 'yesterday')
assert.equal(sessionDateBucket(String(NOW), NOW), 'today')
assert.equal(sessionDateBucket('not-a-date', NOW), 'earlier')
assert.equal(groupSessionsByDate([session('broken', Number.NaN)], NOW)[0].sessions[0].id, 'broken')
const legacyStringRow = { id: 'legacy-string', updatedAt: String(NOW - DAY) } as unknown as SessionListMeta
assert.deepEqual(
    groupSessionsByDate([legacyStringRow, session('fresh', NOW)], NOW).map(group => group.bucket),
    ['today', 'yesterday'],
)

// 6. Page label: auto-bound page wins over the picked target, like the tabs.
assert.equal(
    sessionPageTitle(session('s', NOW, {
        boundPage: { title: '入职手册' },
        targetPage: { title: '产品复盘' },
    })),
    '入职手册',
)
assert.equal(sessionPageTitle(session('s', NOW, { targetPage: { title: '产品复盘' } })), '产品复盘')
assert.equal(sessionPageTitle(session('s', NOW)), undefined)
assert.equal(sessionPageTitle(undefined), undefined)

console.log('session-list.check: ok')
