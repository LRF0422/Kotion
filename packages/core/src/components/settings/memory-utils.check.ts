import { strict as assert } from 'node:assert'
import {
    groupMemoriesByScope,
    memoryKind,
    mergeMemoryPages,
    parseMemoryScope,
    sortMemories,
    type MemoryLike,
} from './memory-utils'

const row = (memoryId: string, overrides: Partial<MemoryLike> = {}): MemoryLike => ({
    memoryId,
    scope: 'u:7',
    type: 'note',
    importance: 50,
    createTime: 1_000,
    ...overrides,
})

// ── scope parsing ────────────────────────────────────────────────────────────
// The three keys the backend writes (MemoryScope.java), plus the malformed ones
// that must never be mistaken for a user scope.
assert.deepEqual(parseMemoryScope('u:7'), { kind: 'user', userId: '7' })
assert.deepEqual(parseMemoryScope('u:7:s:space-a'), {
    kind: 'space',
    userId: '7',
    spaceId: 'space-a',
})
assert.deepEqual(parseMemoryScope('u:7:s:space-a:p:page-9'), {
    kind: 'page',
    userId: '7',
    spaceId: 'space-a',
    pageId: 'page-9',
})
// Ids may contain the separator characters; only the tag separators split.
assert.deepEqual(parseMemoryScope('u:7:s:space:p:page-with:p:colon'), {
    kind: 'page',
    userId: '7',
    spaceId: 'space',
    pageId: 'page-with:p:colon',
})
assert.equal(parseMemoryScope('garbage').kind, 'unknown')
assert.equal(parseMemoryScope('u:').kind, 'unknown')
assert.equal(parseMemoryScope('').kind, 'unknown')
assert.equal(parseMemoryScope(undefined).kind, 'unknown')
// A bare `u:` prefix must not be read as user "7:s:9".
assert.equal(parseMemoryScope('u:7:s:').kind, 'user')

// ── grouping ─────────────────────────────────────────────────────────────────
const grouped = groupMemoriesByScope([
    row('page-1', { scope: 'u:7:s:9:p:5' }),
    row('user-1'),
    row('space-1', { scope: 'u:7:s:9' }),
    row('user-2'),
    row('odd-1', { scope: 'not-a-scope' }),
])
assert.deepEqual(
    grouped.map(group => group.kind),
    ['user', 'space', 'page', 'unknown'],
    'groups must render broadest-first and skip empty buckets'
)
assert.deepEqual(grouped[0].items.map(item => item.memoryId), ['user-1', 'user-2'])
assert.deepEqual(grouped[2].items.map(item => item.memoryId), ['page-1'])
assert.deepEqual(groupMemoriesByScope([]), [])

// ── sorting ──────────────────────────────────────────────────────────────────
const unsorted = [
    row('old-low', { importance: 10, createTime: 100 }),
    row('new-high', { importance: 90, createTime: 300 }),
    row('mid', { importance: 90, createTime: 200 }),
]
assert.deepEqual(
    sortMemories(unsorted, 'recent').map(item => item.memoryId),
    ['new-high', 'mid', 'old-low'],
    'recent is newest-first'
)
assert.deepEqual(
    sortMemories(unsorted, 'importance').map(item => item.memoryId),
    ['new-high', 'mid', 'old-low'],
    'importance sorts desc, ties by newest'
)
// Sorting must not mutate the caller's array (React state in particular).
assert.deepEqual(unsorted.map(item => item.memoryId), ['old-low', 'new-high', 'mid'])

// ── append-page merging ──────────────────────────────────────────────────────
assert.deepEqual(
    mergeMemoryPages([row('a'), row('b')], [row('b'), row('c')]).map(item => item.memoryId),
    ['a', 'b', 'c'],
    'a row re-sent by the next page must not render twice'
)
const stale = row('a', { importance: 10 })
const fresh = row('a', { importance: 99 })
const merged = mergeMemoryPages([stale], [fresh])
assert.equal(merged.length, 1)
assert.equal(merged[0].importance, 99, 'the newer copy of a re-sent row wins')
assert.deepEqual(mergeMemoryPages([row('a')], []).map(item => item.memoryId), ['a'])

// ── wire type coercion ───────────────────────────────────────────────────────
assert.equal(memoryKind('preference'), 'preference')
assert.equal(memoryKind(' EPISODE '), 'episode')
assert.equal(memoryKind('nonsense'), 'note')
assert.equal(memoryKind(undefined), 'note')

console.log('memory-utils.check: ok')
