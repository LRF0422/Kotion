import { strict as assert } from 'node:assert'
import {
    acceptAgentEvent,
    AgentControlError,
    AgentSequenceGapError,
    readSseDataLines,
} from './events'
import { RunLock, RunStore } from './run-store'
import { createPendingToolBatch, matchesPendingToolBatch } from './tool-batch'
import { EditorToolExecutor, ensureSerializableToolResult } from './tool-executor'

async function checkExecutorSingleFlight(): Promise<void> {
    let executions = 0
    let release: ((value: unknown) => void) | undefined
    const result = new Promise(resolve => { release = resolve })
    const executor = new EditorToolExecutor({
        resolveTools: () => ({
            updateDocument: {
                description: 'test',
                inputSchema: {},
                execute: async () => {
                    executions += 1
                    return result
                },
            },
        }),
    })

    const first = executor.execute('call-1', 'updateDocument', { value: 1 })
    const second = executor.execute('call-1', 'updateDocument', { value: 1 })
    await Promise.resolve()
    assert.equal(executions, 1, 'concurrent callId executions must share one side effect')
    release?.({ ok: true })
    assert.deepEqual(await first, await second)
    await executor.execute('call-1', 'updateDocument', { value: 1 })
    assert.equal(executions, 1, 'completed callId executions must use the cache')
}

function checkToolBatchSnapshot(): void {
    const ids = ['call-a', 'call-b']
    const batch = createPendingToolBatch('run-1', ids)
    ids.pop()
    assert.deepEqual(batch.callIds, ['call-a', 'call-b'], 'batch must retain the full pending snapshot')
    assert.equal(matchesPendingToolBatch(batch, 'run-1', ['call-a', 'call-b']), true)
    assert.equal(matchesPendingToolBatch(batch, 'run-1', ['call-b']), true)
    assert.equal(matchesPendingToolBatch(batch, 'run-1', ['call-b', 'call-c']), false)
}

async function checkConversationLockOwnership(): Promise<void> {
    const lock = new RunLock()
    assert.ok((await lock.acquire('conversation-1')) !== null)
    assert.equal(lock.owns('conversation-1'), true)
    assert.equal(await lock.acquire('conversation-1'), null)
    assert.equal(lock.owns('conversation-2'), false)
    lock.release()
    assert.equal(lock.owns('conversation-1'), false)
}

function checkPersistedToolResults(): void {
    const store = new RunStore({ storage: localStorage })
    assert.equal(store.saveToolStarted('run-1', 'call-1'), true)
    assert.equal(store.loadToolResult('run-1', 'call-1')?.status, 'started')
    assert.equal(
        store.saveToolResult('run-1', 'call-1', { ok: true, result: { changed: true } }),
        true
    )
    assert.deepEqual(store.loadToolResult('run-1', 'call-1'), {
        status: 'completed',
        ok: true,
        result: { changed: true },
    })
    store.clearToolResult('run-1', 'call-1')
    assert.equal(store.loadToolResult('run-1', 'call-1'), null)
}

function checkSerializableResults(): void {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const outcome = ensureSerializableToolResult({ ok: true, result: cyclic })
    assert.equal(outcome.ok, false)
    assert.match(outcome.error ?? '', /not JSON serializable/)
}

function checkStreamSequenceRules(): void {
    assert.equal(acceptAgentEvent({ seq: 1, type: 'step.started', step: 1 }, 0), true)
    assert.equal(acceptAgentEvent({ seq: 1, type: 'step.started', step: 1 }, 1), false)
    assert.throws(
        () => acceptAgentEvent({ seq: 3, type: 'step.started', step: 2 }, 1),
        AgentSequenceGapError
    )
    assert.throws(
        () => acceptAgentEvent({ seq: 0, type: 'control.error', code: 'RUN_BUSY', error: 'busy' }, 4),
        AgentControlError
    )
    assert.throws(
        () => acceptAgentEvent({ seq: 0, type: 'run.failed', code: 'RUN_BUSY', error: 'busy' }, 4),
        AgentControlError
    )
}

async function checkCrlfSseFrames(): Promise<void> {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(encoder.encode('data: {"seq":1,"type":"step.started","step":1}\r\n\r\n'))
            controller.enqueue(encoder.encode('data: {"seq":2,"type":"text.delta","content":"ok"}\n\n'))
            controller.close()
        },
    })
    const payloads: string[] = []
    for await (const payload of readSseDataLines(body)) payloads.push(payload)
    assert.deepEqual(payloads, [
        '{"seq":1,"type":"step.started","step":1}',
        '{"seq":2,"type":"text.delta","content":"ok"}',
    ])
}

async function main(): Promise<void> {
    await checkExecutorSingleFlight()
    checkToolBatchSnapshot()
    await checkConversationLockOwnership()
    checkPersistedToolResults()
    checkSerializableResults()
    checkStreamSequenceRules()
    await checkCrlfSseFrames()
    console.log('agent-core checks passed')
}

void main()
