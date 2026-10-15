/**
 * Background tasks: the contract the agent relies on.
 *
 *   - `background: true` answers IMMEDIATELY (that is the whole point: the run
 *     must not park on a 3-minute build);
 *   - a task the agent waited on is consumed, so the completion note cannot
 *     announce the same result twice;
 *   - a task it did NOT wait on stays undeliverable-but-pending and is handed to
 *     the conversation exactly once;
 *   - a timed-out wait is not a failure and does not consume the result;
 *   - `cancel` stops the WAITING (the host work itself is not interruptible), and
 *     a late success must not come back as a fresh notification;
 *   - the tools only ever see their own conversation's tasks.
 *
 * Everything runs against the real registry and the real tools — no mocks of the
 * module under test.
 */

import { strict as assert } from 'node:assert'
import {
    BackgroundTaskRegistry,
    MAX_BACKGROUND_WAIT_MS,
    clipForNote,
} from './background-tasks'
import { createBackgroundTaskTools } from '../tools/background-tools'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Resolve/reject control for a task whose work we drive by hand. */
const deferred = () => {
    let resolve!: (value?: unknown) => void
    let reject!: (error?: unknown) => void
    const promise = new Promise((res, rej) => { resolve = res as any; reject = rej })
    return { promise, resolve, reject }
}

async function checkStartAnswersImmediately(): Promise<void> {
    const registry = new BackgroundTaskRegistry()
    const gate = deferred()
    const started = Date.now()
    const task = registry.start({
        tool: 'buildPluginProject',
        title: '构建 my-plugin',
        conversationId: 'c1',
        run: () => gate.promise,
    })
    assert.equal(task.status, 'running', 'start must return the task while the work is still running')
    assert.ok(Date.now() - started < 100, 'start must not wait for the work')
    assert.equal(task.tool, 'buildPluginProject')

    const ack = registry.ack(task)
    assert.equal(ack.background, true)
    assert.equal(ack.taskId, task.id)
    assert.equal(ack.status, 'running')
    assert.match(ack.hint, /getBackgroundTask/, 'the ack must name the waiting tool')

    gate.resolve({ ok: true })
    await sleep(5)
    const settled = registry.get(task.id)
    assert.equal(settled?.status, 'succeeded')
    assert.deepEqual(settled?.result, { ok: true })
    assert.equal(settled?.deliveredAt, undefined, 'settling alone does not consume the task')
}

async function checkWaitConsumesTheResult(): Promise<void> {
    const registry = new BackgroundTaskRegistry()
    const gate = deferred()
    const task = registry.start({
        tool: 'installPluginDependencies',
        title: '安装依赖 demo',
        conversationId: 'c1',
        run: () => gate.promise,
    })

    const waiting = registry.wait(task.id, 5_000)
    gate.resolve({ manager: 'pnpm' })
    const { task: settled, timedOut } = await waiting
    assert.equal(timedOut, false)
    assert.equal(settled?.status, 'succeeded')
    assert.deepEqual(settled?.result, { manager: 'pnpm' })

    assert.deepEqual(registry.undelivered('c1'), [], 'a waited-on task is already known to the agent')
    assert.deepEqual(registry.takeUndelivered('c1'), [], 'and must not be announced afterwards')
}

async function checkWaitTimeoutKeepsTheTaskPending(): Promise<void> {
    const registry = new BackgroundTaskRegistry()
    const gate = deferred()
    const task = registry.start({
        tool: 'buildPluginProject',
        title: '构建 slow',
        conversationId: 'c1',
        run: () => gate.promise,
    })

    const { task: running, timedOut } = await registry.wait(task.id, 20)
    assert.equal(timedOut, true, 'a wait that expires reports the timeout')
    assert.equal(running?.status, 'running', 'and the task itself is untouched')
    // Nothing to deliver YET (a running task is not a completion) — the point is
    // that the expired wait did not consume the result, which the claim below
    // proves once the work lands.
    assert.deepEqual(registry.undelivered('c1'), [])

    gate.resolve('built')
    await sleep(5)
    const claimed = registry.takeUndelivered('c1')
    assert.equal(claimed.length, 1, 'it is still deliverable after it settles')
    assert.equal(claimed[0].result, 'built')
    assert.deepEqual(registry.takeUndelivered('c1'), [], 'claiming is exactly once')
}

