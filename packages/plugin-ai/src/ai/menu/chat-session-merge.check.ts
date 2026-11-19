import { strict as assert } from 'node:assert'
import {
    mergeGroupMeta,
    mergeSessionMeta,
    type MergeGroupMeta,
    type MergeSessionMeta,
} from './chat-session-merge'

/**
 * The merge decides whether the user's own action survives a reload. Pinned:
 *  - the newer metadata write wins (either side);
 *  - a GROUP MOVE never advances `updatedAt`, so on equal timestamps the local
 *    group assignment wins — otherwise reloading would undo the move;
 *  - a session/group that only exists locally (offline work) survives;
 *  - groups come back in display order.
 */

const session = (
    id: string,
    updatedAt: number,
    groupId?: string,
): MergeSessionMeta => ({ id, updatedAt, groupId })

const group = (
    id: string,
    sortIndex: number,
    createdAt: number,
    updatedAt = 0,
): MergeGroupMeta => ({ id, sortIndex, createdAt, updatedAt })

// 1. The newer write wins on both sides.
assert.deepEqual(
    mergeSessionMeta([session('lead', 10, 'g1')], [session('lead', 20, 'g2')]).find(item => item.id === 'lead'),
    session('lead', 20, 'g2'),
)
assert.deepEqual(
    mergeSessionMeta([session('remote', 30, 'g1')], [session('remote', 20)]).find(item => item.id === 'remote'),
    session('remote', 30, 'g1'),
)

// 2. Equal timestamps + differing group: the LOCAL assignment is the newer
//    user action (a move does not bump updatedAt).
const moved = mergeSessionMeta([session('moved', 50)], [session('moved', 50, 'work')])
assert.equal(moved.find(item => item.id === 'moved')?.groupId, 'work')

const ungroupedLocally = mergeSessionMeta([session('moved', 50, 'work')], [session('moved', 50)])
assert.equal(ungroupedLocally.find(item => item.id === 'moved')?.groupId, undefined)

// 3. Local-only rows survive (offline-created session / group).
const union = mergeSessionMeta([session('remote', 1)], [session('local', 2, 'g1')])
assert.deepEqual(union.map(item => item.id).sort(), ['local', 'remote'])

// 4. Groups: remote order, local-only kept, newer local rename wins.
const groups = mergeGroupMeta(
    [group('b', 1, 10, 100), group('a', 0, 5, 50)],
    [group('c', 2, 20, 5), group('a', 0, 5, 60)],
)
assert.deepEqual(groups.map(item => item.id), ['a', 'b', 'c'])

// 5. Tie on a group: the backend copy is kept (no client-only field to protect).
const tied = mergeGroupMeta([group('x', 0, 1, 10)], [group('x', 0, 1, 10)])
assert.deepEqual(tied, [group('x', 0, 1, 10)])

// 6. Ordering is position → creation → id, even if the backend sends it unsorted.
const ordered = mergeGroupMeta(
    [group('z', 3, 1), group('y', 1, 20), group('x', 1, 10)],
    [],
)
assert.deepEqual(ordered.map(item => item.id), ['x', 'y', 'z'])

// 7. Empty inputs are fine.
assert.deepEqual(mergeSessionMeta([], []), [])
assert.deepEqual(mergeGroupMeta([], []), [])

console.log('chat-session-merge.check: ok')