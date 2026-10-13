import { strict as assert } from 'node:assert'
import { AgentClient } from './client'
import type { AgentFetch } from './transport'
import type { MemoryItem } from './types'

/**
 * The memory-management UI's whole contract with the backend is these five
 * calls. A URL typo here is invisible in the UI (it just renders an empty
 * list), so pin the query strings, methods and body shape.
 */

interface Recorded {
    url: string
    init?: RequestInit
}

function recordingClient(payload: unknown): { client: AgentClient; calls: Recorded[] } {
    const calls: Recorded[] = []
    const fetchImpl: AgentFetch = async (url, init) => {
        calls.push({ url, init })
        return new Response(
            JSON.stringify({ success: true, code: 200, data: payload }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    }
    return {
        client: new AgentClient({ transport: { fetch: fetchImpl, apiBase: '/api/agent/v1' } }),
        calls,
    }
}

const memory: MemoryItem = {
    memoryId: 'm-1',
    scope: 'u:7:s:9:p:5',
    type: 'preference',
    content: '用户偏好中文回复',
    importance: 80,
    tags: ['偏好'],
    createTime: 1_700_000_000_000,
    lastAccessTime: 1_700_000_100_000,
}

function queryOf(url: string): URLSearchParams {
    return new URLSearchParams(url.slice(url.indexOf('?') + 1))
}

async function checkBrowseSpansEveryScope(): Promise<void> {
    const { client, calls } = recordingClient({ memories: [memory], count: 1, total: 42 })

    const page = await client.listMemoryPage({ scope: '*', type: 'preference', offset: 20, limit: 10 })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url.startsWith('/api/agent/v1/memory?'), true, calls[0].url)
    const query = queryOf(calls[0].url)
    assert.equal(query.get('scope'), '*', 'a browse must span every scope, not just the user scope')
    assert.equal(query.get('type'), 'preference')
    assert.equal(query.get('offset'), '20')
    assert.equal(query.get('limit'), '10')
    assert.equal(query.get('query'), null, 'an empty search must not send a query')
    assert.deepEqual(page.items, [memory])
    assert.equal(page.count, 1)
    assert.equal(page.total, 42)
}

async function checkSearchIsKeywordScoped(): Promise<void> {
    const { client, calls } = recordingClient({ memories: [memory] })

    const items = await client.listMemory({ scope: '*', query: '中文' })

    const query = queryOf(calls[0].url)
    assert.equal(query.get('query'), '中文')
    assert.equal(query.get('limit'), '20', 'the default page size stays 20')
    assert.equal(query.get('offset'), null, 'an untouched offset is not sent')
    assert.deepEqual(items, [memory])
}

async function checkMissingFieldsDegradeSafely(): Promise<void> {
    // A backend that predates `total` (or an empty page) must not yield NaN.
    const { client } = recordingClient({})
    const page = await client.listMemoryPage({ scope: '*' })
    assert.deepEqual(page.items, [])
    assert.equal(page.count, 0)
    assert.equal(page.total, 0)
}

async function checkCreatePostsTheMemory(): Promise<void> {
    const { client, calls } = recordingClient(memory)

    const created = await client.createMemory({
        content: '用户偏好中文回复',
        type: 'preference',
        importance: 80,
        tags: ['偏好'],
    })

    assert.equal(calls[0].url, '/api/agent/v1/memory')
    assert.equal(calls[0].init?.method, 'POST')
    assert.equal(
        calls[0].init?.headers && (calls[0].init.headers as Record<string, string>)['Content-Type'],
        'application/json'
    )
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
        content: '用户偏好中文回复',
        type: 'preference',
        importance: 80,
        tags: ['偏好'],
    })
    assert.equal(created.memoryId, 'm-1')
}

async function checkPurgeAndSingleDeleteUseDelete(): Promise<void> {
    const { client, calls } = recordingClient({ removed: 7 })

    assert.equal(await client.purgeMemory(), 7)
    assert.equal(calls[0].url, '/api/agent/v1/memory')
    assert.equal(calls[0].init?.method, 'DELETE')

    await client.deleteMemory('m/1 2')
    assert.equal(calls[1].url, '/api/agent/v1/memory/m%2F1%202', 'the id must be URL-encoded')
    assert.equal(calls[1].init?.method, 'DELETE')
}

async function main(): Promise<void> {
    await checkBrowseSpansEveryScope()
    await checkSearchIsKeywordScoped()
    await checkMissingFieldsDegradeSafely()
    await checkCreatePostsTheMemory()
    await checkPurgeAndSingleDeleteUseDelete()
    console.log('memory-client.check: ok')
}

void main()