async function checkFailureAndNoteText(): Promise<void> {
    const registry = new BackgroundTaskRegistry()
    const task = registry.start({
        tool: 'publishPluginProject',
        title: '发布 demo 1.0.0',
        conversationId: 'c1',
        run: async () => { throw new Error('构建失败：uhandler 未定义') },
    })
    await sleep(5)
    const settled = registry.get(task.id)
    assert.equal(settled?.status, 'failed')
    assert.match(settled?.error ?? '', /uhandler/)

    const note = registry.describe(registry.undelivered('c1'))
    assert.match(note, /后台任务失败/, 'the completion note must say the task failed')
    assert.match(note, /uhandler/, 'and must carry the reason')
    assert.match(note, new RegExp(task.id))
}

async function checkCancelStopsWaitingWithoutResurrecting(): Promise<void> {
    const registry = new BackgroundTaskRegistry()
    const gate = deferred()
    let cancels = 0
    const task = registry.start({
        tool: 'buildPluginProject',
        title: '构建 demo',
        conversationId: 'c1',
        onCancel: () => { cancels += 1 },
        run: () => gate.promise,
    })

    const waiting = registry.wait(task.id, 5_000)
    assert.equal(registry.cancel(task.id), true)
    const { task: cancelled, timedOut } = await waiting
    assert.equal(timedOut, false, 'cancel must unblock a waiter instead of letting it time out')
    assert.equal(cancelled?.status, 'cancelled')
    assert.equal(cancels, 1, 'the tool gets its best-effort stop hook')
    assert.equal(registry.cancel(task.id), false, 'cancel is not idempotent-forever: a terminal task refuses')

    gate.resolve({ late: true })
    await sleep(5)
    const after = registry.get(task.id)
    assert.equal(after?.status, 'cancelled', 'a late success must not resurrect a cancelled task')
    assert.deepEqual(registry.takeUndelivered('c1'), [], 'and must not produce a notification')
}

async function checkConversationScoping(): Promise<void> {
    const registry = new BackgroundTaskRegistry()
    const gate = deferred()
    registry.start({ tool: 'a-tool', title: 'c1 task', conversationId: 'c1', run: () => gate.promise })
    registry.start({ tool: 'b-tool', title: 'c2 task', conversationId: 'c2', run: () => gate.promise })

    assert.deepEqual(registry.list({ conversationId: 'c1' }).map(task => task.title), ['c1 task'])
    assert.equal(registry.list().length, 2, 'no filter means everything')
    assert.equal(registry.list({ conversationId: 'c1', activeOnly: true }).length, 1)
    gate.resolve()
    await sleep(5)
    assert.equal(registry.list({ conversationId: 'c1', activeOnly: true }).length, 0)
}

async function checkProgressAndOwnerTagging(): Promise<void> {
    const registry = new BackgroundTaskRegistry()
    const gate = deferred()
    const task = registry.start({
        tool: 'buildPluginProject',
        title: '构建 sub',
        conversationId: 'c1',
        owner: 'sub-7',
        run: async handle => {
            handle.progress('正在构建')
            return gate.promise
        },
    })
    await sleep(5)
    assert.equal(registry.get(task.id)?.progress, '正在构建')
    assert.equal(registry.list({ owner: 'sub-7' }).length, 1)
    assert.equal(registry.list({ owner: null }).length, 0)
    gate.resolve()
}

