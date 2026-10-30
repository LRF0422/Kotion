/**
 * Tool approval — the contract between a tool that needs a human decision and
 * the host that asks for it.
 *
 *   - one callId → one approval card (concurrent/replayed requests share the
 *     promise; a late replay gets the recorded decision, never a second prompt);
 *   - an unanswered request NEVER hangs the tool: it auto-denies on timeout and
 *     on `cancelScope`/`cancelAll` (run cancel, tab close, conversation switch);
 *   - a decision only ever comes from `decide()` — a missing/throwing channel is
 *     a denial, so a tool cannot run unconfirmed by accident;
 *   - the state machine parks the run in `waiting-approval` while a call waits
 *     and restores it when the last approval settles;
 *   - the executor injects the channel into the tool's execution context, bound
 *     to that call's callId.
 *
 * Everything runs against the real registry / reducer / executor — no mocks of
 * the modules under test.
 */

import { strict as assert } from 'node:assert'
import type { ToolApprovalDecision } from '../types'
import {
    DEFAULT_TOOL_APPROVAL_TIMEOUT_MS,
    TOOL_APPROVAL_CANCELLED_REASON,
    ToolApprovalRegistry,
    createToolApprovalRegistry,
} from './tool-approval'
import { EditorToolExecutor } from './tool-executor'
import { initialState, reducer, type EditorAgentState, type ToolCallRecord } from './editor-agent-state'

async function checkRequestResolvesOnDecide(): Promise<void> {
    const registry = createToolApprovalRegistry()
    let notifications = 0
    const unsubscribe = registry.subscribe(() => { notifications += 1 })

    const promise = registry.request('call-1', {
        title: '执行命令',
        message: 'rm -rf build',
        reasons: ['会删除构建产物'],
    }, { scope: 'conversation-1' })

    assert.equal(registry.size, 1)
    const entry = registry.get('call-1')
    assert.ok(entry, 'the request must be visible while pending')
    assert.equal(entry?.callId, 'call-1')
    assert.equal(entry?.scope, 'conversation-1')
    assert.equal(entry?.request.title, '执行命令')
    assert.deepEqual(registry.snapshot().map(item => item.callId), ['call-1'])
    assert.equal(notifications, 1, 'filing a request must notify subscribers')
    assert.equal(
        entry!.expiresAt - entry!.createdAt,
        DEFAULT_TOOL_APPROVAL_TIMEOUT_MS,
        'the default window is five minutes'
    )

    assert.equal(registry.decide('call-1', { allowed: true, note: '确认执行' }), true)
    assert.deepEqual(await promise, { allowed: true, note: '确认执行' })
    assert.equal(registry.size, 0)
    assert.equal(registry.get('call-1'), undefined)
    assert.equal(notifications, 2, 'resolving must notify subscribers too')

    assert.equal(registry.decide('call-1', { allowed: false }), false, 'a second decide is a no-op')
    assert.equal(
        registry.decide('never-asked', { allowed: false }),
        false,
        'deciding a call nobody asked about is a no-op, not an error'
    )
    // A late replayed request returns the decision already made — never a
    // second prompt for the same callId.
    assert.deepEqual(
        await registry.request('call-1', { title: '执行命令', message: 'rm -rf build' }),
        { allowed: true, note: '确认执行' },
        'a replayed callId must reuse the recorded decision'
    )
    assert.equal(registry.size, 0)
    unsubscribe()
    registry.dispose()
}

async function checkConcurrentRequestsShareOnePrompt(): Promise<void> {
    const registry = createToolApprovalRegistry()
    const first = registry.request('call-1', { title: 't', message: 'm' })
    const second = registry.request('call-1', { title: 't', message: 'm' })
    assert.equal(first, second, 'concurrent requests for one callId must share the promise')
    assert.equal(registry.size, 1, 'one callId must never produce two cards')

    registry.decide('call-1', { allowed: false, reason: '不要' })
    assert.deepEqual(await first, { allowed: false, reason: '不要' })
    assert.deepEqual(await second, { allowed: false, reason: '不要' })
    registry.dispose()
}

async function checkTimeoutAutoDenies(): Promise<void> {
    const registry = createToolApprovalRegistry()
    const started = Date.now()
    const decision = await registry.request('call-slow', {
        title: 't',
        message: 'm',
        timeoutMs: 20,
    })
    assert.equal(decision.allowed, false, 'an unanswered approval must time out into a denial')
    assert.match((decision as { reason: string }).reason, /超时/, 'the denial must say it timed out')
    assert.ok(Date.now() - started >= 15, 'the decision must wait for the window')
    assert.equal(registry.size, 0, 'a timed-out request must not linger')

    // A malformed / non-positive timeout falls back to the default, never to
    // "no timeout".
    const registry2 = createToolApprovalRegistry()
    const fallback = registry2.request('call-x', { title: 't', message: 'm', timeoutMs: -5 })
    assert.equal(
        registry2.get('call-x')!.expiresAt - registry2.get('call-x')!.createdAt,
        DEFAULT_TOOL_APPROVAL_TIMEOUT_MS
    )
    registry2.cancelAll()
    assert.equal((await fallback).allowed, false)
    registry.dispose()
    registry2.dispose()
}

