/**
 * Task output monitor: the contract the host and the UI rely on.
 *
 *   - `start` is idempotent per SOURCE (one cursor, one retained line ring), and
 *     the two log families (`dev` root / `task` id) never collide;
 *   - defaults are the documented ones, `pollMs` is clamped to its floor;
 *   - `pump` is incremental: it asks for lines after the cursor and never
 *     duplicates a line, even against a reader that replays everything;
 *   - triggers are level / pattern / settled, and hits inside the quiet window
 *     merge into exactly ONE event, idempotent by event id;
 *   - the budgets (`maxEvents`, `maxDurationMs`) expire the monitor and leave an
 *     `ended` event that says why;
 *   - a failing reader is absorbed and does not affect the other monitors;
 *   - persistence round-trips the running subscriptions and their cursors, and
 *     corrupted persisted state is ignored instead of thrown;
 *   - `autoMonitorTasks` wires the REAL background-task registry: started →
 *     monitor, settled → stop. The registry itself is untouched.
 *
 * No React here (there is no DOM in this check): the hooks are a thin
 * `useSyncExternalStore` wrapper whose snapshot-stability contract is checked on
 * the engine instead (`checkSnapshotStability`).
 */

import { strict as assert } from 'node:assert'
import { TaskMonitorEngine, monitorSourceKey } from './task-monitor'
import type {
    MonitorLogLine,
    MonitorLogPage,
    MonitorSource,
    TaskMonitorReader,
    TaskMonitorStorage,
} from './task-monitor'
import { backgroundTasks } from '../agent/background-tasks'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const deferred = () => {
    let resolve!: (value?: unknown) => void
    let reject!: (error?: unknown) => void
    const promise = new Promise((res, rej) => { resolve = res as any; reject = rej })
    return { promise, resolve, reject }
}

/** Source shorthands: most cases watch a project root (the `dev` family). */
const dev = (root: string): MonitorSource => ({ kind: 'dev', root })
const taskSource = (taskId: string): MonitorSource => ({ kind: 'task', taskId })

/** The `meta.root` a background tool passes; the auto wiring maps it to `dev`. */
const DEV_DEMO_ROOT = '/dev/demo'

/** The clock is injected, so gap/budget assertions never depend on wall time. */
const makeClock = (start = 1_000) => {
    let value = start
    return {
        now: () => value,
        get: () => value,
        set: (next: number) => { value = next },
        advance: (ms: number) => { value += ms },
    }
}

const line = (
    seq: number,
    level: MonitorLogLine['level'],
    message: string,
    at = 0,
): MonitorLogLine => ({ seq, level, message, at })

/**
 * A reader over a mutable line list, with the real incremental contract
 * (`sinceSeq` exclusive, `limit` applied). The array is closed over on purpose:
 * tests append to it mid-flight.
 */
const readerOver = (lines: MonitorLogLine[]) => {
    const calls: Array<{ source: MonitorSource; sinceSeq: number; limit?: number }> = []
    const reader: TaskMonitorReader = {
        read: async input => {
            calls.push({ ...input })
            const entries = lines
                .filter(entry => entry.seq >= input.sinceSeq)
                .slice(0, input.limit ?? 1_000)
            const nextSeq = entries.length > 0 ? entries[entries.length - 1].seq + 1 : input.sinceSeq
            return { entries, nextSeq, dropped: 0 }
        },
    }
    return { reader, calls }
}

const noopReader = (): TaskMonitorReader => ({
    read: async input => ({ entries: [], nextSeq: input.sinceSeq, dropped: 0 }),
})

/** In-memory storage that records what the engine wrote. */
const memoryStorage = () => {
    const state: { value: unknown; saves: number } = { value: null, saves: 0 }
    const storage: TaskMonitorStorage = {
        load: async () => state.value,
        save: async value => {
            state.saves += 1
            state.value = value
        },
    }
    return { storage, state }
}

/** Capture console.warn for the tests that assert on the "warn once" rule. */
const withWarnCapture = async (run: () => Promise<void>): Promise<string[]> => {
    const captured: string[] = []
    const original = console.warn
    console.warn = (...args: any[]) => { captured.push(args.map(String).join(' ')) }
    try {
        await run()
    } finally {
        console.warn = original
    }
    return captured
}

/* ------------------------------------------------------------------ *
 * Subscriptions
 * ------------------------------------------------------------------ */

async function checkStartIsIdempotentPerRoot(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    engine.configure({ now: clock.now, reader: noopReader() })

    const first = engine.start({ source: dev('/proj/a'), label: 'A', taskIds: ['bg-1'] })
    assert.equal(first.id, 'dev:/proj/a', 'the id is the source key')
    assert.equal(first.status, 'running')

    const again = engine.start({
        source: dev('/proj/a'),
        label: 'A renamed',
        taskIds: ['bg-1', 'bg-2'],
        cadence: { pollMs: 2_000 },
    })
    assert.equal(again.id, first.id, 'same root → the SAME subscription')
    assert.equal(engine.list().length, 1, 'and only one exists')
    assert.equal(again.createdAt, first.createdAt, 'restarting must not reset createdAt')
    assert.equal(again.label, 'A renamed', 'the label follows the latest start')
    assert.deepEqual(again.taskIds, ['bg-1', 'bg-2'], 'task ids follow the latest start')
    assert.equal(again.cadence.pollMs, 2_000, 'an explicit cadence is applied')

    // Stopping is terminal for that run, but the root can be watched again: a
    // task that restarts (a dev server coming back up) must be picked up.
    assert.equal(engine.stop(first.id), true)
    assert.equal(engine.stop(first.id), false, 'stopping an ended monitor reports it')
    const stopped = engine.list()[0]
    assert.equal(stopped.status, 'stopped')
    assert.ok(stopped.note, 'a stop explains itself')
    const resumed = engine.start({ source: dev('/proj/a'), label: 'A' })
    assert.equal(resumed.status, 'running', 'starting a stopped root reactivates it')
    assert.equal(resumed.note, undefined, 'and clears the stale reason')
    assert.equal(engine.list().length, 1)
    assert.equal(engine.stop('dev:unknown'), false, 'unknown ids are refused')
    engine.reset()
}

