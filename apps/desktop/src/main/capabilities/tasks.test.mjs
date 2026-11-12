/**
 * Generic long-task registry test (plain Node, no Electron).
 *
 * Guards the `task.*` host contract: monotonic log seq, ring eviction / limit
 * truncation reported as `dropped`, consecutive-duplicate suppression, progress
 * merging, cooperative cancellation, owner loss, capacity and the
 * caller-stable-id restart semantics.
 *
 * Run: node apps/desktop/src/main/capabilities/tasks.test.mjs
 */
import {
    MAX_TASK_LOG_ENTRIES,
    MAX_TASK_RESULT_BYTES,
    MAX_TASKS,
    createTaskRegistry,
} from './tasks.mjs'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

let clock = 1_000_000
const events = []
const registry = createTaskRegistry({ now: () => clock, onEvent: (event) => events.push(event) })

const throws = (fn) => {
    try {
        fn()
        return null
    } catch (error) {
        return error.message
    }
}

/* ------------------------------------------------------------------ *
 * start / progress
 * ------------------------------------------------------------------ */
const started = registry.start({ title: '同步空间', kind: 'sync', root: '/tmp/space', owner: 7 })
check(
    'start: snapshot has id, run session and running state',
    typeof started.id === 'string' &&
        started.id.startsWith('task_') &&
        typeof started.sessionId === 'string' &&
        started.sessionId.startsWith('run_') &&
        started.state === 'running' &&
        started.kind === 'sync' &&
        started.root === '/tmp/space' &&
        started.seq === 0 &&
        started.total === 0,
    JSON.stringify(started),
)
check('start: emits a started event', events.filter((event) => event.type === 'started').length === 1)

clock += 10
const progressed = registry.report({
    taskId: started.id,
    progress: { percent: 12.5, current: 1, total: 8, message: '拉取列表' },
})
check(
    'report: progress fields merge and are normalized',
    progressed.task.progress.percent === 12.5 &&
        progressed.task.progress.current === 1 &&
        progressed.task.progress.total === 8 &&
        progressed.task.progress.message === '拉取列表' &&
        typeof progressed.task.updatedAt === 'number',
    JSON.stringify(progressed.task.progress),
)
check('report: progress emits one progress event', events.filter((event) => event.type === 'progress').length === 1)

clock += 10
const clamped = registry.report({ taskId: started.id, progress: { percent: 250, current: 3 } })
check(
    'report: percent is clamped and absent fields are kept',
    clamped.task.progress.percent === 100 &&
        clamped.task.progress.current === 3 &&
        clamped.task.progress.total === 8 &&
        clamped.task.progress.message === '拉取列表',
    JSON.stringify(clamped.task.progress),
)
check(
    'report: invalid progress is refused',
    /non-negative/.test(String(throws(() => registry.report({ taskId: started.id, progress: { current: -1 } })))),
    String(throws(() => registry.report({ taskId: started.id, progress: { current: -1 } }))),
)

/* ------------------------------------------------------------------ *
 * logs: seq, dedupe, cursor
 * ------------------------------------------------------------------ */
clock += 10
const first = registry.report({ taskId: started.id, logs: ['开始', 'medium'] })
check('report: bare strings become info lines with seq 1..2', first.added === 2 && first.task.seq === 2, JSON.stringify(first.task))

clock += 10
const duplicate = registry.report({
    taskId: started.id,
    logs: [{ level: 'error', message: 'boom' }, { level: 'error', message: 'boom' }],
})
check(
    'report: a back-to-back duplicate inside 1s is dropped',
    duplicate.added === 1 && duplicate.task.seq === 3,
    JSON.stringify({ added: duplicate.added, seq: duplicate.task.seq }),
)
clock += 1_500
const repeat = registry.report({ taskId: started.id, logs: [{ level: 'error', message: 'boom' }] })
check(
    'report: the same line after 1s is a new event',
    repeat.added === 1 && repeat.task.seq === 4,
    JSON.stringify({ added: repeat.added, seq: repeat.task.seq }),
)

