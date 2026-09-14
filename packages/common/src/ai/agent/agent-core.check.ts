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
import { resetDocumentWriteLocks, withDocumentWrite } from './document-write-lock'

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

function checkToolResultPersistenceFallback(): void {
    // Simulate a full quota: any value above the threshold throws, forcing the
    // RunStore to degrade an oversized tool result to a compact tombstone
    // (completion is still recorded, so a re-attach will not re-execute it).
    const backing = new Map<string, string>()
    const storage = {
        get length() { return backing.size },
        clear: () => { backing.clear() },
        getItem: (key: string) => backing.get(key) ?? null,
        key: (index: number) => [...backing.keys()][index] ?? null,
        removeItem: (key: string) => { backing.delete(key) },
        setItem: (key: string, value: string) => {
            if (value.length > 200) {
                const error = new Error('QuotaExceededError')
                error.name = 'QuotaExceededError'
                throw error
            }
            backing.set(key, value)
        },
    } as unknown as Storage
    const store = new RunStore({ storage })
    const big = { ok: true, result: { blob: 'x'.repeat(2000) } }
    assert.equal(
        store.saveToolResult('run-big', 'call-big', big),
        true,
        'oversized tool result must fall back to a compact tombstone'
    )
    const saved = store.loadToolResult('run-big', 'call-big')
    assert.equal(saved?.status, 'completed')
    assert.equal(saved?.resultOmitted, true)
    assert.equal(saved?.result, undefined)
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

async function checkStreamIdleWatchdog(): Promise<void> {
    // A stream that opens but never delivers a byte must fail fast instead of
    // parking the reconnect loop (and the UI) forever.
    const body = new ReadableStream<Uint8Array>({ start() { /* never emits */ } })
    await assert.rejects(
        (async () => {
            for await (const _payload of readSseDataLines(body, 50)) {
                // drain
            }
        })(),
        /idle/
    )
}

async function checkDocumentWriteSerialization(): Promise<void> {
    resetDocumentWriteLocks()
    const events: string[] = []
    let inFlight = 0
    let overlapped = false
    const task = (name: string, delay: number) => async () => {
        inFlight += 1
        if (inFlight > 1) overlapped = true
        events.push(`${name}:start`)
        await new Promise(resolve => setTimeout(resolve, delay))
        events.push(`${name}:end`)
        inFlight -= 1
        return name
    }

    // Two agents writing the SAME document: strictly serialized, FIFO.
    const results = await Promise.all([
        withDocumentWrite('page-1', task('a', 20)),
        withDocumentWrite('page-1', task('b', 0)),
    ])
    assert.deepEqual(results, ['a', 'b'])
    assert.equal(overlapped, false, 'mutating calls on one document must not interleave')
    assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end'])

    // Different documents are independent: b2 must not wait for a2.
    const parallel: string[] = []
    await Promise.all([
        withDocumentWrite('page-2', async () => {
            await new Promise(resolve => setTimeout(resolve, 20))
            parallel.push('a2')
        }),
        withDocumentWrite('page-3', async () => { parallel.push('b2') }),
    ])
    assert.deepEqual(parallel, ['b2', 'a2'], 'documents must not serialize against each other')

    // A wedged holder must not park a later call forever.
    void withDocumentWrite('page-4', () => new Promise<never>(() => { /* never settles */ }))
    await new Promise(resolve => setTimeout(resolve, 5))
    await assert.rejects(
        withDocumentWrite('page-4', async () => 'x', { timeoutMs: 30 }),
        /等待文档写锁超时/
    )
    resetDocumentWriteLocks()
}

async function checkExecutorOwnerAndWriteLease(): Promise<void> {
    resetDocumentWriteLocks()
    const ownersSeen: Array<string | null | undefined> = []
    let releaseWrite: (() => void) | undefined
    const writeGate = new Promise<void>(resolve => { releaseWrite = resolve })
    let writeStarted = 0

    const executor = new EditorToolExecutor({
        resolveTools: owner => {
            ownersSeen.push(owner)
            return {
                writeDocument: {
                    description: 'mutating',
                    inputSchema: {},
                    execute: async () => { writeStarted += 1; await writeGate; return 'written' },
                },
                readDocument: {
                    description: 'read only',
                    inputSchema: {},
                    execute: async () => 'read',
                },
            }
        },
        isReadOnlyTool: name => name === 'readDocument',
        resolveDocumentId: () => 'page-9',
    })

    // A delegated child's mutating call holds the document's write lease…
    const write = executor.execute('w-1', 'writeDocument', {}, 'sub-42')
    await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal(writeStarted, 1)

    // …while a read-only call must NOT queue behind it.
    const readOutcome = await Promise.race([
        executor.execute('r-1', 'readDocument', {}, 'sub-42'),
        new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 50)),
    ])
    assert.notEqual(readOutcome, 'timeout', 'read-only calls must not wait for the write lease')
    assert.deepEqual(ownersSeen, ['sub-42', 'sub-42'], 'the owner must reach resolveTools')

    releaseWrite?.()
    assert.deepEqual(await write, { ok: true, result: 'written' })
    resetDocumentWriteLocks()
}

async function main(): Promise<void> {
    await checkExecutorSingleFlight()
    checkToolBatchSnapshot()
    await checkConversationLockOwnership()
    checkPersistedToolResults()
    checkToolResultPersistenceFallback()
    checkSerializableResults()
    checkStreamSequenceRules()
    await checkCrlfSseFrames()
    await checkStreamIdleWatchdog()
    await checkDocumentWriteSerialization()
    await checkExecutorOwnerAndWriteLease()
    console.log('agent-core checks passed')
}

void main()
