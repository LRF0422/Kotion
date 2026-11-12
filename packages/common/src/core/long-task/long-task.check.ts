/**
 * Long-task toolkit check (pure Node, no React, no host).
 *
 * The SDK's whole point is that a plugin can adopt it without feature detection:
 * `runLongTask` must work when the host has `task.*`, and degrade to a local
 * no-op when it does not. These cases pin both paths — including cancellation
 * mapping (`cancel-request` → `AbortSignal`), the batch/flush contract, the
 * heartbeat timer (`task.touch`), result passthrough and the new read-side
 * helpers.
 *
 * The second half drives the `createInMemoryTaskBridge()` testing bridge and the
 * agent tools directly, exactly the way a plugin author (and the agent runtime)
 * would: start → report → logs → finish, with events and an injected clock.
 *
 * Run:
 *   tsc --noEmitOnError src/core/long-task/long-task.check.ts --rootDir src \
 *     --outDir .tmp-check/long-tasks --module commonjs --target ES2020 \
 *     --lib ES2020,DOM --skipLibCheck
 *   node .tmp-check/long-tasks/core/long-task/long-task.check.js
 */
import {
    cancelLongTask,
    getLongTask,
    listLongTasks,
    onLongTaskEvent,
    runLongTask,
    startLongTask,
    DEFAULT_LONG_TASK_HEARTBEAT_MS,
} from './index'
import { createInMemoryTaskBridge } from './testing'
import { createLongTaskTools } from '../../ai/tools/long-task-tools'
import type { DesktopBridge } from '../desktop/bridge'
import type {
    DesktopTaskCancelOptions,
    DesktopTaskEvent,
    DesktopTaskFinishOptions,
    DesktopTaskGetOptions,
    DesktopTaskLogsSinceOptions,
    DesktopTaskRemoveOptions,
    DesktopTaskRemoveResult,
    DesktopTaskReportOptions,
    DesktopTaskSnapshot,
    DesktopTaskStartOptions,
    DesktopTaskTouchOptions,
    TaskBridge,
} from '../desktop/tasks'