const page = registry.logsSince({ taskId: started.id, sinceSeq: 1, limit: 10 })
check(
    'logsSince: sinceSeq returns only newer entries, ascending',
    page.entries.length === 3 &&
        page.entries[0].seq === 2 &&
        page.entries[2].seq === 4 &&
        page.nextSeq === 4 &&
        page.dropped === 0 &&
        page.total === 4 &&
        page.sessionId === started.sessionId,
    JSON.stringify({ seqs: page.entries.map((entry) => entry.seq), dropped: page.dropped }),
)
const idle = registry.logsSince({ taskId: started.id, sinceSeq: 4 })
check(
    'logsSince: no new lines keeps the cursor',
    idle.entries.length === 0 && idle.nextSeq === 4 && idle.dropped === 0,
    JSON.stringify({ nextSeq: idle.nextSeq }),
)

/* ------------------------------------------------------------------ *
 * ring eviction and limit truncation
 * ------------------------------------------------------------------ */
const bulk = registry.start({ title: '大量日志', kind: 'test', owner: 7 })
clock += 10
for (let offset = 1; offset <= 1100; offset += 200) {
    const logs = []
    for (let line = offset; line < offset + 200 && line <= 1100; line += 1) logs.push(`line-${line}`)
    registry.report({ taskId: bulk.id, logs })
}
const evicted = registry.logsSince({ taskId: bulk.id, limit: 1000 })
check(
    'ring: keeps the newest 1000 lines and reports eviction',
    evicted.total === MAX_TASK_LOG_ENTRIES &&
        evicted.entries.length === 1000 &&
        evicted.entries[0].seq === 101 &&
        evicted.entries[999].seq === 1100 &&
        evicted.dropped === 100 &&
        evicted.nextSeq === 1100,
    JSON.stringify({ first: evicted.entries[0]?.seq, dropped: evicted.dropped }),
)
const truncated = registry.logsSince({ taskId: bulk.id, sinceSeq: 100, limit: 100 })
check(
    'ring: limit keeps the newest and counts the truncation',
    truncated.entries.length === 100 &&
        truncated.entries[0].seq === 1001 &&
        truncated.dropped === 900 &&
        truncated.nextSeq === 1100,
    JSON.stringify({ first: truncated.entries[0]?.seq, dropped: truncated.dropped }),
)
const missing = registry.logsSince({ taskId: 'nope', sinceSeq: 9 })
check(
    'logsSince: a missing task is a well-formed empty page',
    missing.sessionId === null && missing.entries.length === 0 && missing.nextSeq === 9 && missing.total === 0,
    JSON.stringify(missing),
)

/* ------------------------------------------------------------------ *
 * list / finish / cancel
 * ------------------------------------------------------------------ */
const listed = registry.list()
check(
    'list: newest updated first and filterable',
    listed.length === 2 &&
        listed[0].id === bulk.id &&
        registry.list({ kind: 'sync' }).length === 1 &&
        registry.list({ root: '/tmp/space' }).length === 1 &&
        registry.list({ state: 'running' }).length === 2,
    JSON.stringify(listed.map((task) => task.id)),
)
check(
    'list: an unknown state is refused',
    /not a task state/.test(String(throws(() => registry.list({ state: 'bogus' })))),
)

clock += 10
const finished = registry.finish({ taskId: started.id, message: '完成' })
check(
    'finish: terminal state and final message',
    finished.state === 'succeeded' &&
        finished.progress.message === '完成' &&
        typeof finished.finishedAt === 'number',
    JSON.stringify({ state: finished.state, finishedAt: finished.finishedAt }),
)
check(
    'finish: idempotent once terminal',
    registry.finish({ taskId: started.id, state: 'failed' }).state === 'succeeded',
    registry.finish({ taskId: started.id }).state,
)
check(
    'report: a finished task refuses new lines',
    /already succeeded/.test(String(throws(() => registry.report({ taskId: started.id, logs: ['late'] })))),
    String(throws(() => registry.report({ taskId: started.id, logs: ['late'] }))),
)
check(
    'finish: an unknown state is refused',
    /must be one of/.test(String(throws(() => registry.finish({ taskId: bulk.id, state: 'running' })))),
)