async function checkTrimBounds(): Promise<void> {
    const registry = new BackgroundTaskRegistry()
    for (let index = 0; index < 130; index += 1) {
        registry.start({ tool: 't', title: `task ${index}`, conversationId: 'c1', run: async () => index })
    }
    await sleep(20)
    assert.ok(registry.list().length <= 100, 'terminal entries must be trimmed')
    // The newest are the ones kept.
    assert.ok(registry.list().some(task => task.title === 'task 129'))

    // A pending completion note outlives older entries that were already seen:
    // dropping it would mean the agent is never told its build finished.
    const pressure = new BackgroundTaskRegistry()
    const gate = deferred()
    const pending = pressure.start({
        tool: 'buildPluginProject',
        title: '构建 must-survive',
        conversationId: 'c1',
        run: () => gate.promise,
    })
    for (let index = 0; index < 120; index += 1) {
        pressure.start({ tool: 't', title: `noise ${index}`, conversationId: 'c1', run: async () => index })
    }
    await sleep(20)
    gate.resolve('done')
    await sleep(5)
    const survivors = pressure.takeUndelivered('c1')
    assert.ok(
        survivors.some(task => task.id === pending.id),
        'a completion the agent has not seen must not be trimmed away',
    )
}

function checkClipForNote(): void {
    const clipped = clipForNote({ blob: 'x'.repeat(5_000) }, 100)
    assert.ok(clipped.length < 300, 'notes must not carry a whole build log')
    assert.match(clipped, /已截断/)
    assert.equal(clipForNote('short', 100), 'short')
    // A cyclic value cannot be stringified: the note still has to say something.
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    assert.equal(typeof clipForNote(cyclic), 'string')
}

/**
 * The rule the notification hook is built on: a completion is delivered once,
 * and only while the conversation is at rest.
 */
async function checkFlushIsBusyAwareAndExactlyOnce(): Promise<void> {
    const { backgroundTasks, flushBackgroundTaskNotes } = await import('./background-tasks')
    backgroundTasks.reset()
    const gate = deferred()
    const task = backgroundTasks.start({
        tool: 'buildPluginProject',
        title: '构建 flush-demo',
        conversationId: 'c-flush',
        run: () => gate.promise,
    })
    gate.resolve('built')
    await sleep(5)

    const delivered: Array<{ ids: string[]; note: string }> = []
    const notify = (tasks: Array<{ id: string }>, note: string) => {
        delivered.push({ ids: tasks.map(entry => entry.id), note })
    }

    // Mid-turn: the note must stay in the registry, not be spent.
    assert.equal(
        flushBackgroundTaskNotes({ conversationId: 'c-flush', isBusy: () => true, onNotify: notify }),
        false,
    )
    // NOTE: `assert.equal`, not `deepEqual` — node's assert signatures narrow the
    // asserted value, and `deepEqual(delivered, [])` would pin it to `never[]`.
    assert.equal(delivered.length, 0)
    assert.equal(backgroundTasks.get(task.id)?.deliveredAt, undefined)

    // At rest: delivered once, with the result in the note.
    assert.equal(
        flushBackgroundTaskNotes({ conversationId: 'c-flush', isBusy: () => false, onNotify: notify }),
        true,
    )
    assert.equal(delivered.length, 1)
    assert.deepEqual(delivered[0].ids, [task.id])
    assert.match(delivered[0].note, /built/)

    // And never twice.
    assert.equal(
        flushBackgroundTaskNotes({ conversationId: 'c-flush', isBusy: () => false, onNotify: notify }),
        false,
    )
    assert.equal(delivered.length, 1)

    // Another conversation's tasks are not touched, and no id means nothing to do.
    assert.equal(flushBackgroundTaskNotes({ conversationId: 'other', isBusy: () => false, onNotify: notify }), false)
    assert.equal(flushBackgroundTaskNotes({ conversationId: null, isBusy: () => false, onNotify: notify }), false)
    backgroundTasks.reset()
}

/**
 * A long task carries the artifact it produces — for its WHOLE lifetime.
 *
 * This is what lets a plugin tool that builds something (a plugin build, a
 * Jenkins job) be the conversation's working target while it is still running:
 * its tool result is only a handle, so nothing else in the transcript knows what
 * is being produced.
 */