/* ------------------------------------------------------------------ *
 * Sources (dev root vs task id)
 * ------------------------------------------------------------------ */

function checkMonitorSourceKey(): void {
    assert.equal(monitorSourceKey(dev('/proj/a')), 'dev:/proj/a')
    assert.equal(monitorSourceKey(taskSource('task-7')), 'task:task-7')
    assert.equal(monitorSourceKey(dev('  /proj/a  ')), 'dev:/proj/a', 'the key is canonical (trimmed)')
    assert.notEqual(
        monitorSourceKey(dev('same')),
        monitorSourceKey(taskSource('same')),
        'the two families are namespaced, so an opaque id cannot collide',
    )
}

/**
 * One engine, two log families: idempotent per source (and only per source), each
 * with its own cursor, and the reader is told WHICH source it is reading.
 */
async function checkSourceIdempotencyAndDispatch(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    const reads: Array<{ source: MonitorSource; sinceSeq: number }> = []
    const reader: TaskMonitorReader = {
        read: async ({ source, sinceSeq }) => {
            reads.push({ source, sinceSeq })
            if (source.kind === 'dev') {
                const entries = sinceSeq === 0 ? [line(1, 'info', 'dev 1'), line(2, 'error', 'dev 2')] : []
                return { entries, nextSeq: entries.length > 0 ? 3 : sinceSeq, dropped: 0 }
            }
            const entries = sinceSeq === 0 ? [line(1, 'error', 'task boom')] : []
            return { entries, nextSeq: entries.length > 0 ? 2 : sinceSeq, dropped: 0 }
        },
    }
    engine.configure({ now: clock.now, reader })

    const rootSub = engine.start({ source: dev('/same'), label: 'dev log', cadence: { pollMs: 60_000 } })
    const taskSub = engine.start({ source: taskSource('same'), label: 'task log', cadence: { pollMs: 60_000 } })
    assert.equal(rootSub.id, 'dev:/same')
    assert.equal(taskSub.id, 'task:same')
    assert.equal(engine.list().length, 2, 'the same opaque id in two families is two monitors')
    assert.deepEqual(
        engine.list().map(view => view.source),
        [{ kind: 'dev', root: '/same' }, { kind: 'task', taskId: 'same' }],
        'the subscription exposes the source it watches',
    )

    // Idempotent per source — and only per source.
    const again = engine.start({ source: dev('/same'), label: 'renamed', cadence: { pollMs: 60_000 } })
    assert.equal(again.id, rootSub.id, 'same source → the same subscription')
    assert.equal(
        engine.start({ source: dev('  /same  '), label: 'padded' }).id,
        rootSub.id,
        'a padded root is the same source',
    )
    assert.equal(again.label, 'renamed')
    assert.equal(engine.list().length, 2)
    assert.equal(engine.start({ source: taskSource('same'), label: 't' }).id, taskSub.id)

    await engine.pump()
    assert.deepEqual(
        reads.map(entry => entry.source),
        [{ kind: 'dev', root: '/same' }, { kind: 'task', taskId: 'same' }],
        'the reader receives the source (so it can pick the right bridge)',
    )
    assert.deepEqual(reads.map(entry => entry.sinceSeq), [0, 0], 'each source starts at its own cursor')
    assert.deepEqual(engine.lines(rootSub.id).map(entry => entry.seq), [1, 2])
    assert.deepEqual(engine.lines(taskSub.id).map(entry => entry.seq), [1])
    assert.equal(engine.events(rootSub.id)[0]?.id, 'dev:/same:2-2:0', 'dev events are keyed by the dev source')
    assert.equal(engine.events(taskSub.id)[0]?.id, 'task:same:1-1:0', 'task events are keyed by the task source')

    await engine.pump()
    assert.deepEqual(reads.slice(2).map(entry => entry.sinceSeq), [3, 2], 'the cursors advance independently')
    engine.reset()
}

