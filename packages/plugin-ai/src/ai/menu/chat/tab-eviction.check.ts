import { strict as assert } from 'node:assert'
import { pickEvictableTab, planOpenTab } from './tab-eviction'

/**
 * The tab ceiling used to evict the oldest non-active tab unconditionally —
 * including a tab whose agent was mid-run. These assertions pin the rule that
 * a live run is never the victim, and that the soft ceiling is exceeded when
 * every other tab is busy.
 */

const running = new Set(['t2', 't3'])
const isRunning = (id: string) => running.has(id)

// 1. Oldest idle, non-active tab wins — never the active one, never a running one.
assert.equal(pickEvictableTab(['t1', 't2', 't3', 't4', 't5', 't6'], 't1', isRunning), 3)

// 2. The active tab is skipped even when it is the oldest and idle.
assert.equal(pickEvictableTab(['t1', 't2', 't4'], 't1', () => false), 1)

// 3. Every other tab is running → no candidate; the caller must not drop one.
assert.equal(pickEvictableTab(['t1', 't2', 't3'], 't1', isRunning), -1)

// 4. At the ceiling, an idle tab is evicted and the new one appended.
assert.deepEqual(
    planOpenTab(['t1', 't2', 't3', 't4', 't5', 't6'], 't7', 't1', 6, isRunning),
    { tabs: ['t1', 't2', 't3', 't5', 't6', 't7'], evicted: 't4' },
)

// 5. All other tabs running → soft ceiling exceeded, nothing dropped.
assert.deepEqual(
    planOpenTab(['t1', 't2', 't3'], 't4', 't1', 3, isRunning),
    { tabs: ['t1', 't2', 't3', 't4'], evicted: null },
)

// 6. Below the ceiling → plain append, and opening an existing tab is a no-op.
assert.deepEqual(
    planOpenTab(['t1', 't2'], 't3', 't1', 6, isRunning),
    { tabs: ['t1', 't2', 't3'], evicted: null },
)
assert.deepEqual(
    planOpenTab(['t1', 't2'], 't1', 't1', 6, isRunning),
    { tabs: ['t1', 't2'], evicted: null },
)

console.log('tab-eviction.check: ok')