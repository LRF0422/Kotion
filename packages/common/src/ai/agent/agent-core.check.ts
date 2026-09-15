import { strict as assert } from 'node:assert'
import {
    acceptAgentEvent,
    AgentControlError,
    AgentSequenceGapError,
    readSseDataLines,
} from './events'
import { createPendingToolBatch, matchesPendingToolBatch } from './tool-batch'
import { EditorToolExecutor, ensureSerializableToolResult } from './tool-executor'
import { resetDocumentWriteLocks, withDocumentWrite } from './document-write-lock'
import { SubRunWorker } from './sub-run-worker'
import { mergeAgentDocument } from './document-merge'
import type { AgentEvent } from './types'

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

function checkMergeRefusesToClobber(): void {
    const block = (id: string, text: string) => ({
        type: 'paragraph',
        attrs: { blockId: id },
        content: [{ type: 'text', text }],
    })
    const doc = (...blocks: any[]) => ({ type: 'doc', content: blocks })

    const baseline = doc(block('a', 'A'), block('b', 'B'), block('c', 'C'))

    // 1) Additions land in order, anchored to the agent's preceding block.
    const added = mergeAgentDocument(
        baseline,
        doc(block('a', 'A'), block('b', 'B'), block('new1', 'N1'), block('new2', 'N2'), block('c', 'C')),
        baseline
    )
    assert.deepEqual(
        added.ops.map(op => (op.kind === 'insert' ? [op.kind, op.anchorKey] : [op.kind])),
        [['insert', 'b'], ['insert', 'new1']],
        'insertions keep the agent order and follow their anchor'
    )
    assert.equal(added.conflicts.length, 0)

    // 2) A block nobody else touched is replaced.
    const replaced = mergeAgentDocument(
        baseline,
        doc(block('a', 'A'), block('b', 'B-edited'), block('c', 'C')),
        baseline
    )
    assert.deepEqual(replaced.ops, [{ kind: 'replace', key: 'b', node: block('b', 'B-edited') }])

    // 3) Both sides changed the same block → conflict, never a silent overwrite.
    const conflicted = mergeAgentDocument(
        baseline,
        doc(block('a', 'A'), block('b', 'agent-version'), block('c', 'C')),
        doc(block('a', 'A'), block('b', 'human-version'), block('c', 'C'))
    )
    assert.equal(conflicted.ops.length, 0, 'a conflicting block must not be applied')
    assert.equal(conflicted.conflicts.length, 1)
    assert.equal(conflicted.conflicts[0].key, 'b')
    assert.equal(conflicted.conflicts[0].reason, 'both-changed')

    // 4) Deletions apply only while the live block is untouched…
    const deleted = mergeAgentDocument(
        baseline,
        doc(block('a', 'A'), block('c', 'C')),
        baseline
    )
    assert.deepEqual(deleted.ops, [{ kind: 'delete', key: 'b' }])

    // …and become conflicts once someone else edited it.
    const deleteConflict = mergeAgentDocument(
        baseline,
        doc(block('a', 'A'), block('c', 'C')),
        doc(block('a', 'A'), block('b', 'touched'), block('c', 'C'))
    )
    assert.equal(deleteConflict.ops.length, 0)
    assert.equal(deleteConflict.conflicts[0].reason, 'changed-and-deleted')

    // 5) Other people's edits survive the merge.
    const concurrent = mergeAgentDocument(
        baseline,
        doc(block('a', 'A-agent'), block('b', 'B'), block('c', 'C')),
        doc(block('a', 'A'), block('b', 'B'), block('c', 'C'), block('d', 'D-human'))
    )
    assert.deepEqual(concurrent.ops.map(op => op.kind), ['replace'])
    assert.equal((concurrent.ops[0] as any).key, 'a')

    // 6) Reorders are reported but not applied.
    const reordered = mergeAgentDocument(
        baseline,
        doc(block('c', 'C'), block('a', 'A'), block('b', 'B')),
        baseline
    )
    assert.equal(reordered.reorderDetected, true)
    assert.deepEqual(reordered.ops, [])
}

