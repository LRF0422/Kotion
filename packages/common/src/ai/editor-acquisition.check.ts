/**
 * Editor acquisition checks — the "never hand out a dead editor" contract.
 *
 * Pure logic: a fake bridge stands in for the hidden session engine and the
 * app-global claim registry is driven directly.
 *
 * Run with: pnpm --filter @kn/common check:editor-acquisition
 */

import { strict as assert } from 'node:assert'
import { acquireLiveEditorForPage, waitForAgentEditor } from './editor-acquisition'
import { clearAgentEditors, registerAgentEditor } from './agent-editor-registry'
import {
    clearOffscreenEditorBridge,
    setOffscreenEditorBridge,
    type OffscreenEditorHandle,
} from './offscreen-editor-bridge'

const live = (id = 'editor'): any => ({ id, isDestroyed: false })
const dead = (id = 'editor'): any => ({ id, isDestroyed: true })

interface FakeHandle extends OffscreenEditorHandle {
    releasedTimes: number
}

const fakeHandle = (pageId: string, editor: any): FakeHandle => {
    const handle: FakeHandle = {
        pageId,
        editor,
        releasedTimes: 0,
        flush: async () => { /* no pending ops */ },
        release: () => { handle.releasedTimes += 1 },
    }
    return handle
}

async function main(): Promise<void> {
    clearAgentEditors()

    // A visible claim always wins; the hidden engine is never asked.
    {
        const claimed = live('claim')
        registerAgentEditor({ pageId: 'p1', editor: claimed })
        let bridgeCalls = 0
        setOffscreenEditorBridge({
            acquire: async () => {
                bridgeCalls += 1
                return fakeHandle('p1', live('hidden'))
            },
        })
        const acquired = await acquireLiveEditorForPage('p1')
        assert.equal(acquired.source, 'claim')
        assert.equal(acquired.editor, claimed)
        assert.equal(bridgeCalls, 0, 'a claimed page must not spawn a hidden writer')
        clearAgentEditors()
    }

    // A dead hidden handle is released and retried; the live retry wins.
    {
        const first = fakeHandle('p2', dead('dead'))
        const second = fakeHandle('p2', live('live'))
        let bridgeCalls = 0
        setOffscreenEditorBridge({
            acquire: async () => {
                bridgeCalls += 1
                return bridgeCalls === 1 ? first : second
            },
            destroyIdle: () => { /* the engine would drop the dead session */ },
        })
        const acquired = await acquireLiveEditorForPage('p2', { attempts: 2, retryDelayMs: 0 })
        assert.equal(bridgeCalls, 2, 'a destroyed editor is retried once')
        assert.equal(first.releasedTimes, 1, 'the dead handle is released')
        assert.equal(acquired.source, 'hidden')
        assert.equal(acquired.editor, second.editor)
    }

    // A visible claim that appears WHILE the hidden session is acquiring wins,
    // and the hidden lease is dropped instead of being handed out.
    {
        const late = live('late-claim')
        const hidden = fakeHandle('p3', live('hidden'))
        setOffscreenEditorBridge({
            acquire: async () => {
                registerAgentEditor({ pageId: 'p3', editor: late })
                return hidden
            },
        })
        const acquired = await acquireLiveEditorForPage('p3')
        assert.equal(acquired.source, 'claim')
        assert.equal(acquired.editor, late)
        assert.equal(hidden.releasedTimes, 1, 'the hidden lease loses to the late claim')
        clearAgentEditors()
    }

    // A host error (component page, read-only, trash, no sync) is reported
    // immediately; retrying a permanent reason only wastes the model's time.
    {
        let bridgeCalls = 0
        setOffscreenEditorBridge({
            acquire: async () => {
                bridgeCalls += 1
                throw new Error('这是「看板」整页组件页面，没有文档正文')
            },
        })
        await assert.rejects(
            acquireLiveEditorForPage('p4', { attempts: 3, retryDelayMs: 0 }),
            /整页组件/,
        )
        assert.equal(bridgeCalls, 1, 'permanent failures are not retried')
    }

    // A transient sync failure is rebuilt once; permanent reasons are not.
    {
        let bridgeCalls = 0
        const liveHandle = fakeHandle('p4b', live('recovered'))
        setOffscreenEditorBridge({
            acquire: async () => {
                bridgeCalls += 1
                if (bridgeCalls === 1) {
                    throw new Error('Collaboration room did not sync; refusing to edit the page offline')
                }
                return liveHandle
            },
        })
        const acquired = await acquireLiveEditorForPage('p4b', { attempts: 1, retryDelayMs: 0 })
        assert.equal(bridgeCalls, 2, 'a transient sync failure gets one rebuild')
        assert.equal(acquired.editor, liveHandle.editor)
    }

    // No bridge and no claim: fail closed with a reason.
    {
        clearOffscreenEditorBridge()
        await assert.rejects(acquireLiveEditorForPage('p5'), /不支持离屏编辑器/)
    }

    // A claim published one render later is awaited, not raced.
    {
        const late = live('delayed-claim')
        const waiting = waitForAgentEditor('p6', 500, 10)
        setTimeout(() => {
            registerAgentEditor({ pageId: 'p6', editor: late })
        }, 20)
        assert.equal(await waiting, late)
        clearAgentEditors()
    }

    clearAgentEditors()
    clearOffscreenEditorBridge()
    console.log('editor acquisition checks passed')
}

void main().catch(error => {
    console.error(error)
    process.exitCode = 1
})