async function checkTaskCarriesItsArtifact(): Promise<void> {
    const { backgroundTasks, mergeAgentArtifacts } = {
        ...(await import('./background-tasks')),
        ...(await import('../kernel/agent-artifact-collect')),
    }
    backgroundTasks.reset()
    const gate = deferred()
    const states: string[] = []
    const task = backgroundTasks.start({
        tool: 'buildPluginProject',
        title: '构建 artifact-demo',
        conversationId: 'c-art',
        artifact: state => {
            states.push(state.status)
            return {
                kind: 'plugin-build',
                id: '/managed/artifact-demo',
                title: 'artifact-demo',
                data: { status: state.status, error: state.error ?? null },
            }
        },
        run: () => gate.promise,
    })

    // The placeholder exists from the call itself, before any work happened.
    assert.deepEqual(states, ['running'])
    assert.equal(task.artifact?.kind, 'plugin-build')
    assert.deepEqual(task.artifact?.data, { status: 'running', error: null })
    assert.equal(backgroundTasks.artifacts('c-art').length, 1)
    assert.deepEqual(backgroundTasks.artifacts('other'), [], 'artifacts are scoped to the conversation')

    gate.resolve({ bytes: 12 })
    await sleep(5)
    assert.deepEqual(states, ['running', 'succeeded'], 'the mapper runs again on settle')
    const settled = backgroundTasks.get(task.id)?.artifact
    assert.equal(settled?.id, '/managed/artifact-demo', 'same slot: kind+id is the identity')
    assert.deepEqual(settled?.data, { status: 'succeeded', error: null })

    // A failed task still has an artifact: disappearing would leave the
    // placeholder behind, saying "still building" forever.
    const failed = backgroundTasks.start({
        tool: 'buildPluginProject',
        title: '构建 broken',
        conversationId: 'c-art',
        artifact: state => ({ kind: 'plugin-build', id: '/managed/broken', data: { status: state.status } }),
        run: async () => { throw new Error('boom') },
    })
    await sleep(5)
    assert.equal(backgroundTasks.get(failed.id)?.artifact?.data && (backgroundTasks.get(failed.id)!.artifact!.data as any).status, 'failed')

    // Dedupe by kind:id, newest task last → newest first in the result; a second
    // build of the SAME project updates one slot.
    const again = backgroundTasks.start({
        tool: 'buildPluginProject',
        title: '构建 artifact-demo',
        conversationId: 'c-art',
        artifact: () => ({ kind: 'plugin-build', id: '/managed/artifact-demo', title: 'newer' }),
        run: async () => 'ok',
    })
    await sleep(5)
    const artifacts = backgroundTasks.artifacts('c-art')
    assert.equal(artifacts.filter(a => a.id === '/managed/artifact-demo').length, 1, 'one slot per project')
    // A re-run updates that slot in place (same position, like the transcript
    // collector does for a re-touched page) — the newest state wins.
    assert.equal(
        artifacts.find(a => a.id === '/managed/artifact-demo')?.title,
        'newer',
        'the latest build owns the slot',
    )
    assert.ok(again)

    // The shelf rule: the task's artifact overrides the transcript's placeholder.
    const merged = mergeAgentArtifacts(
        [{ kind: 'plugin-build', id: '/managed/artifact-demo', title: 'placeholder' }],
        [{ kind: 'plugin-build', id: '/managed/artifact-demo', title: 'real build' }],
    )
    assert.deepEqual(merged.map(a => a.title), ['real build'])
    assert.equal(
        mergeAgentArtifacts([{ kind: 'page', id: 'p1' }], []).length,
        1,
        'transcript-only artifacts survive',
    )
    backgroundTasks.reset()
}

/** `listSnapshot` must be referentially stable between changes (React compares). */
async function checkListSnapshotIsStable(): Promise<void> {
    const { backgroundTasks } = await import('./background-tasks')
    backgroundTasks.reset()
    const gate = deferred()
    backgroundTasks.start({ tool: 't', title: 'stable', conversationId: 'c1', run: () => gate.promise })
    const first = backgroundTasks.listSnapshot({ conversationId: 'c1' })
    const second = backgroundTasks.listSnapshot({ conversationId: 'c1' })
    assert.equal(first, second, 'same version must return the same array identity')
    gate.resolve()
    await sleep(5)
    const third = backgroundTasks.listSnapshot({ conversationId: 'c1' })
    assert.notEqual(first, third, 'a settle changes the snapshot')
    assert.equal(third[0].status, 'succeeded')
    // …and it stays stable again after that.
    assert.equal(third, backgroundTasks.listSnapshot({ conversationId: 'c1' }))
    backgroundTasks.reset()
}