const cancelTarget = registry.start({ title: '可取消', kind: 'test', owner: 7 })
events.length = 0
clock += 10
const cancelRequested = registry.cancel({ taskId: cancelTarget.id })
check(
    'cancel: running task moves to cancelling and broadcasts once',
    cancelRequested.cancelRequested === true &&
        cancelRequested.state === 'cancelling' &&
        events.filter((event) => event.type === 'cancel-request').length === 1,
    JSON.stringify(cancelRequested),
)
const cancelledAgain = registry.cancel({ taskId: cancelTarget.id })
check(
    'cancel: repeating the request does not re-broadcast',
    cancelledAgain.cancelRequested === true && events.filter((event) => event.type === 'cancel-request').length === 1,
    `${events.filter((event) => event.type === 'cancel-request').length} events`,
)
const cancelled = registry.finish({ taskId: cancelTarget.id, state: 'cancelled' })
check('cancel: the plugin acknowledges by finishing cancelled', cancelled.state === 'cancelled')
check(
    'cancel: a terminal task reports cancelRequested false',
    registry.cancel({ taskId: cancelTarget.id }).cancelRequested === false,
)

/* ------------------------------------------------------------------ *
 * caller-stable ids and owner loss
 * ------------------------------------------------------------------ */
const stable = registry.start({ id: 'my-plugin:sync:space42', title: '第一次', owner: 7 })
check('start: an explicit stable id is kept', stable.id === 'my-plugin:sync:space42')
check(
    'start: re-using a running id is refused',
    /is already running/.test(
        String(throws(() => registry.start({ id: 'my-plugin:sync:space42', title: '撞车', owner: 7 }))),
    ),
)
registry.finish({ taskId: stable.id })
const rerun = registry.start({ id: 'my-plugin:sync:space42', title: '第二次', owner: 7 })
check(
    'start: a finished stable id starts a new run with a new sessionId',
    rerun.sessionId !== stable.sessionId && rerun.state === 'running' && rerun.seq === 0,
    `${stable.sessionId} -> ${rerun.sessionId}`,
)
check(
    'start: invalid ids/titles are refused',
    /may only contain/.test(String(throws(() => registry.start({ id: 'bad id', title: 'x' })))) &&
        /title/.test(String(throws(() => registry.start({ title: '   ' })))),
)

const owned = registry.start({ title: '窗口里的任务', owner: 99 })
const ownedDone = registry.start({ title: '已结束', owner: 99 })
registry.finish({ taskId: ownedDone.id })
const failedOwners = registry.failOwner(99)
check(
    'owner loss: running tasks fail, finished ones are untouched',
    failedOwners.length === 1 &&
        failedOwners[0].id === owned.id &&
        failedOwners[0].state === 'failed' &&
        /window that owned/.test(String(failedOwners[0].error)) &&
        registry.list().find((task) => task.id === ownedDone.id)?.state === 'succeeded',
    failedOwners.map((task) => task.id).join(','),
)

/* ------------------------------------------------------------------ *
 * get / touch: poll one task and refresh its liveness clock
 * ------------------------------------------------------------------ */
let probeClock = 2_000_000
const probeRegistry = createTaskRegistry({ now: () => probeClock })
const probe = probeRegistry.start({ title: '可查询', kind: 'probe' })
check('get: an unknown task answers null instead of throwing', probeRegistry.get({ taskId: 'nope' }) === null)
check(
    'get: returns the live snapshot',
    probeRegistry.get({ taskId: probe.id })?.id === probe.id &&
        probeRegistry.get({ taskId: probe.id })?.state === 'running',
    JSON.stringify(probeRegistry.get({ taskId: probe.id })),
)