async function checkDefaultsAndClamps(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    engine.configure({ now: clock.now, reader: noopReader() })

    const plain = engine.start({ source: dev('/defaults'), label: 'defaults' })
    assert.deepEqual(plain.triggers, [{ kind: 'level', level: 'error' }], 'the default trigger is errors')
    assert.equal(plain.cadence.pollMs, 1_000)
    assert.equal(plain.cadence.minGapMs, 10_000)
    assert.equal(plain.cadence.maxEvents, 50)
    assert.equal(plain.cadence.maxDurationMs, 30 * 60_000)
    assert.equal(plain.cadence.maxLines, 500)
    assert.equal(plain.status, 'running')

    // An explicit empty trigger list would watch nothing: it falls back to the default.
    assert.deepEqual(
        engine.start({ source: dev('/empty-triggers'), label: 'e', triggers: [] }).triggers,
        [{ kind: 'level', level: 'error' }],
    )

    const fast = engine.start({ source: dev('/fast'), label: 'f', cadence: { pollMs: 5 } })
    assert.equal(fast.cadence.pollMs, 500, 'pollMs is clamped to its 500ms floor')

    const broken = engine.start({
        source: dev('/broken'),
        label: 'b',
        cadence: { maxLines: 0, maxEvents: -3, minGapMs: -1, maxDurationMs: 0, pollMs: Number.NaN },
    })
    assert.equal(broken.cadence.maxLines, 1, 'a non-positive maxLines is clamped to its floor')
    assert.equal(broken.cadence.maxEvents, 1, 'a non-positive maxEvents is clamped to its floor')
    assert.equal(broken.cadence.minGapMs, 0, 'a negative quiet window clamps to 0')
    assert.equal(broken.cadence.maxDurationMs, 1, 'a non-positive lifetime clamps to its floor')
    assert.equal(broken.cadence.pollMs, 1_000, 'NaN is not a cadence')
    engine.reset()
}

/* ------------------------------------------------------------------ *
 * Pulling
 * ------------------------------------------------------------------ */

async function checkIncrementalCursor(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    const lines: MonitorLogLine[] = [1, 2, 3, 4, 5].map(seq => line(seq, 'info', `boot ${seq}`))
    const { reader, calls } = readerOver(lines)
    engine.configure({ now: clock.now, reader })
    const sub = engine.start({
        source: dev('/inc'),
        label: 'inc',
        triggers: [{ kind: 'pattern', pattern: 'never-matches-this' }],
        cadence: { pollMs: 60_000 },
    })

    await engine.pump()
    assert.equal(calls[0].sinceSeq, 0, 'the first pull starts at seq 0')
    assert.deepEqual(engine.lines(sub.id).map(entry => entry.seq), [1, 2, 3, 4, 5])

    await engine.pump()
    assert.equal(calls[1].sinceSeq, 6, 'the cursor moves to page.nextSeq')
    assert.deepEqual(
        engine.lines(sub.id).map(entry => entry.seq),
        [1, 2, 3, 4, 5],
        're-pulling must not duplicate lines',
    )

    lines.push(line(6, 'info', 'boot 6'))
    await engine.pump()
    assert.deepEqual(
        engine.lines(sub.id).map(entry => entry.seq),
        [1, 2, 3, 4, 5, 6],
        'only the new line is appended',
    )
    assert.equal(engine.events(sub.id).length, 0, 'a pattern that never matches produces no events')
    engine.reset()
}

async function checkLineRingTrims(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    const lines: MonitorLogLine[] = [1, 2, 3, 4, 5].map(seq => line(seq, 'info', `boot ${seq}`))
    const { reader } = readerOver(lines)
    engine.configure({ now: clock.now, reader })
    const sub = engine.start({
        source: dev('/ring'),
        label: 'ring',
        triggers: [{ kind: 'pattern', pattern: 'nothing-matches' }],
        cadence: { maxLines: 3, pollMs: 60_000 },
    })

    await engine.pump()
    assert.deepEqual(
        engine.lines(sub.id).map(entry => entry.seq),
        [3, 4, 5],
        'the ring keeps the NEWEST maxLines lines',
    )

    lines.push(line(6, 'info', 'boot 6'))
    await engine.pump()
    assert.deepEqual(
        engine.lines(sub.id).map(entry => entry.seq),
        [4, 5, 6],
        'and keeps sliding',
    )
    engine.reset()
}

/* ------------------------------------------------------------------ *
 * Triggers
 * ------------------------------------------------------------------ */

async function checkLevelTrigger(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    const lines: MonitorLogLine[] = [
        line(1, 'info', 'starting'),
        line(2, 'warn', 'slow response'),
        line(3, 'error', 'handler is not defined'),
    ]
    const { reader } = readerOver(lines)
    engine.configure({ now: clock.now, reader })

    const errors = engine.start({
        source: dev('/level/error'),
        label: 'errors',
        triggers: [{ kind: 'level', level: 'error' }],
        cadence: { minGapMs: 0, pollMs: 60_000 },
    })
    await engine.pump()
    const errorEvents = engine.events(errors.id)
    assert.equal(errorEvents.length, 1, 'only the error line fires the error trigger')
    assert.equal(errorEvents[0].kind, 'trigger')
    assert.equal(errorEvents[0].matched?.message, 'handler is not defined')
    assert.deepEqual(errorEvents[0].matched?.trigger, { kind: 'level', level: 'error' })
    assert.ok(errorEvents[0].lines.some(entry => entry.seq === 3), 'the event carries the matching line')

    // A `warn` trigger is at-or-above: it sees the warning AND the error, never info.
    const warnings = engine.start({
        source: dev('/level/warn'),
        label: 'warnings',
        triggers: [{ kind: 'level', level: 'warn' }],
        cadence: { minGapMs: 0, pollMs: 60_000 },
    })
    await engine.pump()
    const warnEvents = engine.events(warnings.id)
    assert.equal(warnEvents.length, 2, 'warn and error each fire; info does not')
    assert.deepEqual(warnEvents.map(event => event.matched?.message), ['slow response', 'handler is not defined'])
    assert.ok(warnEvents.every(event => event.seqFrom >= 2), 'info lines never match a level trigger')
    engine.reset()
}