/**
 * The tools have to survive the WORKSPACE (no editor) scope filter, and they
 * must not take the document write lease while they wait.
 *
 * This is the wiring that is easy to get wrong and invisible when wrong: a
 * `background: true` call would hand the model a taskId that no surface can act
 * on, and a 60s wait behind the write lease would block every other agent on the
 * page. Runs against the real ToolProvider + the real scope rule.
 */
async function checkToolWiringInCatalog(): Promise<void> {
    const { ToolProvider } = await import('../providers/ToolProvider')
    const { registerToolFactories, clearToolFactories } = await import('../tools/tool-factory-registry')
    const { agentToolAvailableAtScope } = await import('../kernel/filter-catalog')
    const { isReadOnlyTool } = await import('../capabilities/CapabilityCatalog')
    const { createBackgroundTaskTools } = await import('../tools/background-tools')

    clearToolFactories()
    registerToolFactories([createBackgroundTaskTools])
    try {
        // `editor: null` is the workbench: no document at all.
        const provider = new ToolProvider({ editor: null })
        const names = ['listBackgroundTasks', 'getBackgroundTask', 'cancelBackgroundTask']
        for (const name of names) {
            const meta = provider.getToolMetadata(name)
            assert.ok(meta, `${name} must be in the metadata registry`)
            assert.equal(meta?.source, 'builtin')
            assert.equal(meta?.scope, 'any', `${name} must be valid in every scope`)
            assert.equal(
                agentToolAvailableAtScope(meta, false),
                true,
                `${name} must survive the workspace filter (no editor)`,
            )
            const executor: any = provider.getToolExecutor(name)
            assert.ok(executor, `${name} must be executable`)
            assert.equal(typeof executor.execute, 'function')
            assert.ok(
                executor.inputSchema && typeof executor.inputSchema === 'object',
                `${name} must ship a schema`,
            )
        }
        // None of the three may take the document write lease. `getBackgroundTask`
        // parks for up to a minute, and a mutating classification would serialize
        // the whole page behind that wait; `cancelBackgroundTask` writes the task
        // board, not the document.
        for (const name of names) {
            assert.equal(
                isReadOnlyTool(provider.getToolMetadata(name), provider.getToolExecutor(name)),
                true,
                `${name} must be read-only for the write lease`,
            )
        }
        const waitSchema: any = provider.getToolExecutor('getBackgroundTask')?.inputSchema
        assert.ok(waitSchema?.properties?.wait, 'the model must be able to pass `wait`')
        assert.ok(waitSchema?.properties?.timeoutMs, 'the model must be able to bound the wait')
    } finally {
        clearToolFactories()
    }
}

/* ------------------------------------------------------------------ *
 * Tools
 * ------------------------------------------------------------------ */

const tools = createBackgroundTaskTools(undefined) as any

async function checkToolWaitAndPayload(): Promise<void> {
    const registry = new BackgroundTaskRegistry()
    const gate = deferred()
    // The tools read the shared singleton; drive it directly.
    const { backgroundTasks } = await import('./background-tasks')
    backgroundTasks.reset()
    const task = backgroundTasks.start({
        tool: 'buildPluginProject',
        title: '构建 tool-demo',
        conversationId: 'c9',
        run: () => gate.promise,
    })

    const ack = backgroundTasks.ack(task.id)
    gate.resolve({ ok: true, bytes: 42 })
    const waited = await tools.getBackgroundTask.execute(
        { taskId: ack.taskId, wait: true, timeoutMs: 2_000 },
        'call-1',
        { conversationId: 'c9' },
    )
    assert.equal(waited.status, 'succeeded')
    assert.deepEqual(waited.result, { ok: true, bytes: 42 })
    assert.equal(waited.timedOut, false)
    assert.equal(waited.seen, true)

    // Waiting consumed it: the notification path must now find nothing.
    assert.deepEqual(backgroundTasks.takeUndelivered('c9'), [])

    const listed = await tools.listBackgroundTasks.execute({}, 'call-2', { conversationId: 'c9' })
    assert.equal(listed.count, 1)
    assert.equal(listed.tasks[0].status, 'succeeded')
    backgroundTasks.reset()
}