probeClock += 25
const touched = probeRegistry.touch({ taskId: probe.id })
check(
    'touch: refreshes lastHeartbeatAt and updatedAt',
    touched.lastHeartbeatAt === probeClock &&
        touched.updatedAt === probeClock &&
        touched.lastHeartbeatAt > probe.createdAt,
    JSON.stringify({ lastHeartbeatAt: touched.lastHeartbeatAt, updatedAt: touched.updatedAt }),
)

probeClock += 25
const reportedBeat = probeRegistry.report({ taskId: probe.id, progress: { percent: 40 } })
check(
    'report: also refreshes lastHeartbeatAt',
    reportedBeat.task.lastHeartbeatAt === probeClock &&
        reportedBeat.task.lastHeartbeatAt > touched.lastHeartbeatAt,
    JSON.stringify({ lastHeartbeatAt: reportedBeat.task.lastHeartbeatAt }),
)

probeRegistry.finish({ taskId: probe.id, state: 'failed', error: 'boom' })
probeClock += 25
const terminalTouch = probeRegistry.touch({ taskId: probe.id })
check(
    'touch: a terminal task just returns its snapshot',
    terminalTouch.state === 'failed' &&
        terminalTouch.lastHeartbeatAt === reportedBeat.task.lastHeartbeatAt,
    JSON.stringify({ state: terminalTouch.state, lastHeartbeatAt: terminalTouch.lastHeartbeatAt }),
)
check(
    'touch: an unknown task reports TASK_NOT_FOUND',
    /TASK_NOT_FOUND/.test(String(throws(() => probeRegistry.touch({ taskId: 'nope' })))),
    String(throws(() => probeRegistry.touch({ taskId: 'nope' }))),
)

/* ------------------------------------------------------------------ *
 * result: a small structured receipt kept on the terminal snapshot
 * ------------------------------------------------------------------ */
let resultClock = 3_000_000
const resultRegistry = createTaskRegistry({ now: () => resultClock })
const resultTask = resultRegistry.start({ title: '带结果' })
resultClock += 10
const finishedWithResult = resultRegistry.finish({
    taskId: resultTask.id,
    result: { created: 3, ids: ['a', 'b'], ok: true },
})
check(
    'finish: keeps a JSON result on the terminal snapshot',
    finishedWithResult.state === 'succeeded' &&
        finishedWithResult.result?.created === 3 &&
        finishedWithResult.result?.ids?.length === 2 &&
        finishedWithResult.result?.ok === true,
    JSON.stringify(finishedWithResult.result),
)
check(
    'get: a finished task exposes its result',
    resultRegistry.get({ taskId: resultTask.id })?.result?.created === 3,
    JSON.stringify(resultRegistry.get({ taskId: resultTask.id })?.result),
)
const refinished = resultRegistry.finish({ taskId: resultTask.id, result: { created: 99 } })
check(
    'finish: repeating cannot overwrite the stored result',
    refinished.state === 'succeeded' && refinished.result?.created === 3,
    JSON.stringify(refinished.result),
)

const oversizedTask = resultRegistry.start({ title: '超大结果' })
const oversized = throws(() =>
    resultRegistry.finish({ taskId: oversizedTask.id, result: { blob: 'x'.repeat(MAX_TASK_RESULT_BYTES) } }),
)
check(
    'finish: a result over 16KB is refused',
    /TASK_RESULT_TOO_LARGE/.test(String(oversized)),
    String(oversized),
)
const boundaryTask = resultRegistry.start({ title: '卡上限结果' })
const boundary = resultRegistry.finish({
    taskId: boundaryTask.id,
    result: 'x'.repeat(MAX_TASK_RESULT_BYTES - 2),
})
check(
    'finish: a result of exactly 16KB serialized is accepted',
    typeof boundary.result === 'string' && boundary.result.length === MAX_TASK_RESULT_BYTES - 2,
    String(typeof boundary.result === 'string' ? boundary.result.length : boundary.result),
)

