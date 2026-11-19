import { strict as assert } from 'node:assert'
import {
    groupSessionsByDate,
    partitionSessionsByGroup,
    sortSessionGroups,
    type SessionGroupMeta,
    type SessionListMeta,
} from './session-list'

/**
 * The sidebar renders user-created folders above the recency buckets. The
 * partition rules are pinned here: folders keep their saved order and are shown
 * even when empty, a conversation belongs to at most one folder, a stale
 * `groupId` degrades to "ungrouped" instead of hiding the row, and everything
 * ungrouped keeps the exact today/yesterday/previous7/earlier behaviour.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 10, 4, 12, 0, 0).getTime()
const at = (days: number) => NOW - days * DAY

const session = (
    id: string,
    updatedAt: number,
    groupId?: string,
): SessionListMeta => ({ id, updatedAt, groupId })

const group = (id: string, sortIndex: number, createdAt = 0): SessionGroupMeta => ({
    id,
    name: id.toUpperCase(),
    sortIndex,
    createdAt,
})

// 1. Group order: explicit position, creation order as the tie-break.
assert.deepEqual(
    sortSessionGroups([
        group('c', 2),
        group('b', 1, 200),
        group('a', 1, 100),
    ]).map(item => item.id),
    ['a', 'b', 'c'],
)

// 2. Sessions land in their folder, newest first inside it, and never appear in
//    the recency buckets as well.
const partitioned = partitionSessionsByGroup(
    [
        session('work-old', at(3), 'work'),
        session('work-new', at(1), 'work'),
        session('loose', at(0)),
        session('priv', at(40), 'private'),
    ],
    [group('work', 0), group('private', 1)],
    NOW,
)
assert.deepEqual(partitioned.groups.map(section => section.group.id), ['work', 'private'])
assert.deepEqual(
    partitioned.groups.map(section => section.sessions.map(item => item.id)),
    [['work-new', 'work-old'], ['priv']],
)
assert.deepEqual(
    partitioned.ungrouped.map(bucket => bucket.bucket),
    ['today'],
)
assert.deepEqual(
    partitioned.ungrouped.flatMap(bucket => bucket.sessions.map(item => item.id)),
    ['loose'],
)

// 3. An empty folder is rendered so it can be seen (and filled) right away.
const emptyFolder = partitionSessionsByGroup([session('loose', NOW)], [group('empty', 0)], NOW)
assert.equal(emptyFolder.groups.length, 1)
assert.deepEqual(emptyFolder.groups[0].sessions, [])
assert.equal(emptyFolder.ungrouped[0].sessions.length, 1)

// 4. A stale / unknown group id must not swallow the conversation.
const stale = partitionSessionsByGroup(
    [session('orphan', at(0), 'deleted-group')],
    [group('kept', 0)],
    NOW,
)
assert.deepEqual(stale.groups[0].sessions, [])
assert.deepEqual(
    stale.ungrouped.flatMap(bucket => bucket.sessions.map(item => item.id)),
    ['orphan'],
)

// 5. Without groups the result is exactly the old date grouping.
const mixed = [
    session('today', NOW),
    session('yesterday', at(1)),
    session('lastweek', at(4)),
    session('older', at(30)),
]
assert.deepEqual(
    partitionSessionsByGroup(mixed, [], NOW).ungrouped,
    groupSessionsByDate(mixed, NOW),
)
assert.deepEqual(partitionSessionsByGroup([], [], NOW), { groups: [], ungrouped: [] })

// 6. A broken timestamp inside a folder still sorts deterministically and is
//    never dropped.
const broken = partitionSessionsByGroup(
    [session('bad', Number.NaN, 'work'), session('good', at(1), 'work')],
    [group('work', 0)],
    NOW,
)
assert.deepEqual(broken.groups[0].sessions.map(item => item.id), ['good', 'bad'])

console.log('session-groups.check: ok')