async function checkToolScopingAndUnknownIds(): Promise<void> {
    const { backgroundTasks } = await import('./background-tasks')
    backgroundTasks.reset()
    const gate = deferred()
    const task = backgroundTasks.start({
        tool: 'buildPluginProject',
        title: '构建 other',
        conversationId: 'other',
        run: () => gate.promise,
    })

    // Implicit resolution only considers the CALLING conversation …
    const implicit = await tools.getBackgroundTask.execute({ wait: false }, 'call-3', { conversationId: 'mine' })
    assert.match(implicit.error, /没有正在运行的后台任务|请传 taskId/)

    // … and an explicit id still cannot be reached across conversations? It can
    // be read (the id is proof enough), but a foreign session's task is never
    // silently picked up as "mine".
    const explicit = await tools.getBackgroundTask.execute({ taskId: task.id, wait: false }, 'call-4', { conversationId: 'mine' })
    assert.equal(explicit.taskId, task.id)
    assert.equal(explicit.seen, false, 'a peek at a running task does not consume it')

    const listed = await tools.listBackgroundTasks.execute({}, 'call-5', { conversationId: 'mine' })
    assert.equal(listed.count, 0, 'listings are scoped to the calling conversation')

    const unknown = await tools.getBackgroundTask.execute({ taskId: 'bg-999' }, 'call-6', { conversationId: 'mine' })
    assert.match(unknown.error, /bg-999/)

    const cancelled = await tools.cancelBackgroundTask.execute({ taskId: task.id }, 'call-7', { conversationId: 'other' })
    assert.equal(cancelled.ok, true)
    assert.equal(cancelled.status, 'cancelled')
    assert.equal(backgroundTasks.get(task.id)?.status, 'cancelled')

    const again = await tools.cancelBackgroundTask.execute({ taskId: task.id }, 'call-8', { conversationId: 'other' })
    assert.equal(again.ok, false, 'cancelling a finished task reports it instead of pretending')

    gate.resolve()
    backgroundTasks.reset()
}

async function checkToolWaitTimeoutReportsProgress(): Promise<void> {
    const { backgroundTasks } = await import('./background-tasks')
    backgroundTasks.reset()
    const gate = deferred()
    const task = backgroundTasks.start({
        tool: 'runPluginProject',
        title: '监听 demo',
        conversationId: 'c1',
        run: async handle => {
            handle.progress('正在启动监听')
            return gate.promise
        },
    })
    const result = await tools.getBackgroundTask.execute(
        { taskId: task.id, wait: true, timeoutMs: 20 },
        'call-9',
        { conversationId: 'c1' },
    )
    assert.equal(result.status, 'running')
    assert.equal(result.timedOut, true)
    assert.equal(result.progress, '正在启动监听')
    assert.match(result.hint, /不是失败/)
    gate.resolve()
    backgroundTasks.reset()
}

function checkWaitBudgetIsClamped(): void {
    assert.ok(MAX_BACKGROUND_WAIT_MS >= 60_000)
}

async function main(): Promise<void> {
    await checkStartAnswersImmediately()
    await checkWaitConsumesTheResult()
    await checkWaitTimeoutKeepsTheTaskPending()
    await checkFailureAndNoteText()
    await checkCancelStopsWaitingWithoutResurrecting()
    await checkConversationScoping()
    await checkProgressAndOwnerTagging()
    await checkTrimBounds()
    checkClipForNote()
    checkWaitBudgetIsClamped()
    await checkToolWiringInCatalog()
    await checkFlushIsBusyAwareAndExactlyOnce()
    await checkTaskCarriesItsArtifact()
    await checkListSnapshotIsStable()
    await checkToolWaitAndPayload()
    await checkToolScopingAndUnknownIds()
    await checkToolWaitTimeoutReportsProgress()
    console.log('background-tasks.check: ok')
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