const cyclicTask = resultRegistry.start({ title: '不可序列化' })
const cyclic = {}
cyclic.self = cyclic
const cyclicResult = throws(() => resultRegistry.finish({ taskId: cyclicTask.id, result: cyclic }))
const bigintResult = throws(() => resultRegistry.finish({ taskId: cyclicTask.id, result: { n: 1n } }))
check(
    'finish: an unserializable result is refused',
    /TASK_RESULT_INVALID/.test(String(cyclicResult)) && /TASK_RESULT_INVALID/.test(String(bigintResult)),
    `${cyclicResult} | ${bigintResult}`,
)
check(
    'finish: a rejected result leaves the task running',
    resultRegistry.get({ taskId: cyclicTask.id })?.state === 'running',
    String(resultRegistry.get({ taskId: cyclicTask.id })?.state),
)

/* ------------------------------------------------------------------ *
 * remove: forget a finished task, never a live one
 * ------------------------------------------------------------------ */
let removeClock = 4_000_000
const removeRegistry = createTaskRegistry({ now: () => removeClock })
const removable = removeRegistry.start({ title: '可遗忘' })
const runningRemove = throws(() => removeRegistry.remove({ taskId: removable.id }))
check(
    'remove: a running task is refused with TASK_RUNNING',
    /TASK_RUNNING/.test(String(runningRemove)),
    String(runningRemove),
)
const cancellingTask = removeRegistry.start({ title: '取消中' })
removeRegistry.cancel({ taskId: cancellingTask.id })
check(
    'remove: a cancelling task is refused too',
    /TASK_RUNNING/.test(String(throws(() => removeRegistry.remove({ taskId: cancellingTask.id })))),
)
removeRegistry.finish({ taskId: removable.id, result: { ok: true } })
removeClock += 10
const removed = removeRegistry.remove({ taskId: removable.id })
check(
    'remove: a finished task is forgotten',
    removed.removed === true &&
        removed.taskId === removable.id &&
        removeRegistry.get({ taskId: removable.id }) === null &&
        removeRegistry.size === 1,
    JSON.stringify({ removed, size: removeRegistry.size }),
)
check(
    'remove: an unknown task answers removed:false',
    removeRegistry.remove({ taskId: 'nope' }).removed === false,
)

/* ------------------------------------------------------------------ *
 * heartbeat sweep: a crashed plugin cannot keep a task "running"
 * ------------------------------------------------------------------ */
let staleClock = 5_000_000
const staleEvents = []
const staleRegistry = createTaskRegistry({
    now: () => staleClock,
    onEvent: (event) => staleEvents.push(event),
})
const beating = staleRegistry.start({ title: '有心跳', heartbeatMs: 1000 })
const plain = staleRegistry.start({ title: '无心跳' })
check(
    'start: heartbeatMs is stored and lastHeartbeatAt starts at createdAt',
    beating.heartbeatMs === 1000 &&
        beating.lastHeartbeatAt === beating.createdAt &&
        plain.heartbeatMs === undefined,
    JSON.stringify({ heartbeatMs: beating.heartbeatMs, lastHeartbeatAt: beating.lastHeartbeatAt }),
)
check(
    'start: heartbeatMs outside 1000-600000 is refused',
    /heartbeatMs/.test(String(throws(() => staleRegistry.start({ title: 'bad', heartbeatMs: 999 })))) &&
        /heartbeatMs/.test(String(throws(() => staleRegistry.start({ title: 'bad', heartbeatMs: 600001 })))) &&
        /heartbeatMs/.test(String(throws(() => staleRegistry.start({ title: 'bad', heartbeatMs: 1500.5 })))) &&
        /heartbeatMs/.test(String(throws(() => staleRegistry.start({ title: 'bad', heartbeatMs: 'soon' })))),
)

