import { strict as assert } from 'node:assert'
import { RunLock, RunStore } from './browser-persistence'

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

async function main(): Promise<void> {
    await checkConversationLockOwnership()
    checkPersistedToolResults()
    checkToolResultPersistenceFallback()
    console.log('agent browser-persistence checks passed')
}

void main()
