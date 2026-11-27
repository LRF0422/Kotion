/**
 * Off-screen session manager checks — the stability guarantees behind
 * "the agent often cannot get an editor".
 *
 * The host (React) is simulated: `markReady` / `markError` are exactly what
 * `OffscreenEditorHost` calls. The manager must never hand out a destroyed
 * editor, must reset a stale ready record to a NEW generation, and must ignore
 * late callbacks from a superseded generation.
 *
 * Run with: pnpm --filter @kn/core check:offscreen
 */

import {
    offscreenSessionManager as manager,
    setAcquireTimeoutMs,
} from './session-manager'

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message)
}

const live = (id = 'editor'): any => ({ id, isDestroyed: false })
const dead = (id = 'editor'): any => ({ id, isDestroyed: true })
const flush = async (): Promise<void> => { /* no pending ops in these checks */ }

const generationOf = (pageId: string): number | undefined =>
    manager.getSessions().find(session => session.pageId === pageId)?.generation

async function checkPendingResolvesOnReady(): Promise<void> {
    const pending = manager.acquire('a')
    const editor = live('a')
    manager.markReady('a', { editor, flush })
    const handle = await pending
    assert(handle.editor === editor, 'acquire resolves the editor the host reported')
    handle.release()
}

async function checkDeadReadyRecordIsRebuilt(): Promise<void> {
    // Make the page ready, then destroy the editor without telling the manager
    // (HMR/remount does exactly this).
    const first = manager.acquire('b')
    const oldEditor = live('b')
    manager.markReady('b', { editor: oldEditor, flush })
    const oldHandle = await first
    oldHandle.release()
    const oldGeneration = generationOf('b')
    assert(typeof oldGeneration === 'number', 'the ready record has a generation')
    oldEditor.isDestroyed = true

    // Acquiring again must NOT return the dead editor: it drops the stale
    // record, forces a new generation and waits for the host to remount.
    let resolved = false
    const next = manager.acquire('b').then(handle => { resolved = true; return handle })
    await new Promise(resolve => setTimeout(resolve, 30))
    assert(resolved === false, 'a stale ready record is not handed out')

    const newGeneration = generationOf('b')
    assert(newGeneration !== oldGeneration, 'the stale record was replaced by a new generation')
    const newEditor = live('b2')

    // A late callback from the superseded mount must be ignored.
    manager.markReady('b', { editor: live('old-late'), flush }, oldGeneration)
    manager.markError('b', new Error('old mount teardown'), oldGeneration)
    assert(resolved === false, 'late callbacks from the old generation are ignored')

    manager.markReady('b', { editor: newEditor, flush }, newGeneration)
    const handle = await next
    assert(handle.editor === newEditor, 'the rebuilt generation is what the caller receives')
    handle.release()
}

async function checkDeadEditorReportIsIgnored(): Promise<void> {
    const pending = manager.acquire('c')
    manager.markReady('c', { editor: dead('c'), flush })
    let resolved = false
    void pending.then(() => { resolved = true }).catch(() => { /* timeout expected */ })
    await new Promise(resolve => setTimeout(resolve, 30))
    assert(resolved === false, 'a destroyed editor can never mark a session ready')

    const editor = live('c2')
    manager.markReady('c', { editor, flush })
    const handle = await pending
    assert(handle.editor === editor, 'a later live report still resolves the session')
    handle.release()
}

async function checkStaleHandleDoesNotStealRef(): Promise<void> {
    // Hold a lease, destroy its editor, then rebuild the session for another
    // caller. Releasing the OLD handle must not decrement the NEW record: that
    // used to make the fresh session idle-eligible and kill it under the live
    // consumer.
    const first = manager.acquire('f')
    const oldEditor = live('f')
    manager.markReady('f', { editor: oldEditor, flush })
    const oldHandle = await first
    oldEditor.isDestroyed = true

    const second = manager.acquire('f')
    await new Promise(resolve => setTimeout(resolve, 20))
    const generation = generationOf('f')
    const newEditor = live('f2')
    manager.markReady('f', { editor: newEditor, flush }, generation)
    const newHandle = await second

    oldHandle.release()
    // The new record still has one live holder, so destroyIdle must refuse.
    manager.destroyIdle('f')
    const third = await manager.acquire('f')
    assert(third.editor === newEditor, 'a stale release did not kill the rebuilt session')
    third.release()
    newHandle.release()
}

async function checkMarkErrorFailsWaitersAndAllowsRetry(): Promise<void> {
    const pending = manager.acquire('d')
    let message = ''
    void pending.catch(error => { message = error.message })
    manager.markError('d', new Error('room unavailable'))
    await new Promise(resolve => setTimeout(resolve, 0))
    assert(message === 'room unavailable', 'markError rejects the parked caller with the reason')
    assert(generationOf('d') === undefined, 'a failed session is removed from the registry')

    const retry = manager.acquire('d')
    const editor = live('d2')
    manager.markReady('d', { editor, flush })
    const handle = await retry
    assert(handle.editor === editor, 'a failed page can be acquired again')
    handle.release()
}

async function checkClosingRecordIsNotHandedOut(): Promise<void> {
    const first = manager.acquire('e')
    const oldEditor = live('e')
    manager.markReady('e', { editor: oldEditor, flush })
    const oldHandle = await first
    oldHandle.release() // refCount 0 -> eligible for destroyIdle

    manager.destroyIdle('e')
    // Acquire in the flush window: it must wait for the closing record instead
    // of returning the editor that is about to unmount.
    const next = manager.acquire('e')
    await new Promise(resolve => setTimeout(resolve, 10))
    const generation = generationOf('e')
    assert(typeof generation === 'number', 'the replacement record is created after the close')
    const editor = live('e2')
    manager.markReady('e', { editor, flush }, generation)
    const handle = await next
    assert(handle.editor !== oldEditor, 'the closing editor is never returned')
    assert(handle.editor === editor, 'the fresh session is returned')
    handle.release()
}

async function main(): Promise<void> {
    setAcquireTimeoutMs(1_500)
    await checkPendingResolvesOnReady()
    await checkDeadReadyRecordIsRebuilt()
    await checkDeadEditorReportIsIgnored()
    await checkStaleHandleDoesNotStealRef()
    await checkMarkErrorFailsWaitersAndAllowsRetry()
    await checkClosingRecordIsNotHandedOut()
    await manager.destroyAll()
    console.log('offscreen session-manager checks passed')
}

void main().catch(error => {
    console.error(error)
    process.exitCode = 1
})