async function checkPatternTrigger(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    const lines: MonitorLogLine[] = [
        line(1, 'info', 'BUILD FAILED: uhandler is not defined'),
        line(2, 'info', 'everything is fine'),
    ]
    const { reader } = readerOver(lines)
    engine.configure({ now: clock.now, reader })

    const matcher = engine.start({
        source: dev('/pattern'),
        label: 'pattern',
        triggers: [{ kind: 'pattern', pattern: 'build failed', ignoreCase: true }],
        cadence: { minGapMs: 0, pollMs: 60_000 },
    })
    await engine.pump()
    const events = engine.events(matcher.id)
    assert.equal(events.length, 1, 'a case-insensitive pattern matches the message')
    assert.equal(events[0].matched?.message, 'BUILD FAILED: uhandler is not defined')

    // An invalid regexp must not throw and must not match.
    const invalid = engine.start({
        source: dev('/pattern/invalid'),
        label: 'invalid',
        triggers: [{ kind: 'pattern', pattern: '[' }],
        cadence: { minGapMs: 0, pollMs: 60_000 },
    })
    await engine.pump()
    assert.equal(engine.events(invalid.id).length, 0, 'an invalid pattern is inert, not fatal')
    engine.reset()
}

async function checkMinGapMergesHits(): Promise<void> {
    const clock = makeClock(10_000)
    const engine = new TaskMonitorEngine()
    const lines: MonitorLogLine[] = []
    const { reader } = readerOver(lines)
    engine.configure({ now: clock.now, reader })
    const sub = engine.start({
        source: dev('/gap'),
        label: 'gap',
        triggers: [{ kind: 'level', level: 'error' }],
        cadence: { minGapMs: 10_000, pollMs: 60_000 },
    })

    lines.push(line(1, 'error', 'first failure'))
    await engine.pump()
    assert.equal(engine.events(sub.id).length, 1, 'the first hit is reported at once')

    clock.advance(500)
    lines.push(line(2, 'error', 'second failure'))
    await engine.pump()
    lines.push(line(3, 'error', 'third failure'))
    await engine.pump()
    assert.equal(
        engine.events(sub.id).length,
        1,
        'hits inside the quiet window are queued, not emitted one by one',
    )

    clock.advance(10_000)
    await engine.pump()
    const events = engine.events(sub.id)
    assert.equal(events.length, 2, 'the queue becomes ONE merged event')
    assert.equal(events[1].kind, 'trigger')
    assert.equal(events[1].matched?.message, 'second failure', 'matched = the FIRST hit of the batch')
    assert.equal(events[1].seqFrom, 2)
    assert.equal(events[1].seqTo, 3)
    assert.equal(events[1].id, `${sub.id}:2-3:0`, 'the id is the documented idempotency key')
    assert.deepEqual(
        events[1].lines.map(entry => entry.seq),
        [1, 2, 3],
        'the event carries the pending hits plus their context',
    )

    await engine.pump()
    assert.equal(engine.events(sub.id).length, 2, 'the merged batch is never emitted twice')
    engine.reset()
}

async function checkEventContextIsBounded(): Promise<void> {
    const clock = makeClock(10_000)
    const engine = new TaskMonitorEngine()
    const lines: MonitorLogLine[] = []
    const { reader } = readerOver(lines)
    engine.configure({ now: clock.now, reader })
    const sub = engine.start({
        source: dev('/burst'),
        label: 'burst',
        triggers: [{ kind: 'level', level: 'error' }],
        cadence: { minGapMs: 5_000, pollMs: 60_000 },
    })

    for (let seq = 1; seq <= 30; seq += 1) lines.push(line(seq, 'error', `failure ${seq}`))
    await engine.pump()
    clock.advance(5_000)
    await engine.pump()

    const events = engine.events(sub.id)
    assert.equal(events.length, 2, 'one event for the immediate hit, one for the merged burst')
    const burst = events[1]
    assert.ok(burst.lines.length <= 20, 'an event never carries more than 20 lines')
    assert.ok(
        burst.lines.some(entry => entry.seq === burst.seqFrom),
        'the context includes the first matching line of the batch',
    )
    assert.equal(burst.seqFrom, 2)
    assert.equal(burst.seqTo, 30)
    engine.reset()
}

/* ------------------------------------------------------------------ *
 * Budgets
 * ------------------------------------------------------------------ */

async function checkMaxEventsExpires(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    const lines: MonitorLogLine[] = [
        line(1, 'error', 'failure 1'),
        line(2, 'error', 'failure 2'),
        line(3, 'error', 'failure 3'),
    ]
    const { reader, calls } = readerOver(lines)
    engine.configure({ now: clock.now, reader })
    const sub = engine.start({
        source: dev('/budget/events'),
        label: 'budget',
        triggers: [{ kind: 'level', level: 'error' }],
        cadence: { maxEvents: 2, minGapMs: 0, pollMs: 60_000 },
    })

    await engine.pump()
    const view = engine.list()[0]
    assert.equal(view.status, 'expired', 'reaching maxEvents expires the monitor')
    assert.match(view.note ?? '', /上限/, 'the subscription says why')

    const events = engine.events(sub.id)
    const triggers = events.filter(event => event.kind === 'trigger')
    const ended = events.filter(event => event.kind === 'ended')
    assert.equal(triggers.length, 2, 'the budget is exactly maxEvents trigger events')
    assert.equal(ended.length, 1, 'expiry leaves one ended event')
    assert.match(ended[0].note ?? '', /2/, 'and it names the budget')

    const reads = calls.length
    await engine.pump()
    assert.equal(calls.length, reads, 'an expired monitor is not pulled again')
    engine.reset()
}

