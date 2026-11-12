/**
 * Monitor reader adapters: the bridge seam the engine relies on.
 *
 *   - `source.kind` decides WHICH bridge is asked (`dev` → `dev.logsSince`,
 *     `task` → `task.logsSince`), and the bridge receives exactly its own
 *     options shape (`root` vs `taskId`), cursor included;
 *   - host entries are normalised for the engine: a missing `seq` is rebuilt from
 *     the cursor (older dev hosts omit it, and the engine needs a dense
 *     sequence), an unknown level degrades to `info`, a missing timestamp is 0;
 *   - a `null`/malformed page is an EMPTY page that keeps the cursor (no session
 *     yet is not an error), while a missing bridge throws the documented error
 *     and the engine's warn-once path keeps the monitor alive;
 *   - a real bridge (with its extra page fields) is structurally accepted, which
 *     is what lets a host pass `desktop.dev` / `desktop.tasks` directly.
 *
 * No React and no desktop import: the bridges are injected.
 */

import { strict as assert } from 'node:assert'
import { createMonitorReader } from './monitor-readers'
import { TaskMonitorEngine } from './task-monitor'
import type { MonitorSource } from './task-monitor'

const dev = (root: string): MonitorSource => ({ kind: 'dev', root })
const taskSource = (taskId: string): MonitorSource => ({ kind: 'task', taskId })

/** Capture console.warn for the "the engine absorbs a missing bridge" case. */
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

async function checkDispatch(): Promise<void> {
    const devCalls: any[] = []
    const taskCalls: any[] = []
    const reader = createMonitorReader({
        dev: {
            logsSince: async options => {
                devCalls.push(options)
                return { entries: [], nextSeq: options.sinceSeq, dropped: 0 }
            },
        },
        tasks: {
            logsSince: async options => {
                taskCalls.push(options)
                return { entries: [], nextSeq: options.sinceSeq, dropped: 0 }
            },
        },
    })

    await reader.read({ source: dev('/proj'), sinceSeq: 11 })
    assert.deepEqual(devCalls, [{ root: '/proj', sinceSeq: 11 }], 'a dev source asks the dev bridge')
    assert.deepEqual(taskCalls, [], 'and not the task bridge')

    await reader.read({ source: taskSource('t-1'), sinceSeq: 3, limit: 25 })
    assert.deepEqual(taskCalls, [{ taskId: 't-1', sinceSeq: 3, limit: 25 }], 'a task source asks the task bridge')
    assert.equal(devCalls.length, 1, 'each call reaches exactly one bridge')

    // Sources are trimmed once, at the seam, so `dev:/a` and `dev:/a ` are one key.
    await reader.read({ source: dev('  /trimmed  '), sinceSeq: 0 })
    assert.deepEqual(devCalls[1], { root: '/trimmed', sinceSeq: 0 }, 'the root is trimmed before it reaches the bridge')
}

async function checkNormalization(): Promise<void> {
    const reader = createMonitorReader({
        dev: {
            logsSince: async () => ({
                entries: [
                    { seq: 4, level: 'error', message: 'exact', at: 111 },
                    { level: 'LOUD', message: 'fallback seq, bad level' },
                    { seq: 'nope', level: 'warn', message: 'bad seq' },
                    42,
                    null,
                ],
                nextSeq: 99,
                dropped: 3,
            }),
        },
    })

    const page = await reader.read({ source: dev('/n'), sinceSeq: 10 })
    assert.deepEqual(
        page.entries,
        [
            { seq: 4, level: 'error', message: 'exact', at: 111 },
            { seq: 12, level: 'info', message: 'fallback seq, bad level', at: 0 },
            { seq: 13, level: 'warn', message: 'bad seq', at: 0 },
            { seq: 14, level: 'info', message: '42', at: 0 },
            { seq: 15, level: 'info', message: '', at: 0 },
        ],
        'missing seq comes from the cursor, bad level is info, missing at is 0, unknown entries become text',
    )
    assert.equal(page.nextSeq, 99, 'a valid nextSeq is kept')
    assert.equal(page.dropped, 3, 'dropped is passed through')
}