async function checkCancelScopesAndCancelAll(): Promise<void> {
    const registry = createToolApprovalRegistry()
    const mine = registry.request('c1', { title: 't', message: 'm' }, { scope: 'conversation-a' })
    const other = registry.request('c2', { title: 't', message: 'm' }, { scope: 'conversation-b' })

    assert.equal(registry.cancelScope('conversation-a', '运行已取消'), 1)
    const denied = await mine
    assert.equal(denied.allowed, false)
    assert.equal((denied as { reason: string }).reason, '运行已取消')
    assert.equal(registry.size, 1, 'another conversation must keep its approval')
    assert.ok(registry.get('c2'), 'the unscoped approval is untouched')

    assert.equal(registry.cancelAll(), 1)
    const cancelled = await other
    assert.equal(cancelled.allowed, false)
    assert.equal((cancelled as { reason: string }).reason, TOOL_APPROVAL_CANCELLED_REASON)
    assert.equal(registry.size, 0)
    registry.dispose()
}

async function checkBlockLevelNeverPrompts(): Promise<void> {
    const registry = createToolApprovalRegistry()
    let notified = 0
    registry.subscribe(() => { notified += 1 })
    const decision = await registry.request('c-block', {
        title: '危险操作',
        message: 'm',
        level: 'block',
    })
    assert.equal(decision.allowed, false, 'a block-level declaration is denied by the host')
    assert.match((decision as { reason: string }).reason, /block/)
    assert.equal(registry.size, 0, 'a block-level request must never reach the UI')
    assert.equal(notified, 0, 'nothing pending means nothing to notify')
    registry.dispose()
}

function checkSnapshotStability(): void {
    const registry = createToolApprovalRegistry()
    registry.request('a', { title: 't', message: 'm' })
    const first = registry.snapshot()
    assert.equal(registry.snapshot(), first, 'the snapshot must be referentially stable between changes')
    registry.request('b', { title: 't', message: 'm' })
    const second = registry.snapshot()
    assert.notEqual(second, first, 'a new pending approval must invalidate the snapshot')
    assert.equal(second, registry.snapshot(), 'and the new snapshot is stable too')
    assert.deepEqual(second.map(entry => entry.callId), ['a', 'b'])
    registry.dispose()
}

function checkStateMachineApprovalLifecycle(): void {
    const base: EditorAgentState = {
        ...initialState,
        phase: 'waiting-tools',
        runId: 'run-1',
        pendingToolIds: ['call-1'],
        toolCalls: [
            { callId: 'call-1', tool: 'dangerousWrite', args: {}, status: 'running' } as ToolCallRecord,
        ],
    }

    const requested = reducer(base, {
        type: 'tool-approval-requested',
        callId: 'call-1',
        request: { title: '写入文件', message: '会覆盖 x' },
    })
    assert.equal(requested.phase, 'waiting-approval', 'a pending approval parks the run on the user')
    assert.equal(requested.suspendReason, 'tool_approval', 'and distinguishes the copy from plan approval')
    assert.equal(requested.toolCalls[0].approval?.status, 'pending')
    assert.equal(requested.toolCalls[0].approval?.request.title, '写入文件')

    const allowed = reducer(requested, {
        type: 'tool-approval-resolved',
        callId: 'call-1',
        decision: { allowed: true, note: 'ok' },
    })
    assert.equal(allowed.toolCalls[0].approval?.status, 'allowed')
    assert.deepEqual(allowed.toolCalls[0].approval?.decision, { allowed: true, note: 'ok' })
    assert.equal(allowed.phase, 'waiting-tools', 'with a tool result still owed, the run returns to waiting-tools')
    assert.equal(allowed.suspendReason, 'waiting_tools')

    // Without an owed tool result the run goes back to streaming.
    const streaming = reducer({ ...initialState, phase: 'streaming' }, {
        type: 'tool-approval-requested',
        callId: 'call-9',
        request: { title: 't', message: 'm' },
    })
    assert.equal(streaming.phase, 'streaming', 'an unknown callId must not hijack the phase')

    // Two approvals: the phase stays parked until BOTH settle.
    const two: EditorAgentState = {
        ...base,
        pendingToolIds: ['call-1', 'call-2'],
        toolCalls: [
            { callId: 'call-1', tool: 'a', args: {}, status: 'running' },
            { callId: 'call-2', tool: 'b', args: {}, status: 'running' },
        ],
    }
    const bothPending = reducer(
        reducer(two, { type: 'tool-approval-requested', callId: 'call-1', request: { title: '1', message: 'm' } }),
        { type: 'tool-approval-requested', callId: 'call-2', request: { title: '2', message: 'm' } }
    )
    const oneLeft = reducer(bothPending, {
        type: 'tool-approval-resolved',
        callId: 'call-1',
        decision: { allowed: false, reason: '拒绝' },
    })
    assert.equal(oneLeft.phase, 'waiting-approval', 'another call is still waiting for a human')
    const allDone = reducer(oneLeft, {
        type: 'tool-approval-resolved',
        callId: 'call-2',
        decision: { allowed: true },
    })
    assert.equal(allDone.phase, 'waiting-tools')
    assert.equal(allDone.toolCalls[0].approval?.status, 'denied')
    assert.equal(allDone.toolCalls[1].approval?.status, 'allowed')

    // A terminal run must not be re-opened by a late approval frame.
    const finished = reducer({ ...base, phase: 'completed' }, {
        type: 'tool-approval-requested',
        callId: 'call-1',
        request: { title: 't', message: 'm' },
    })
    assert.equal(finished.phase, 'completed', 'a terminal run stays terminal')
    assert.equal(finished.toolCalls[0].approval?.status, 'pending', 'the record still mirrors the attempt')

    // A replayed run.suspended frame (attach/reconnect) must not silently drop
    // the attention state while the approval card is still on screen.
    const replayedSuspend = reducer(requested, {
        type: 'event',
        event: { seq: 9, type: 'run.suspended', reason: 'waiting_tools', pendingCallIds: ['call-1'] },
    })
    assert.equal(replayedSuspend.phase, 'waiting-approval', 'the card keeps the run parked on the user')
    assert.equal(replayedSuspend.suspendReason, 'tool_approval')
}