async function checkMaxDurationExpires(): Promise<void> {
    const clock = makeClock(5_000)
    const engine = new TaskMonitorEngine()
    const { reader, calls } = readerOver([])
    engine.configure({ now: clock.now, reader })
    const sub = engine.start({
        source: dev('/budget/duration'),
        label: 'duration',
        cadence: { maxDurationMs: 1_000, pollMs: 60_000 },
    })

    clock.set(5_999)
    await engine.pump()
    assert.equal(engine.list()[0].status, 'running', 'inside the budget it keeps running')
    assert.equal(calls.length, 1, 'and it still pulls')

    clock.set(6_000)
    await engine.pump()
    const view = engine.list()[0]
    assert.equal(view.status, 'expired', 'reaching maxDurationMs expires the monitor')
    assert.match(view.note ?? '', /最长监控时长/)
    const ended = engine.events(sub.id).filter(event => event.kind === 'ended')
    assert.equal(ended.length, 1, 'duration expiry also leaves an ended event')
    const reads = calls.length
    await engine.pump()
    assert.equal(calls.length, reads, 'and stops pulling')
    engine.reset()
}

/* ------------------------------------------------------------------ *
 * Failure handling
 * ------------------------------------------------------------------ */

async function checkReaderFailureIsIsolated(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    let broken = true
    const reader: TaskMonitorReader = {
        read: async input => {
            const root = input.source.kind === 'dev' ? input.source.root : ''
            if (root === '/reader/broken' && broken) throw new Error('ipc down')
            const entries = root === '/reader/healthy' ? [line(1, 'info', 'healthy line')] : []
            const nextSeq = entries.length > 0 ? 2 : input.sinceSeq
            return { entries, nextSeq, dropped: 0 }
        },
    }
    engine.configure({ now: clock.now, reader })
    const brokenSub = engine.start({ source: dev('/reader/broken'), label: 'broken', cadence: { pollMs: 60_000 } })
    const healthySub = engine.start({ source: dev('/reader/healthy'), label: 'healthy', cadence: { pollMs: 60_000 } })

    const warnings = await withWarnCapture(async () => {
        await engine.pump()
        await engine.pump()
    })
    assert.equal(
        warnings.filter(warning => warning.includes('read failed')).length,
        1,
        'a failing reader warns once per failure streak, not on every tick',
    )
    assert.equal(engine.list().find(view => view.id === brokenSub.id)?.status, 'running', 'the monitor survives')
    assert.deepEqual(engine.lines(brokenSub.id), [], 'and keeps its cursor instead of corrupting it')
    assert.deepEqual(
        engine.lines(healthySub.id).map(entry => entry.seq),
        [1],
        'the other monitor is not affected by the failure',
    )

    broken = false
    await engine.pump()
    assert.equal(engine.lines(brokenSub.id).length, 0, 'the broken source still returns nothing')
    assert.equal(engine.list().find(view => view.id === brokenSub.id)?.status, 'running')
    engine.reset()
}

async function checkPumpWithoutReader(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    engine.configure({ now: clock.now })
    const sub = engine.start({ source: dev('/no-reader'), label: 'none', cadence: { pollMs: 60_000 } })
    await engine.pump()
    assert.equal(engine.list()[0].status, 'running', 'no reader is not a failure')
    assert.deepEqual(engine.lines(sub.id), [])

    // The duration budget is enforced even without a reader.
    clock.advance(30 * 60_000)
    await engine.pump()
    assert.equal(engine.list()[0].status, 'expired')
    engine.reset()
}

/* ------------------------------------------------------------------ *
 * Settled
 * ------------------------------------------------------------------ */

async function checkNotifySettledStops(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    engine.configure({ now: clock.now, reader: noopReader() })

    const sub = engine.start({
        source: dev('/settle'),
        label: 'settle',
        triggers: [{ kind: 'level', level: 'error' }, { kind: 'settled' }],
        cadence: { pollMs: 60_000 },
    })
    assert.equal(engine.notifySettled(dev('/settle')), true, 'a running monitor reacts to the settle')
    const events = engine.events(sub.id)
    assert.equal(events.length, 1)
    assert.equal(events[0].kind, 'trigger')
    assert.equal(events[0].matched?.trigger.kind, 'settled', 'the settle is a trigger, not a note')
    assert.equal(engine.list()[0].status, 'stopped')
    assert.equal(engine.list()[0].note, '任务已结束')
    assert.equal(engine.notifySettled(dev('/settle')), false, 'settling twice is a no-op')
    assert.equal(engine.notifySettled(dev('/unknown')), false, 'an unknown root is a no-op')
    assert.equal(engine.notifySettled(dev('')), false)

    // Without a `settled` trigger the monitor still stops (there is nothing left
    // to watch), but the reason is a status event rather than a fake trigger.
    const plain = engine.start({ source: dev('/settle/plain'), label: 'plain', cadence: { pollMs: 60_000 } })
    assert.equal(engine.notifySettled(dev('/settle/plain')), true)
    assert.equal(engine.list().find(view => view.id === plain.id)?.status, 'stopped')
    assert.equal(engine.events(plain.id)[0].kind, 'status', 'no settled trigger means no trigger event')

    // A monitor that is started again on the same root must not reuse the id of
    // its previous settle/expiry events.
    const again = engine.start({ source: dev('/settle/plain'), label: 'plain again', cadence: { pollMs: 60_000 } })
    assert.equal(again.status, 'running', 'the root can be watched again')
    engine.notifySettled(dev('/settle/plain'))
    const settledEvents = engine.events(again.id)
    assert.equal(settledEvents.length, 2, 'the second settle is a new event')
    assert.equal(
        new Set(settledEvents.map(event => event.id)).size,
        settledEvents.length,
        'event ids stay unique across a reactivation',
    )
    engine.reset()
}