const results: Array<{ name: string; ok: boolean; detail?: string }> = []
const check = (name: string, condition: boolean, detail = ''): void => {
    results.push({ name, ok: condition, detail })
    // eslint-disable-next-line no-console
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const snapshotOf = (overrides: Partial<DesktopTaskSnapshot> = {}): DesktopTaskSnapshot => ({
    id: 'task_test',
    sessionId: 'run_test',
    kind: 'plugin',
    title: 'test task',
    state: 'running',
    progress: {},
    createdAt: 1,
    updatedAt: 1,
    seq: 0,
    total: 0,
    lastHeartbeatAt: 1,
    ...overrides,
})

interface FakeTasks {
    bridge: TaskBridge
    calls: {
        start: DesktopTaskStartOptions[]
        report: DesktopTaskReportOptions[]
        finish: DesktopTaskFinishOptions[]
        logsSince: DesktopTaskLogsSinceOptions[]
        get: DesktopTaskGetOptions[]
        touch: DesktopTaskTouchOptions[]
        remove: DesktopTaskRemoveOptions[]
    }
    reportError: boolean
    touchError: boolean
    emit: (event: DesktopTaskEvent) => void
}

const createFakeTasks = (): FakeTasks => {
    const listeners = new Set<(event: DesktopTaskEvent) => void>()
    const calls: FakeTasks['calls'] = {
        start: [],
        report: [],
        finish: [],
        logsSince: [],
        get: [],
        touch: [],
        remove: [],
    }
    let current = snapshotOf()
    const fake: FakeTasks = {
        calls,
        reportError: false,
        touchError: false,
        emit: (event) => {
            for (const listener of listeners) listener(event)
        },
        bridge: {
            start: async (options) => {
                calls.start.push(options)
                current = snapshotOf({
                    id: options.id ?? 'task_test',
                    sessionId: 'run_test',
                    kind: options.kind ?? 'plugin',
                    title: options.title,
                    ...(options.root === undefined ? {} : { root: options.root }),
                    progress: options.progress ?? {},
                    ...(options.heartbeatMs === undefined ? {} : { heartbeatMs: options.heartbeatMs }),
                })
                return current
            },
            report: async (options) => {
                calls.report.push(options)
                if (fake.reportError) throw new Error('host went away')
                const added = options.logs?.length ?? 0
                current = snapshotOf({
                    ...current,
                    progress: { ...current.progress, ...(options.progress ?? {}) },
                    seq: current.seq + added,
                    total: current.total + added,
                    updatedAt: current.updatedAt + 1,
                })
                return { task: current, added }
            },
            logsSince: async (options) => {
                calls.logsSince.push(options)
                return {
                    taskId: options.taskId,
                    sessionId: current.sessionId,
                    entries: [],
                    nextSeq: options.sinceSeq ?? 0,
                    dropped: 0,
                    total: 0,
                }
            },
            list: async () => [current],
            get: async (options) => {
                calls.get.push(options)
                return current.id === options.taskId ? current : null
            },
            touch: async (options) => {
                calls.touch.push(options)
                if (fake.touchError) throw new Error('heartbeat refused')
                current = snapshotOf({ ...current, lastHeartbeatAt: Date.now() })
                return current
            },
            remove: async (options): Promise<DesktopTaskRemoveResult> => {
                calls.remove.push(options)
                return { taskId: options.taskId, removed: false }
            },
            finish: async (options) => {
                calls.finish.push(options)
                current = snapshotOf({
                    ...current,
                    state: options.state ?? 'succeeded',
                    ...(options.result === undefined ? {} : { result: options.result }),
                })
                return current
            },
            cancel: async (_options: DesktopTaskCancelOptions) => ({
                taskId: current.id,
                sessionId: current.sessionId,
                state: 'cancelling',
                cancelRequested: true,
            }),
            onEvent: (listener) => {
                listeners.add(listener)
                return () => listeners.delete(listener)
            },
        },
    }
    return fake
}

const bridgeWith = (tasks: TaskBridge | undefined): DesktopBridge =>
    ({
        version: 'test',
        platform: 'desktop',
        capabilities: [],
        has: () => true,
        invoke: async () => undefined,
        onFullScreenChange: () => () => {},
        on: () => () => {},
        ...(tasks ? { tasks } : {}),
    }) as unknown as DesktopBridge

const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const resultCount = (snapshot: DesktopTaskSnapshot | null | undefined): number | undefined =>
    (snapshot?.result as { count?: number } | undefined)?.count

const main = async (): Promise<void> => {
    /* ---------------- local fallback (no task.* on the host) ---------------- */
    const local = await startLongTask(undefined, { title: 'offline' })
    check('local: reports itself unavailable', local.available === false && local.snapshot === null)
    check('local: has an id and a non-aborted signal', Boolean(local.id) && !local.signal.aborted)
    local.progress({ percent: 50 })
    local.log('error', 'lost')
    await local.flush()
    check('local: calls are harmless no-ops', true)
    const localPage = await local.logsSince({ sinceSeq: 7 })
    check(
        'local: logsSince is an empty page, not a throw',
        localPage.entries.length === 0 && localPage.nextSeq === 7 && localPage.sessionId === null,
        JSON.stringify(localPage),
    )
    check('local: finish returns null', (await local.finish('succeeded')) === null)

    /* ---------------- read-side helpers degrade without a host ---------------- */
    check('helper: list without host → []', (await listLongTasks(undefined)).length === 0)
    check('helper: list with null bridge → []', (await listLongTasks(null)).length === 0)
    check('helper: get without host → null', (await getLongTask(undefined, 'anything')) === null)
    check('helper: get with null bridge → null', (await getLongTask(null, 'anything')) === null)
    check('helper: cancel without host → null', (await cancelLongTask(undefined, 'anything')) === null)
    let offlineEventFired = false
    const offlineUnsubscribe = onLongTaskEvent(null, () => {
        offlineEventFired = true
    })
    offlineUnsubscribe()
    offlineUnsubscribe()
    check('helper: onEvent without host is a safe noop', !offlineEventFired && typeof offlineUnsubscribe === 'function')

    const helperFake = createFakeTasks()
    let helperListenerCount = 0
    helperFake.bridge.onEvent = (_listener) => {
        helperListenerCount += 1
        return () => {
            helperListenerCount -= 1
        }
    }
    const helperUnsubscribe = onLongTaskEvent(bridgeWith(helperFake.bridge), () => {})
    check('helper: onEvent forwards to the host bridge', helperListenerCount === 1)
    helperUnsubscribe()
    check('helper: onEvent unsubscribe reaches the host', helperListenerCount === 0)

    /* ---------------- registered task ---------------- */
    const defaultBeatFake = createFakeTasks()
    const defaultBeatTask = await startLongTask(bridgeWith(defaultBeatFake.bridge), {
        title: '默认心跳',
        heartbeatMs: undefined,
    })
    check(
        'start: declares the default heartbeat (30s)',
        defaultBeatFake.calls.start[0]?.heartbeatMs === DEFAULT_LONG_TASK_HEARTBEAT_MS,
        String(defaultBeatFake.calls.start[0]?.heartbeatMs),
    )
    await defaultBeatTask.finish()

    const fake = createFakeTasks()
    const bridge = bridgeWith(fake.bridge)
    const task = await startLongTask(bridge, {
        id: 'my-plugin:sync:42',
        kind: 'sync',
        title: '同步空间',
        flushIntervalMs: 100,
        // No liveness timer in this case: the interval would outlive the test
        // assertions (the heartbeat itself has its own cases below).
        heartbeatMs: 0,
    })
    check(
        'start: forwards the registration and reports availability',
        task.available === true &&
            task.id === 'my-plugin:sync:42' &&
            task.sessionId === 'run_test' &&
            fake.calls.start[0]?.title === '同步空间' &&
            fake.calls.start[0]?.kind === 'sync',
        JSON.stringify(fake.calls.start[0]),
    )
    task.progress({ percent: 20, message: '拉取列表' })
    await tick()
    check(
        'progress: goes to the host immediately and updates the snapshot',
        fake.calls.report.some((call) => call.progress?.percent === 20) &&
            task.snapshot?.progress.message === '拉取列表',
        JSON.stringify(task.snapshot?.progress),
    )

    task.info('first')
    task.warn('second')
    task.error('third')
    await task.flush()
    const batched = fake.calls.report.filter((call) => call.logs?.length)
    check(
        'log: lines are batched into one report with their levels',
        batched.length === 1 &&
            batched[0].logs?.length === 3 &&
            JSON.stringify(batched[0].logs) ===
                JSON.stringify([
                    { level: 'info', message: 'first' },
                    { level: 'warn', message: 'second' },
                    { level: 'error', message: 'third' },
                ]),
        JSON.stringify(batched[0]?.logs),
    )
    check('log: snapshot reflects the added lines', task.snapshot?.seq === 3, String(task.snapshot?.seq))

    const page = await task.logsSince({ sinceSeq: 2, limit: 5 })
    check(
        'logsSince: forwards the cursor and limit',
        fake.calls.logsSince[0]?.sinceSeq === 2 &&
            fake.calls.logsSince[0]?.limit === 5 &&
            page.taskId === 'my-plugin:sync:42',
        JSON.stringify(fake.calls.logsSince[0]),
    )

    /* Finish flushes queued lines first. */
    task.log('info', 'last words')
    const finished = await task.finish('succeeded', '完成')
    check(
        'finish: flushes the queue then reports succeeded with the final message',
        fake.calls.finish.length === 1 &&
            fake.calls.finish[0].state === 'succeeded' &&
            fake.calls.finish[0].message === '完成' &&
            fake.calls.report.some((call) => call.logs?.some((line) => JSON.stringify(line).includes('last words'))),
        JSON.stringify(fake.calls.finish[0]),
    )
    check('finish: returns the terminal snapshot', finished?.state === 'succeeded')
    task.log('info', 'after finish')
    await task.flush()
    check(
        'finish: later logs are ignored',
        !fake.calls.report.some((call) => call.logs?.some((line) => JSON.stringify(line).includes('after finish'))),
    )

    /* Finish must drain every queued batch, not just the first 200 lines. */
    const manyFake = createFakeTasks()
    const manyTask = await startLongTask(bridgeWith(manyFake.bridge), {
        title: '大量收尾日志',
        flushIntervalMs: 5_000,
    })
    for (let index = 0; index < 250; index += 1) manyTask.log('info', `n${index}`)
    await manyTask.finish('succeeded')
    const drained = manyFake.calls.report
        .flatMap((call) => call.logs ?? [])
        .filter((line): line is { message: string } => typeof line === 'object' && line !== null)
        .filter((line) => line.message.startsWith('n'))
    check(
        'finish: drains more than one log batch (250 lines)',
        drained.length === 250 && drained[drained.length - 1].message === 'n249',
        `${drained.length} lines`,
    )

    /* ---------------- finish detail: result passthrough ---------------- */
    const detailFake = createFakeTasks()
    const detailTask = await startLongTask(bridgeWith(detailFake.bridge), { title: 'detail' })
    await detailTask.finish('succeeded', { message: 'ok', result: { id: 'artifact-1' } })
    check(
        'finish: detail.result is forwarded to the host',
        detailFake.calls.finish[0]?.message === 'ok' &&
            JSON.stringify(detailFake.calls.finish[0]?.result) === '{"id":"artifact-1"}',
        JSON.stringify(detailFake.calls.finish[0]),
    )
    await detailTask.finish('succeeded', { result: { id: 'ignored' } })
    check(
        'finish: a second finish does not reach the host again',
        detailFake.calls.finish.length === 1,
        String(detailFake.calls.finish.length),
    )

    /* ---------------- heartbeat timer ---------------- */
    const beatFake = createFakeTasks()
    const beatTask = await startLongTask(bridgeWith(beatFake.bridge), {
        title: '有心跳',
        heartbeatMs: 15,
        flushIntervalMs: 0,
    })
    await tick(60)
    const beatsWhileRunning = beatFake.calls.touch.length
    check(
        'heartbeat: forwards the interval and touches the host while running',
        beatFake.calls.start[0]?.heartbeatMs === 15 && beatsWhileRunning >= 2,
        `${beatsWhileRunning} beats`,
    )
    await beatTask.finish('succeeded')
    await tick(40)
    check(
        'heartbeat: finish stops the timer (no touch after the terminal call)',
        beatFake.calls.touch.length === beatsWhileRunning,
        `${beatFake.calls.touch.length} total`,
    )

    const noBeatFake = createFakeTasks()
    const noBeatTask = await startLongTask(bridgeWith(noBeatFake.bridge), {
        title: '无心跳',
        heartbeatMs: 0,
    })
    await tick(30)
    check(
        'heartbeat: heartbeatMs: 0 disables both the field and the timer',
        noBeatFake.calls.start[0]?.heartbeatMs === undefined && noBeatFake.calls.touch.length === 0,
        JSON.stringify(noBeatFake.calls.start[0]),
    )
    await noBeatTask.finish()

    const noTouchFake = createFakeTasks()
    const noTouchBridge = { ...noTouchFake.bridge } as Record<string, unknown>
    delete noTouchBridge.touch
    const noTouchTask = await startLongTask(bridgeWith(noTouchBridge as unknown as TaskBridge), {
        title: '旧宿主',
        heartbeatMs: 10,
    })
    await tick(30)
    check('heartbeat: an older host without task.touch is detected and skipped', noTouchTask.available === true)
    await noTouchTask.finish()

    const brokenBeatFake = createFakeTasks()
    brokenBeatFake.touchError = true
    const brokenBeatTask = await startLongTask(bridgeWith(brokenBeatFake.bridge), {
        title: '心跳失败',
        heartbeatMs: 10,
    })
    await tick(30)
    check(
        'heartbeat: touch failures are swallowed (work keeps running)',
        brokenBeatTask.snapshot !== null && brokenBeatFake.calls.touch.length >= 1,
    )
    await brokenBeatTask.finish()

    /* ---------------- cancellation maps to AbortSignal ---------------- */
    const cancelFake = createFakeTasks()
    const cancelTask = await startLongTask(bridgeWith(cancelFake.bridge), {
        title: '可取消',
        flushIntervalMs: 0,
        heartbeatMs: 0,
    })
    let aborted = false
    cancelTask.signal.addEventListener('abort', () => {
        aborted = true
    })
    cancelFake.emit({
        type: 'cancel-request',
        task: snapshotOf({ state: 'cancelling' }),
    })
    check('cancel: a cancel-request aborts the signal', aborted && cancelTask.signal.aborted)
    await cancelTask.finish('cancelled')
    cancelFake.emit({ type: 'cancel-request', task: snapshotOf({ state: 'cancelling' }) })
    check('cancel: a finished task cannot be aborted again', aborted && cancelTask.signal.aborted)

    /* ---------------- runLongTask success / failure / cancel ---------------- */
    const runFake = createFakeTasks()
    const runResult = await runLongTask(bridgeWith(runFake.bridge), { title: 'run ok' }, async (handle) => {
        handle.log('info', 'working')
        return { value: 'value' }
    })
    check(
        'runLongTask: returns the body result and stores it on the task',
        JSON.stringify(runResult) === '{"value":"value"}' &&
            runFake.calls.finish[0]?.state === 'succeeded' &&
            JSON.stringify(runFake.calls.finish[0]?.result) === '{"value":"value"}',
        JSON.stringify(runFake.calls.finish[0]),
    )

    const plainFake = createFakeTasks()
    const plainResult = await runLongTask(bridgeWith(plainFake.bridge), { title: 'run undefined' }, async () => undefined)
    check(
        'runLongTask: an undefined body result stores no result at all',
        plainResult === undefined &&
            plainFake.calls.finish.length === 1 &&
            !('result' in plainFake.calls.finish[0]),
        JSON.stringify(plainFake.calls.finish[0]),
    )

    const failFake = createFakeTasks()
    let thrown = ''
    try {
        await runLongTask(bridgeWith(failFake.bridge), { title: 'run fail' }, async () => {
            throw new Error('disk full')
        })
    } catch (error) {
        thrown = (error as Error).message
    }
    check(
        'runLongTask: failures finish the task as failed and rethrow',
        thrown === 'disk full' &&
            failFake.calls.finish[0]?.state === 'failed' &&
            failFake.calls.finish[0]?.error === 'disk full',
        JSON.stringify(failFake.calls.finish[0]),
    )

    const abortFake = createFakeTasks()
    let abortThrown = ''
    try {
        await runLongTask(bridgeWith(abortFake.bridge), { title: 'run cancel' }, async (handle) => {
            abortFake.emit({
                type: 'cancel-request',
                task: snapshotOf({ state: 'cancelling' }),
            })
            await tick()
            if (handle.signal.aborted) throw new Error('cancelled by user')
            return 'should not happen'
        })
    } catch (error) {
        abortThrown = (error as Error).message
    }
    check(
        'runLongTask: a host cancel becomes AbortSignal + finish(cancelled)',
        abortThrown === 'cancelled by user' && abortFake.calls.finish[0]?.state === 'cancelled',
        JSON.stringify(abortFake.calls.finish[0]),
    )

    /* ---------------- host failures never break the work ---------------- */
    const brokenFake = createFakeTasks()
    brokenFake.reportError = true
    const brokenTask = await startLongTask(bridgeWith(brokenFake.bridge), {
        title: 'broken host',
        flushIntervalMs: 0,
        heartbeatMs: 0,
    })
    brokenTask.progress({ percent: 1 })
    brokenTask.log('error', 'lost line')
    await brokenTask.flush()
    await tick()
    brokenFake.bridge.logsSince = async () => {
        throw new Error('gone')
    }
    const fallbackPage = await brokenTask.logsSince({ sinceSeq: 3 })
    check(
        'degradation: report failures neither throw nor stop the task',
        fallbackPage.entries.length === 0 &&
            fallbackPage.nextSeq === 3 &&
            (await brokenTask.finish('succeeded')) !== null,
        JSON.stringify(fallbackPage),
    )

    /* ================================================================ *
     * createInMemoryTaskBridge — the public testing bridge
     * ================================================================ */
    const clock = { value: 1_000 }
    const host = createInMemoryTaskBridge({ now: () => clock.value })
    const events: DesktopTaskEvent[] = []
    const unsubscribe = host.bridge.onEvent((event) => events.push(event))

    const started = await host.bridge.start({ id: 'p:one', kind: 'sync', title: '扫描' })
    check(
        'memory: start registers a running task with a session and a liveness clock',
        started.state === 'running' &&
            started.kind === 'sync' &&
            Boolean(started.sessionId) &&
            started.seq === 0 &&
            started.lastHeartbeatAt === clock.value,
        JSON.stringify(started),
    )
    check(
        'memory: start emits started and tasks() lists the snapshot',
        events[0]?.type === 'started' &&
            events[0]?.task.id === 'p:one' &&
            host.tasks().length === 1 &&
            host.tasks()[0].id === 'p:one',
    )
    check(
        'memory: get returns the task; an unknown id is null',
        (await host.bridge.get({ taskId: 'p:one' }))?.id === 'p:one' &&
            (await host.bridge.get({ taskId: 'nope' })) === null,
    )

    const reported = await host.bridge.report({
        taskId: 'p:one',
        progress: { percent: 140, message: '拉取' },
        logs: [{ level: 'warn', message: 'w' }, 'i'],
    })
    const logEvent = events.find((event) => event.type === 'log')
    check(
        'memory: report merges progress (clamped) and appends lines',
        reported.task.progress.percent === 100 &&
            reported.task.progress.message === '拉取' &&
            reported.added === 2 &&
            reported.task.seq === 2 &&
            reported.task.total === 2,
        JSON.stringify(reported.task.progress),
    )
    check(
        'memory: the log event carries the retained lines',
        logEvent?.lines?.length === 2 && logEvent.lines?.[1]?.seq === 2,
        JSON.stringify(logEvent?.lines),
    )

    const incremental = await host.bridge.logsSince({ taskId: 'p:one', sinceSeq: 1 })
    const limited = await host.bridge.logsSince({ taskId: 'p:one', sinceSeq: 0, limit: 1 })
    const missingPage = await host.bridge.logsSince({ taskId: 'nope' })
    check(
        'memory: logsSince is incremental by seq',
        incremental.entries.length === 1 &&
            incremental.entries[0].seq === 2 &&
            incremental.nextSeq === 2 &&
            incremental.sessionId === started.sessionId,
        JSON.stringify(incremental),
    )
    check(
        'memory: logsSince truncates to the newest limit and reports dropped',
        limited.entries.length === 1 &&
            limited.entries[0].seq === 2 &&
            limited.dropped === 1 &&
            limited.nextSeq === 2,
        JSON.stringify(limited),
    )
    check(
        'memory: logsSince of an unknown task is an empty page, not a throw',
        missingPage.sessionId === null && missingPage.entries.length === 0 && missingPage.nextSeq === 0,
        JSON.stringify(missingPage),
    )

    clock.value = 2_000
    const eventsBeforeTouch = events.length
    const touched = await host.bridge.touch({ taskId: 'p:one' })
    check(
        'memory: touch refreshes the liveness clock without emitting an event',
        touched.lastHeartbeatAt === 2_000 && touched.updatedAt === 2_000 && events.length === eventsBeforeTouch,
        `${eventsBeforeTouch} → ${events.length}`,
    )

    clock.value = 3_000
    const hostFinished = await host.bridge.finish({
        taskId: 'p:one',
        state: 'succeeded',
        message: '完成',
        result: { count: 3 },
    })
    const hostFinishedAgain = await host.bridge.finish({
        taskId: 'p:one',
        state: 'failed',
        result: { count: 99 },
    })
    check(
        'memory: finish stores the result and is idempotent',
        hostFinished.state === 'succeeded' &&
            resultCount(hostFinished) === 3 &&
            hostFinished.progress.message === '完成' &&
            hostFinishedAgain.state === 'succeeded' &&
            resultCount(hostFinishedAgain) === 3 &&
            events.filter((event) => event.type === 'finished').length === 1,
        JSON.stringify(hostFinished),
    )
    ;(hostFinished.result as { count: number }).count = 42
    check(
        'memory: result is copied on read (IPC-like)',
        resultCount(await host.bridge.get({ taskId: 'p:one' })) === 3,
    )

    let unknownFinishThrew = false
    try {
        await host.bridge.finish({ taskId: 'ghost' })
    } catch {
        unknownFinishThrew = true
    }
    let unknownTouchThrew = false
    try {
        await host.bridge.touch({ taskId: 'ghost' })
    } catch {
        unknownTouchThrew = true
    }
    check(
        'memory: finish/touch on an unknown id throw (host TASK_NOT_FOUND)',
        unknownFinishThrew && unknownTouchThrew,
    )

    const removeHost = createInMemoryTaskBridge()
    await removeHost.bridge.start({ id: 'p:remove', title: '删除' })
    let runningRemoveThrew = false
    try {
        await removeHost.bridge.remove({ taskId: 'p:remove' })
    } catch {
        runningRemoveThrew = true
    }
    await removeHost.bridge.finish({ taskId: 'p:remove' })
    const removed = await removeHost.bridge.remove({ taskId: 'p:remove' })
    const removedAgain = await removeHost.bridge.remove({ taskId: 'p:remove' })
    check(
        'memory: remove refuses running tasks and forgets finished ones',
        runningRemoveThrew &&
            removed.removed &&
            !removedAgain.removed &&
            (await removeHost.bridge.get({ taskId: 'p:remove' })) === null,
        JSON.stringify({ runningRemoveThrew, removed: removed.removed, again: removedAgain.removed }),
    )

    /* Same id after a finished run opens a new run; a running one is refused. */
    const rerun = await host.bridge.start({ id: 'p:one', title: '再跑一次' })
    let runningStartThrew = false
    try {
        await host.bridge.start({ id: 'p:one', title: '撞车' })
    } catch {
        runningStartThrew = true
    }
    check(
        'memory: reusing a finished id opens a new run; a running id is refused',
        rerun.sessionId !== started.sessionId &&
            rerun.seq === 0 &&
            rerun.total === 0 &&
            rerun.state === 'running' &&
            runningStartThrew,
        `${started.sessionId} → ${rerun.sessionId}`,
    )

    /* Ring: 1000 retained lines, monotonic seq, dropped counts the eviction. */
    const ringHost = createInMemoryTaskBridge()
    await ringHost.bridge.start({ id: 'p:ring', title: 'ring' })
    for (let index = 0; index < 1_005; index += 1) {
        await ringHost.bridge.report({ taskId: 'p:ring', logs: [{ message: `line-${index}` }] })
    }
    const ringSnapshot = await ringHost.bridge.get({ taskId: 'p:ring' })
    const ringPage = await ringHost.bridge.logsSince({ taskId: 'p:ring', sinceSeq: 0, limit: 1_000 })
    check(
        'memory: the log ring keeps 1000 lines while seq stays monotonic',
        ringSnapshot?.total === 1_000 &&
            ringSnapshot?.seq === 1_005 &&
            ringPage.dropped === 5 &&
            ringPage.entries[0]?.seq === 6 &&
            ringPage.nextSeq === 1_005,
        JSON.stringify({ total: ringSnapshot?.total, seq: ringSnapshot?.seq, dropped: ringPage.dropped }),
    )

    /* Cancel. */
    const cancelHost = createInMemoryTaskBridge()
    const cancelEvents: DesktopTaskEvent[] = []
    cancelHost.bridge.onEvent((event) => cancelEvents.push(event))
    await cancelHost.bridge.start({ id: 'p:cancel', title: '取消' })
    const cancelRequested = await cancelHost.bridge.cancel({ taskId: 'p:cancel' })
    const cancelRepeated = await cancelHost.bridge.cancel({ taskId: 'p:cancel' })
    const cancelTerminal = await cancelHost.bridge.finish({ taskId: 'p:cancel', state: 'cancelled' })
    const cancelAfterFinish = await cancelHost.bridge.cancel({ taskId: 'p:cancel' })
    check(
        'memory: cancel → cancelling, one broadcast, terminal cancel reports false',
        cancelRequested.state === 'cancelling' &&
            cancelRequested.cancelRequested &&
            cancelRepeated.cancelRequested &&
            cancelEvents.filter((event) => event.type === 'cancel-request').length === 1 &&
            cancelTerminal.state === 'cancelled' &&
            cancelAfterFinish.cancelRequested === false &&
            cancelAfterFinish.state === 'cancelled',
        JSON.stringify(cancelRequested),
    )

    /* Heartbeat field round-trip. */
    clock.value = 10_000
    const heartbeatHost = createInMemoryTaskBridge({ now: () => clock.value })
    const beatSnapshot = await heartbeatHost.bridge.start({ id: 'p:hb', title: 'hb', heartbeatMs: 5_000 })
    clock.value = 10_500
    const beatTouched = await heartbeatHost.bridge.touch({ taskId: 'p:hb' })
    check(
        'memory: heartbeatMs is stored and touch advances lastHeartbeatAt',
        beatSnapshot.heartbeatMs === 5_000 && beatTouched.lastHeartbeatAt === 10_500,
        JSON.stringify({ heartbeatMs: beatSnapshot.heartbeatMs, at: beatTouched.lastHeartbeatAt }),
    )
    heartbeatHost.dispose()
    check(
        'memory: dispose drops every task and listener',
        heartbeatHost.tasks().length === 0 && (await heartbeatHost.bridge.list()).length === 0,
    )
    unsubscribe()

    /* Result validation mirrors the host (JSON-serializable, 16KB cap). */
    const resultHost = createInMemoryTaskBridge()
    await resultHost.bridge.start({ id: 'p:result', title: 'result' })
    const circular: Record<string, unknown> = {}
    circular.self = circular
    let invalidResult = ''
    try {
        await resultHost.bridge.finish({ taskId: 'p:result', result: circular })
    } catch (error) {
        invalidResult = (error as Error).message
    }
    let hugeResult = ''
    try {
        await resultHost.bridge.finish({ taskId: 'p:result', result: { text: 'x'.repeat(20 * 1024) } })
    } catch (error) {
        hugeResult = (error as Error).message
    }
    check(
        'memory: finish rejects a non-serializable / oversized result like the host',
        invalidResult.includes('TASK_RESULT_INVALID') && hugeResult.includes('TASK_RESULT_TOO_LARGE'),
        JSON.stringify({ invalidResult, hugeResult }),
    )

    /* ================================================================ *
     * Agent tools — driven directly with an in-memory bridge
     * ================================================================ */
    const toolHost = createInMemoryTaskBridge()
    const tools = createLongTaskTools({ getBridge: () => toolHost.bridge })
    const toolStarted = await toolHost.bridge.start({
        id: 'p:tools',
        kind: 'import',
        title: '批量导入',
        root: '/tmp/project',
    })
    await toolHost.bridge.report({
        taskId: 'p:tools',
        progress: { percent: 40, message: '导入中' },
        logs: [
            { level: 'info', message: 'started' },
            { level: 'warn', message: 'Slow Page' },
            { level: 'error', message: 'row 3 failed' },
        ],
    })

    const listed = await tools.listLongTasks.execute({ state: 'running' })
    const listedByRoot = await tools.listLongTasks.execute({ root: '/tmp/project' })
    const listedEmpty = await tools.listLongTasks.execute({ kind: 'other' })
    check(
        'tools: listLongTasks summarizes the host tasks',
        listed.count === 1 &&
            listed.tasks[0].taskId === 'p:tools' &&
            listed.tasks[0].kind === 'import' &&
            listed.tasks[0].title === '批量导入' &&
            listed.tasks[0].progress.percent === 40 &&
            listed.tasks[0].hasResult === false &&
            listedByRoot.count === 1 &&
            listedEmpty.count === 0,
        JSON.stringify(listed),
    )

    const peek = await tools.getLongTask.execute({ taskId: 'p:tools', wait: false })
    check(
        'tools: getLongTask peek returns the running task',
        peek.timedOut === false && peek.task.state === 'running' && peek.task.taskId === 'p:tools',
        JSON.stringify(peek),
    )

    const timedOut = await tools.getLongTask.execute({ taskId: 'p:tools', timeoutMs: 25 })
    check(
        'tools: getLongTask timeout is a result (timedOut: true), not an error',
        timedOut.timedOut === true && timedOut.task?.state === 'running' && timedOut.error === undefined,
        JSON.stringify(timedOut.task),
    )

    const logsPage = await tools.getLongTaskLogs.execute({ taskId: 'p:tools' })
    const logsSince = await tools.getLongTaskLogs.execute({ taskId: 'p:tools', sinceSeq: 2 })
    const logsWarn = await tools.getLongTaskLogs.execute({ taskId: 'p:tools', level: 'warn' })
    const logsGrep = await tools.getLongTaskLogs.execute({ taskId: 'p:tools', grep: 'ROW 3' })
    const logsLimit = await tools.getLongTaskLogs.execute({ taskId: 'p:tools', limit: 2 })
    check(
        'tools: getLongTaskLogs returns a page with a polling cursor',
        logsPage.lines.length === 3 &&
            logsPage.nextSeq === 3 &&
            logsPage.sessionId === toolStarted.sessionId &&
            logsPage.hint.includes('nextSeq=3'),
        JSON.stringify(logsPage),
    )
    check(
        'tools: getLongTaskLogs honors sinceSeq and filters by level/grep',
        logsSince.lines.length === 1 &&
            logsSince.lines[0].seq === 3 &&
            logsWarn.lines.length === 1 &&
            logsWarn.lines[0].message === 'Slow Page' &&
            logsGrep.lines.length === 1 &&
            logsGrep.lines[0].seq === 3,
        JSON.stringify({ since: logsSince.lines.length, warn: logsWarn.lines.length, grep: logsGrep.lines.length }),
    )
    check(
        'tools: getLongTaskLogs caps the page at the requested limit and reports dropped',
        logsLimit.lines.length === 2 && logsLimit.lines[1].seq === 3 && logsLimit.dropped === 1,
        JSON.stringify(logsLimit),
    )

    const waiting = tools.getLongTask.execute({ taskId: 'p:tools', timeoutMs: 1_000 })
    await tick(10)
    await toolHost.bridge.finish({ taskId: 'p:tools', result: { rows: 42 } })
    const completed = await waiting
    check(
        'tools: getLongTask waits for the terminal event and returns the result',
        completed.timedOut === false &&
            completed.task.state === 'succeeded' &&
            (completed.task.result as { rows?: number } | undefined)?.rows === 42,
        JSON.stringify(completed.task),
    )

    await toolHost.bridge.start({ id: 'p:cancel-tool', title: '取消我' })
    const cancelToolResult = await tools.cancelLongTask.execute({ taskId: 'p:cancel-tool' })
    const cancelTerminalResult = await tools.cancelLongTask.execute({ taskId: 'p:tools' })
    check(
        'tools: cancelLongTask reports the cooperative cancel contract',
        cancelToolResult.ok === true &&
            cancelToolResult.state === 'cancelling' &&
            cancelToolResult.cancelRequested === true &&
            cancelToolResult.note === '取消是协作式的，宿主不会杀进程；任务可能继续到插件自己停止' &&
            cancelTerminalResult.ok === false &&
            cancelTerminalResult.state === 'succeeded',
        JSON.stringify(cancelToolResult),
    )

    const unknownGet = await tools.getLongTask.execute({ taskId: 'nope' })
    const unknownLogs = await tools.getLongTaskLogs.execute({ taskId: 'nope' })
    const unknownCancel = await tools.cancelLongTask.execute({ taskId: 'nope' })
    check(
        'tools: unknown taskIds produce explicit errors',
        typeof unknownGet.error === 'string' &&
            unknownGet.error.includes('nope') &&
            typeof unknownLogs.error === 'string' &&
            typeof unknownCancel.error === 'string',
        JSON.stringify({ get: unknownGet.error, logs: unknownLogs.error, cancel: unknownCancel.error }),
    )

    /* Result clipping in the listing (the model gets ~800 chars). */
    const bigHost = createInMemoryTaskBridge()
    await bigHost.bridge.start({ id: 'p:big', title: 'big' })
    await bigHost.bridge.finish({ taskId: 'p:big', result: { text: 'x'.repeat(2_000) } })
    const bigTools = createLongTaskTools({ getBridge: () => bigHost.bridge })
    const bigList = await bigTools.listLongTasks.execute({})
    check(
        'tools: listLongTasks truncates a huge result to ~800 chars',
        bigList.tasks[0].hasResult === true &&
            bigList.tasks[0].resultTruncated === true &&
            String(bigList.tasks[0].result).length <= 801,
        `${String(bigList.tasks[0].result).length} chars`,
    )

    /* Missing host: one stable error sentence per tool. */
    const offlineTools = createLongTaskTools({ getBridge: () => undefined })
    const offlineResults = await Promise.all([
        offlineTools.listLongTasks.execute({}),
        offlineTools.getLongTask.execute({ taskId: 'x' }),
        offlineTools.getLongTaskLogs.execute({ taskId: 'x' }),
        offlineTools.cancelLongTask.execute({ taskId: 'x' }),
    ])
    check(
        'tools: a missing host yields the same stable unsupported error',
        offlineResults.every((value) => value.error === '当前宿主不支持插件长任务（desktop.tasks 不可用）'),
        JSON.stringify(offlineResults),
    )
    const defaultTools = createLongTaskTools()
    const defaultList = await defaultTools.listLongTasks.execute({})
    check(
        'tools: the default factory degrades when no desktop service is registered',
        defaultList.error === '当前宿主不支持插件长任务（desktop.tasks 不可用）',
        JSON.stringify(defaultList),
    )

    const failed = results.filter((entry) => !entry.ok)
    // eslint-disable-next-line no-console
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
    process.exit(failed.length ? 1 : 0)
}

void main()