check(
    'sweep: exactly three missed beats is not stale yet',
    staleRegistry.sweep(beating.createdAt + 3000) === 0 &&
        staleRegistry.get({ taskId: beating.id })?.state === 'running',
    String(staleRegistry.get({ taskId: beating.id })?.state),
)
const sweptCount = staleRegistry.sweep(beating.createdAt + 3001)
const stale = staleRegistry.get({ taskId: beating.id })
check(
    'sweep: a silent heartbeat task is failed with a stale error',
    sweptCount === 1 &&
        stale?.state === 'failed' &&
        /^stale: no heartbeat for 3001ms$/.test(String(stale?.error)) &&
        stale?.finishedAt === beating.createdAt + 3001 &&
        stale?.updatedAt === beating.createdAt + 3001,
    JSON.stringify({ sweptCount, state: stale?.state, error: stale?.error }),
)
check(
    'sweep: exactly one finished event for the swept task',
    staleEvents.filter((event) => event.type === 'finished' && event.task.id === beating.id).length === 1,
    String(staleEvents.filter((event) => event.type === 'finished').length),
)
check(
    'sweep: a task without a heartbeat is never swept',
    staleRegistry.get({ taskId: plain.id })?.state === 'running' &&
        staleRegistry.sweep(beating.createdAt + 10_000_000) === 0 &&
        staleRegistry.get({ taskId: plain.id })?.state === 'running',
    String(staleRegistry.get({ taskId: plain.id })?.state),
)
check(
    'sweep: sweeping twice is idempotent',
    staleRegistry.sweep(beating.createdAt + 10_000_001) === 0,
)

let beatClock = 6_000_000
const beatRegistry = createTaskRegistry({ now: () => beatClock })
const kept = beatRegistry.start({ title: '心跳还在', heartbeatMs: 2000 })
beatClock = kept.createdAt + 2500
beatRegistry.touch({ taskId: kept.id })
check(
    'sweep: a task that keeps beating survives',
    beatRegistry.sweep(kept.createdAt + 5000) === 0 &&
        beatRegistry.get({ taskId: kept.id })?.state === 'running',
    String(beatRegistry.get({ taskId: kept.id })?.state),
)
check(
    'sweep: a live task is swept once it stops beating',
    beatRegistry.sweep(kept.createdAt + 2500 + 6001) === 1 &&
        beatRegistry.get({ taskId: kept.id })?.state === 'failed',
    String(beatRegistry.get({ taskId: kept.id })?.state),
)

/* ------------------------------------------------------------------ *
 * capacity: finished tasks are evicted, running ones never are
 * ------------------------------------------------------------------ */
const capacityRegistry = createTaskRegistry({ now: () => clock })
for (let index = 0; index < MAX_TASKS; index += 1) {
    const task = capacityRegistry.start({ title: `t${index}` })
    capacityRegistry.finish({ taskId: task.id })
}
check('capacity: holds MAX_TASKS retained tasks', capacityRegistry.size === MAX_TASKS, String(capacityRegistry.size))
const replacement = capacityRegistry.start({ title: 'new' })
check(
    'capacity: a new task evicts the oldest finished one',
    capacityRegistry.size === MAX_TASKS &&
        capacityRegistry.list({ limit: MAX_TASKS }).some((task) => task.id === replacement.id),
    String(capacityRegistry.size),
)
const runningRegistry = createTaskRegistry({ now: () => clock })
for (let index = 0; index < MAX_TASKS; index += 1) runningRegistry.start({ title: `r${index}` })
check(
    'capacity: refuses a new task when every retained task is running',
    /too many retained tasks/.test(String(throws(() => runningRegistry.start({ title: 'overflow' })))),
)

registry.dispose()
check('dispose: drops every task', registry.size === 0)

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)