/** A settle is scoped to ONE source: the dev root settling must not stop a task. */
async function checkNotifySettledIsScoped(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    engine.configure({ now: clock.now, reader: noopReader() })
    const rootSub = engine.start({ source: dev('/scoped'), label: 'dev', cadence: { pollMs: 60_000 } })
    const taskSub = engine.start({
        source: taskSource('/scoped'),
        label: 'task',
        triggers: [{ kind: 'settled' }],
        cadence: { pollMs: 60_000 },
    })

    // Same opaque string, different family: only the task source notices.
    assert.equal(engine.notifySettled(taskSource('/scoped')), true)
    assert.equal(engine.list().find(view => view.id === taskSub.id)?.status, 'stopped')
    assert.equal(
        engine.list().find(view => view.id === rootSub.id)?.status,
        'running',
        'a task settle does not stop the dev root monitor',
    )
    assert.equal(engine.events(rootSub.id).length, 0, 'and produces no event on the other source')
    assert.equal(engine.notifySettled(dev('/scoped')), true, 'the dev source settles on its own')
    engine.reset()
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

async function checkPersistenceRoundTrip(): Promise<void> {
    const clock = makeClock(10_000)
    const lines: MonitorLogLine[] = [line(1, 'info', 'boot'), line(2, 'info', 'ready')]
    const memory = memoryStorage()
    const engine = new TaskMonitorEngine()
    const first = readerOver(lines)
    engine.configure({ storage: memory.storage, reader: first.reader, now: clock.now })
    const sub = engine.start({
        source: dev('/persist'),
        label: 'persist',
        taskIds: ['bg-7'],
        cadence: { pollMs: 60_000 },
    })
    await engine.pump()
    assert.equal(first.calls[0].sinceSeq, 0)

    // The save is debounced (~1s), so give it its window.
    await sleep(1_100)
    assert.ok(memory.state.value, 'the subscription is persisted')
    const saved = memory.state.value as any
    assert.equal(saved.v, 2, 'the payload carries its version')
    assert.equal(saved.subscriptions.length, 1)
    assert.equal(saved.subscriptions[0].id, sub.id)
    assert.deepEqual(saved.subscriptions[0].source, { kind: 'dev', root: '/persist' }, 'v2 persists the source')
    assert.equal(saved.subscriptions[0].label, 'persist')
    assert.deepEqual(saved.subscriptions[0].taskIds, ['bg-7'])
    assert.equal(saved.cursors[sub.id], 3, 'the cursor is persisted next to the subscription')

    // A fresh engine (the "app was reloaded" case) restores it — cursor included,
    // so the first pull after the reload asks for NEW lines only.
    const second = readerOver(lines)
    const restarted = new TaskMonitorEngine()
    restarted.configure({ storage: memory.storage, reader: second.reader, now: clock.now })
    await restarted.pump()
    const restored = restarted.list()[0]
    assert.ok(restored, 'the running subscription is restored')
    assert.equal(restored.id, sub.id)
    assert.equal(restored.status, 'running')
    assert.equal(restored.createdAt, sub.createdAt)
    assert.equal(restored.label, 'persist')
    assert.deepEqual(restored.taskIds, ['bg-7'])
    assert.equal(second.calls[0].sinceSeq, 3, 'the cursor survived the reload')

    // A restore past the duration budget expires instead of resurrecting.
    const stale = new TaskMonitorEngine()
    const staleClock = makeClock(sub.createdAt + 30 * 60_000)
    stale.configure({ storage: memory.storage, reader: noopReader(), now: staleClock.now })
    await stale.pump()
    const staleView = stale.list()[0]
    assert.equal(staleView.status, 'expired', 'a monitor older than its budget is not resurrected')
    assert.equal(stale.events(staleView.id).length, 0, 'and restoring does not fabricate an ended event')

    // A save that fails is swallowed, not an unhandled rejection.
    const failing: TaskMonitorStorage = {
        load: async () => null,
        save: async () => { throw new Error('disk full') },
    }
    const fragile = new TaskMonitorEngine()
    fragile.configure({ storage: failing, reader: noopReader(), now: clock.now })
    fragile.start({ source: dev('/persist/failing'), label: 'failing', cadence: { pollMs: 60_000 } })
    const warnings = await withWarnCapture(async () => { await sleep(1_100) })
    assert.equal(
        warnings.filter(warning => warning.includes('save failed')).length,
        1,
        'a failing save is reported once and otherwise ignored',
    )

    engine.reset()
    restarted.reset()
    stale.reset()
    fragile.reset()
}

/**
 * v1 payloads keyed subscriptions by `root` and cursors by `root:<root>`; reading
 * them migrates to `{kind:'dev'}` / `dev:<root>`, and the next save is v2.
 */
async function checkLegacyV1Migration(): Promise<void> {
    const clock = makeClock(9_000)
    const legacy = {
        v: 1,
        subscriptions: [
            { root: '/legacy/dev', label: 'legacy dev', createdAt: 8_000, status: 'running', taskIds: ['bg-1'] },
            { root: 42 },
            { label: 'no root at all' },
        ],
        cursors: { 'root:/legacy/dev': 7 },
    }
    const state: { value: unknown } = { value: legacy }
    const storage: TaskMonitorStorage = {
        load: async () => state.value,
        save: async value => { state.value = value },
    }
    const engine = new TaskMonitorEngine()
    const { reader, calls } = readerOver([])
    engine.configure({ storage, reader, now: clock.now })
    await engine.pump()

    const restored = engine.list()
    assert.equal(restored.length, 1, 'the valid v1 entry is migrated; unusable ones are ignored')
    assert.equal(restored[0].id, 'dev:/legacy/dev')
    assert.deepEqual(restored[0].source, { kind: 'dev', root: '/legacy/dev' })
    assert.equal(restored[0].label, 'legacy dev')
    assert.deepEqual(restored[0].taskIds, ['bg-1'])
    assert.equal(calls[0].sinceSeq, 7, 'the v1 `root:<root>` cursor is migrated')

    // Migration is one-way: the next debounced save writes the v2 shape.
    await sleep(1_100)
    const saved = state.value as any
    assert.equal(saved.v, 2, 'the migrated state is written back as v2')
    assert.deepEqual(saved.subscriptions[0].source, { kind: 'dev', root: '/legacy/dev' })
    assert.equal(saved.cursors['dev:/legacy/dev'], 7, 'cursors are re-keyed by monitorSourceKey')
    engine.reset()

    // A v1 monitor past its budget expires during the migration too (no event).
    const staleEngine = new TaskMonitorEngine()
    staleEngine.configure({
        storage: { load: async () => legacy, save: async () => {} },
        reader: noopReader(),
        now: makeClock(8_000 + 30 * 60_000).now,
    })
    await staleEngine.pump()
    assert.equal(staleEngine.list()[0]?.status, 'expired')
    assert.deepEqual(staleEngine.events('dev:/legacy/dev'), [])
    staleEngine.reset()
}

async function checkBadStorageIsIgnored(): Promise<void> {
    const clock = makeClock(9_000)
    const badValues: unknown[] = [
        'nonsense',
        42,
        null,
        { v: 3, subscriptions: [] },
        { v: 2, subscriptions: 'not-an-array' },
        { v: 2, subscriptions: [null, 42, { root: 5 }, { source: dev('') }, { source: dev('   ') }] },
        { v: 2, subscriptions: [{ source: { kind: 'nonsense', root: '/x' } }] },
    ]
    for (const value of badValues) {
        const engine = new TaskMonitorEngine()
        const storage: TaskMonitorStorage = { load: async () => value, save: async () => {} }
        engine.configure({ storage, now: clock.now })
        await engine.pump()
        assert.equal(engine.list().length, 0, `bad persisted state is ignored: ${JSON.stringify(value)}`)
        // …and the engine is still perfectly usable afterwards.
        const sub = engine.start({ source: dev('/after-bad-state'), label: 'ok' })
        assert.equal(sub.status, 'running')
        engine.reset()
    }

    // A partially valid entry is repaired (unknown triggers → default, cadence
    // clamped) instead of discarding the whole payload.
    const partial = new TaskMonitorEngine()
    const partialStorage: TaskMonitorStorage = {
        load: async () => ({
            v: 2,
            subscriptions: [{
                source: dev('/partial'),
                label: 'partial',
                createdAt: 8_000,
                status: 'running',
                triggers: [{ kind: 'nonsense' }],
                cadence: { pollMs: 10, maxLines: 'many' },
            }],
            cursors: { 'dev:/partial': 7 },
        }),
        save: async () => {},
    }
    const { reader, calls } = readerOver([])
    partial.configure({ storage: partialStorage, reader, now: clock.now })
    await partial.pump()
    const view = partial.list()[0]
    assert.equal(view.id, 'dev:/partial')
    assert.equal(view.cadence.pollMs, 500, 'a restored cadence is clamped like a supplied one')
    assert.equal(view.cadence.maxLines, 500, 'invalid cadence fields fall back to defaults')
    assert.deepEqual(view.triggers, [{ kind: 'level', level: 'error' }], 'unknown triggers fall back')
    assert.equal(calls[0].sinceSeq, 7, 'the restored cursor is used')
    partial.reset()

    // A load that throws is absorbed too.
    const throwing = new TaskMonitorEngine()
    throwing.configure({ storage: { load: async () => { throw new Error('boom') }, save: async () => {} }, now: clock.now })
    const warnings = await withWarnCapture(async () => { await throwing.pump() })
    assert.equal(throwing.list().length, 0)
    assert.ok(warnings.some(warning => warning.includes('load failed')), 'a broken load is reported once')
    throwing.reset()
}

/* ------------------------------------------------------------------ *
 * Snapshot stability (what the hooks depend on)
 * ------------------------------------------------------------------ */

async function checkSnapshotStability(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    const lines: MonitorLogLine[] = [line(1, 'info', 'boot')]
    engine.configure({ reader: readerOver(lines).reader, now: clock.now })
    const notified: number[] = []
    const unsubscribe = engine.subscribe(() => notified.push(engine.getVersion()))

    const before = engine.getVersion()
    const empty = engine.list()
    assert.equal(empty, engine.list(), 'same version → the same array identity')
    assert.equal(engine.events(), engine.events(), 'events snapshot is stable too')

    const sub = engine.start({ source: dev('/snapshot'), label: 'snapshot', cadence: { pollMs: 60_000 } })
    assert.ok(engine.getVersion() > before, 'a change bumps the version')
    assert.equal(notified.length, 1, 'and notifies subscribers exactly once')
    assert.notEqual(empty, engine.list(), 'a change produces a new snapshot')

    const list = engine.list()
    assert.equal(list, engine.list(), 'the new snapshot is stable again')
    assert.equal(engine.lines(sub.id), engine.lines(sub.id))
    assert.equal(engine.events(sub.id), engine.events(sub.id))

    await engine.pump()
    assert.equal(notified.length, 2, 'a pump with new lines is a state change')
    assert.notEqual(list, engine.list())

    unsubscribe()
    const seen = notified.length
    engine.pump()
    assert.equal(notified.length, seen, 'unsubscribed listeners are not called')
    engine.reset()
}

async function checkDuplicateReplay(): Promise<void> {
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    // A badly behaved reader that re-sends every line on every call.
    const fixed: MonitorLogPage = {
        entries: [line(1, 'error', 'boom')],
        nextSeq: 2,
        dropped: 0,
    }
    const reader: TaskMonitorReader = { read: async () => fixed }
    engine.configure({ now: clock.now, reader })
    const sub = engine.start({
        source: dev('/replay'),
        label: 'replay',
        triggers: [{ kind: 'level', level: 'error' }],
        cadence: { minGapMs: 0, pollMs: 60_000 },
    })
    await engine.pump()
    await engine.pump()
    await engine.pump()
    const events = engine.events(sub.id)
    assert.equal(events.length, 1, 'a replayed line never produces a second event')
    assert.equal(new Set(events.map(event => event.id)).size, events.length, 'event ids stay unique')
    engine.reset()
}

/* ------------------------------------------------------------------ *
 * Auto wiring (real background-task registry)
 * ------------------------------------------------------------------ */

async function checkAutoMonitorTasks(): Promise<void> {
    backgroundTasks.reset()
    const clock = makeClock()
    const engine = new TaskMonitorEngine()
    const { reader } = readerOver([])
    engine.configure({ autoMonitorTasks: true, reader, now: clock.now })

    const gate = deferred()
    const task = backgroundTasks.start({
        tool: 'runPluginProject',
        title: '监听 demo',
        meta: { root: DEV_DEMO_ROOT },
        run: () => gate.promise,
    })

    let subs = engine.list()
    assert.equal(subs.length, 1, 'a started task carrying a root is monitored')
    assert.deepEqual(
        subs[0].source,
        { kind: 'dev', root: DEV_DEMO_ROOT },
        'the auto wiring maps `meta.root` onto a dev source',
    )
    assert.equal(subs[0].label, '监听 demo', 'the monitor is labeled like the task')
    assert.deepEqual(subs[0].taskIds, [task.id])
    assert.equal(subs[0].status, 'running')

    // A task without a root is not a monitor candidate.
    backgroundTasks.start({ tool: 'buildPluginProject', title: '无 root', run: async () => 'ok' })
    assert.equal(engine.list().length, 1, 'only tasks with a string root start a monitor')

    gate.resolve('done')
    await sleep(10)
    subs = engine.list()
    assert.equal(subs[0].status, 'stopped', 'settling the task stops its monitor')
    const events = engine.events(subs[0].id)
    assert.equal(
        events.filter(event => event.kind === 'trigger').length,
        0,
        'the default triggers do not include settled, so no fake trigger event',
    )
    assert.equal(events[0]?.kind, 'status', 'the stop is still explained')
    assert.equal(backgroundTasks.get(task.id)?.status, 'succeeded', 'the registry itself is untouched')

    engine.reset()
    backgroundTasks.reset()
}

async function main(): Promise<void> {
    await checkStartIsIdempotentPerRoot()
    checkMonitorSourceKey()
    await checkSourceIdempotencyAndDispatch()
    await checkDefaultsAndClamps()
    await checkIncrementalCursor()
    await checkLineRingTrims()
    await checkLevelTrigger()
    await checkPatternTrigger()
    await checkMinGapMergesHits()
    await checkEventContextIsBounded()
    await checkMaxEventsExpires()
    await checkMaxDurationExpires()
    await checkReaderFailureIsIsolated()
    await checkPumpWithoutReader()
    await checkNotifySettledStops()
    await checkNotifySettledIsScoped()
    await checkPersistenceRoundTrip()
    await checkLegacyV1Migration()
    await checkBadStorageIsIgnored()
    await checkSnapshotStability()
    await checkDuplicateReplay()
    await checkAutoMonitorTasks()
    console.log('task-monitor.check: ok')
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})