async function checkSubRunWorkersRunInParallel(): Promise<void> {
    // Two delegated children, each pausing for one of its own frontend tools.
    // They must execute concurrently, and each resume must address the child
    // that owned the call — the whole point of driving children directly.
    const resumes: Array<{ runId: string; payload: any }> = []
    const settled: string[] = []
    const eventsSeen: string[] = []

    const childScript = (runId: string, callId: string) => ({
        runId,
        callId,
    })
    const children = [childScript('child-a', 'call-a'), childScript('child-b', 'call-b')]

    const fakeClient = {
        streamEvents(runId: string): AsyncGenerator<AgentEvent> {
            const child = children.find(c => c.runId === runId)!
            return (async function* () {
                yield { seq: 1, type: 'tool.requested', callId: child.callId, tool: 'writeDocument', args: '{"markdown":"x"}' } as AgentEvent
                yield { seq: 2, type: 'run.suspended', reason: 'waiting_tools', pendingCallIds: [child.callId] } as AgentEvent
            })()
        },
        async resume(runId: string, payload: any): Promise<AsyncGenerator<AgentEvent>> {
            resumes.push({ runId, payload })
            return (async function* () {
                yield { seq: 3, type: 'tool.completed', callId: 'ignored', tool: 'writeDocument', ok: true } as AgentEvent
                yield { seq: 4, type: 'run.completed', finishReason: 'stop' } as AgentEvent
            })()
        },
        async getRun() {
            throw new Error('getRun must not be needed when calls arrived on the stream')
        },
    }

    let inFlight = 0
    let maxInFlight = 0
    const worker = new SubRunWorker({
        client: fakeClient as any,
        executeTool: async (callId, _tool, _args, owner) => {
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise(resolve => setTimeout(resolve, 20))
            inFlight -= 1
            return { ok: true, result: { callId, owner } }
        },
        onEvent: (runId, event) => { eventsSeen.push(`${runId}:${event.type}`) },
        onSettled: (runId, settlement) => { settled.push(`${runId}:${settlement}`) },
    })

    worker.attach('child-a')
    worker.attach('child-b')

    await waitFor(() => settled.length === 2, 3000)

    assert.equal(maxInFlight, 2, 'two children must have a tool call in flight at the same time')
    assert.deepEqual(
        resumes.map(entry => entry.runId).sort(),
        ['child-a', 'child-b'],
        'each child must be resumed directly, by its own run id'
    )
    const resumedCalls = resumes.flatMap(entry => entry.payload.toolResults.map((r: any) => r.callId)).sort()
    assert.deepEqual(resumedCalls, ['call-a', 'call-b'])
    assert.ok(
        resumes.every(entry => entry.payload.action === 'tool_results'),
        'children are resumed with their own tool results'
    )
    assert.deepEqual(settled.sort(), ['child-a:completed', 'child-b:completed'])
    assert.ok(eventsSeen.includes('child-a:text.delta') === false, 'unrelated event types are ignored by the check script')
    assert.deepEqual(worker.activeRunIds, [], 'settled children must be detached')
    worker.dispose()
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (predicate()) return
        await new Promise(resolve => setTimeout(resolve, 5))
    }
    throw new Error('timed out waiting for condition')
}

async function main(): Promise<void> {
    await checkExecutorSingleFlight()
    checkToolBatchSnapshot()
    checkSerializableResults()
    checkStreamSequenceRules()
    await checkCrlfSseFrames()
    await checkStreamIdleWatchdog()
    await checkDocumentWriteSerialization()
    await checkExecutorOwnerAndWriteLease()
    await checkSubRunWorkersRunInParallel()
    checkMergeRefusesToClobber()
    console.log('agent-core checks passed')
}

void main()