async function checkExecutorInjectsCallBoundApproval(): Promise<void> {
    const seen: Array<{ callId: string; title: string }> = []
    const executor = new EditorToolExecutor({
        resolveTools: () => ({
            needsApproval: {
                description: 'asks first',
                inputSchema: {},
                execute: async (_args, callId, context) => {
                    const decision = await context!.requestApproval!({
                        title: '危险写入',
                        message: '会修改文档',
                    })
                    return { callId, decision }
                },
            },
        }),
        requestApproval: async (callId, request) => {
            seen.push({ callId, title: request.title })
            return { allowed: true, note: 'go' }
        },
    })

    const outcome = await executor.execute('call-42', 'needsApproval', {})
    assert.equal(outcome.ok, true)
    assert.deepEqual(seen, [{ callId: 'call-42', title: '危险写入' }], 'the channel must be bound to the callId')
    assert.deepEqual(outcome.result, { callId: 'call-42', decision: { allowed: true, note: 'go' } })
}

async function checkExecutorFailsClosedWithoutChannel(): Promise<void> {
    const executor = new EditorToolExecutor({
        resolveTools: () => ({
            needsApproval: {
                description: 'asks first',
                inputSchema: {},
                execute: async (_args, _callId, context) => {
                    const decision = await context!.requestApproval!({ title: 't', message: 'm' })
                    return decision
                },
            },
        }),
    })
    const outcome = await executor.execute('call-1', 'needsApproval', {})
    assert.equal(outcome.ok, true)
    const decision = outcome.result as ToolApprovalDecision
    assert.equal(decision.allowed, false, 'no host channel must mean "denied", never "allowed"')
    assert.match((decision as { reason: string }).reason, /不支持人工审批/)

    // A throwing channel is also a denial, with the error surfaced.
    const throwing = new EditorToolExecutor({
        resolveTools: () => ({
            needsApproval: {
                description: 'asks first',
                inputSchema: {},
                execute: async (_args, _callId, context) => context!.requestApproval!({ title: 't', message: 'm' }),
            },
        }),
        requestApproval: async () => { throw new Error('broken bridge') },
    })
    const thrown = await throwing.execute('call-2', 'needsApproval', {})
    const thrownDecision = thrown.result as { allowed: boolean; reason: string }
    assert.equal(thrownDecision.allowed, false)
    assert.match(thrownDecision.reason, /审批通道失败/)
}

async function main(): Promise<void> {
    await checkRequestResolvesOnDecide()
    await checkConcurrentRequestsShareOnePrompt()
    await checkTimeoutAutoDenies()
    await checkCancelScopesAndCancelAll()
    await checkBlockLevelNeverPrompts()
    checkSnapshotStability()
    checkStateMachineApprovalLifecycle()
    await checkExecutorInjectsCallBoundApproval()
    await checkExecutorFailsClosedWithoutChannel()
    console.log('tool-approval checks passed')
}

void main()