async function checkPagesThatAreNotThere(): Promise<void> {
    let next: any = null
    const reader = createMonitorReader({ dev: { logsSince: async () => next } })

    const empty = await reader.read({ source: dev('/n'), sinceSeq: 41 })
    assert.deepEqual(
        empty,
        { entries: [], nextSeq: 41, dropped: 0 },
        'a null page is an empty page that keeps the cursor',
    )

    next = { entries: 'not-an-array', nextSeq: 'nope', dropped: undefined }
    const broken = await reader.read({ source: dev('/n'), sinceSeq: 41, limit: 5 })
    assert.deepEqual(
        broken,
        { entries: [], nextSeq: 41, dropped: 0 },
        'a malformed page degrades to an empty one instead of throwing',
    )

    // A cursor the host cannot make sense of must not produce seq 0 lines.
    const zero = createMonitorReader({
        dev: { logsSince: async () => ({ entries: [{ level: 'info', message: 'x' }], nextSeq: 1, dropped: 0 }) },
    })
    const zeroPage = await zero.read({ source: dev('/n'), sinceSeq: Number.NaN })
    assert.equal(zeroPage.entries[0].seq, 1, 'a NaN cursor falls back to 0 and the line still gets seq 1')
}

async function checkMissingBridges(): Promise<void> {
    const reader = createMonitorReader({})
    await assert.rejects(
        () => reader.read({ source: dev('/x'), sinceSeq: 0 }),
        /monitor: no dev log bridge available/,
        'a missing dev bridge has a clear error',
    )
    await assert.rejects(
        () => reader.read({ source: taskSource('t'), sinceSeq: 0 }),
        /monitor: no task log bridge available/,
        'a missing task bridge has a clear error',
    )

    const half = createMonitorReader({ dev: null, tasks: { logsSince: async () => null } })
    await assert.rejects(() => half.read({ source: dev('/x'), sinceSeq: 0 }), /no dev log bridge/)

    // The ENGINE is what turns that error into "no logs yet, still watching":
    // one warning, monitor alive, other sources unaffected.
    const engine = new TaskMonitorEngine()
    const clock = { now: 1_000 }
    engine.configure({ reader, now: () => clock.now })
    const sub = engine.start({ source: dev('/missing'), label: 'missing', cadence: { pollMs: 60_000 } })
    const warnings = await withWarnCapture(async () => {
        await engine.pump()
        await engine.pump()
    })
    assert.equal(warnings.filter(warning => warning.includes('read failed')).length, 1, 'the engine warns once')
    assert.equal(engine.list()[0].status, 'running', 'and the monitor stays alive')
    assert.deepEqual(engine.lines(sub.id), [])
    engine.reset()
}

/**
 * A REAL host bridge (extra page fields, optional `sinceSeq` in its options) is
 * structurally accepted, and the engine produces an event through the adapter.
 */
async function checkRealBridgeShape(): Promise<void> {
    const devBridge = {
        logsSince: async (options: { root: string; sinceSeq?: number; limit?: number }) => ({
            root: options.root,
            sessionId: 's-1',
            entries: [{ seq: 1, level: 'warn' as const, message: 'warn! slow', at: 5 }],
            nextSeq: 2,
            dropped: 0,
            total: 1,
        }),
    }
    const taskBridge = {
        logsSince: async (options: { taskId: string; sinceSeq?: number; limit?: number }) => ({
            taskId: options.taskId,
            sessionId: 's-2',
            entries: [{ seq: 9, level: 'info' as const, message: 'task line', at: 6 }],
            nextSeq: 10,
            dropped: 0,
            total: 1,
        }),
    }
    const reader = createMonitorReader({ dev: devBridge, tasks: taskBridge })

    const devPage = await reader.read({ source: dev('/bridge'), sinceSeq: 0 })
    assert.deepEqual(devPage.entries, [{ seq: 1, level: 'warn', message: 'warn! slow', at: 5 }])
    assert.equal(devPage.nextSeq, 2)
    const taskPage = await reader.read({ source: taskSource('t'), sinceSeq: 8 })
    assert.deepEqual(taskPage.entries.map(entry => entry.message), ['task line'])
    assert.equal(taskPage.nextSeq, 10)

    // End to end: adapter + engine, no extra glue.
    const engine = new TaskMonitorEngine()
    engine.configure({ reader, now: () => 5_000 })
    const sub = engine.start({
        source: dev('/bridge'),
        label: 'bridge',
        triggers: [{ kind: 'pattern', pattern: 'slow' }],
        cadence: { minGapMs: 0, pollMs: 60_000 },
    })
    await engine.pump()
    const events = engine.events(sub.id)
    assert.equal(events.length, 1, 'a line read through the adapter is matched by the engine')
    assert.equal(events[0].matched?.message, 'warn! slow')
    assert.deepEqual(engine.lines(sub.id).map(entry => entry.seq), [1])
    engine.reset()
}

async function main(): Promise<void> {
    await checkDispatch()
    await checkNormalization()
    await checkPagesThatAreNotThere()
    await checkMissingBridges()
    await checkRealBridgeShape()
    console.log('monitor-readers.check: ok')
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})