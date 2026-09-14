import type {
    AgentDocumentBridge,
    AgentDocumentHandle,
    AgentDocumentMergeReport,
    DocJson,
} from "@kn/common"
import { mergeAgentDocument } from "@kn/common"
import { applyMergeOps } from "./merge-apply"

/**
 * Per-agent private documents (module-level singleton, no React).
 *
 * Owns the bookkeeping: which agents hold a forked document, the baseline they
 * forked from, and fork/commit/release. The editors themselves are created by
 * `AgentDocumentHost`, which subscribes here and mounts one hidden,
 * non-collaborative editor per record — that is what makes an agent's writes
 * private, so two agents (or an agent and the user) never write one document.
 */

/** Simultaneously forked agent documents; over the cap, forking fails loudly. */
const MAX_AGENT_DOCUMENTS = 8

interface Waiter {
    resolve: (handle: AgentDocumentHandle) => void
    reject: (error: Error) => void
}

interface DocRecord {
    owner: string
    pageId: string
    title?: string
    baseline: DocJson
    status: 'pending' | 'ready' | 'error'
    editor: any | null
    waiters: Waiter[]
}

const docs = new Map<string, DocRecord>()
const listeners = new Set<() => void>()

const notify = (): void => {
    listeners.forEach(listener => {
        try {
            listener()
        } catch {
            /* listener errors must not break the registry */
        }
    })
}

const buildHandle = (record: DocRecord): AgentDocumentHandle => ({
    owner: record.owner,
    pageId: record.pageId,
    editor: record.editor,
    baseline: record.baseline,
})

export const agentDocumentManager = {
    /**
     * Fork `sourceEditor`'s content into a private document for `owner`. Resolves
     * once the host has mounted the private editor.
     */
    fork(owner: string, pageId: string, sourceEditor: any, title?: string): Promise<AgentDocumentHandle> {
        if (!sourceEditor || typeof sourceEditor.getJSON !== 'function') {
            return Promise.reject(new Error('无法为本子 agent 创建私有文档：源编辑器不可用'))
        }
        const existing = docs.get(owner)
        if (existing) {
            agentDocumentManager.release(owner)
        }
        const active = [...docs.values()].filter(record => record.status !== 'error').length
        if (active >= MAX_AGENT_DOCUMENTS) {
            return Promise.reject(new Error(
                `并行的私有文档数已达上限（${MAX_AGENT_DOCUMENTS}）：该子 agent 回退到共享文档 + 写租约`
            ))
        }

        let baseline: DocJson
        try {
            baseline = sourceEditor.getJSON() as DocJson
        } catch (error) {
            return Promise.reject(error instanceof Error ? error : new Error(String(error)))
        }

        const record: DocRecord = {
            owner,
            pageId: String(pageId),
            title,
            baseline,
            status: 'pending',
            editor: null,
            waiters: [],
        }
        docs.set(owner, record)
        notify()

        return new Promise<AgentDocumentHandle>((resolve, reject) => {
            const timer = setTimeout(() => {
                const index = record.waiters.findIndex(waiter => waiter.reject === reject)
                if (index >= 0) record.waiters.splice(index, 1)
                if (docs.get(owner) === record) {
                    docs.delete(owner)
                    notify()
                }
                reject(new Error('私有文档创建超时（编辑器宿主未就绪）'))
            }, 15_000)
            record.waiters.push({
                resolve: handle => {
                    clearTimeout(timer)
                    resolve(handle)
                },
                reject: error => {
                    clearTimeout(timer)
                    reject(error)
                },
            })
        })
    },

    /** The private document held for `owner`, if it is ready. */
    get(owner: string): AgentDocumentHandle | null {
        const record = docs.get(owner)
        if (!record || record.status !== 'ready' || !record.editor) return null
        return buildHandle(record)
    },

    /** Baseline JSON the private document was forked from. */
    getBaseline(owner: string): DocJson | null {
        return docs.get(owner)?.baseline ?? null
    },

    /** Private document for an editor instance (reverse lookup). */
    ownerForEditor(editor: any): string | null {
        if (!editor) return null
        for (const record of docs.values()) {
            if (record.editor === editor) return record.owner
        }
        return null
    },

    /** Merge `owner`'s private document into `liveEditor`. */
    async commit(owner: string, liveEditor: any): Promise<AgentDocumentMergeReport | null> {
        const record = docs.get(owner)
        const handle = agentDocumentManager.get(owner)
        if (!record || !handle) return null
        if (!liveEditor || typeof liveEditor.getJSON !== 'function') {
            throw new Error('无法合并：目标编辑器不可用')
        }

        const result = mergeAgentDocument(record.baseline, handle.editor.getJSON(), liveEditor.getJSON())
        const outcome = result.ops.length > 0 ? applyMergeOps(liveEditor, result.ops) : { applied: 0, failed: [] }
        const conflicts = result.conflicts.length + outcome.failed.length
        const parts = [`${outcome.applied} 块已合并`]
        if (result.conflicts.length > 0) parts.push(`${result.conflicts.length} 块冲突（未覆盖）`)
        if (outcome.failed.length > 0) parts.push(`${outcome.failed.length} 块目标已不存在`)
        if (result.reorderDetected) parts.push('顺序调整未应用')

        return {
            applied: outcome.applied,
            conflicts,
            reorderDetected: result.reorderDetected,
            summary: parts.join('，'),
            details: result.conflicts,
        }
    },

    /** Destroy a private document; the host unmounts its editor. */
    release(owner: string): void {
        const record = docs.get(owner)
        if (!record) return
        docs.delete(owner)
        const error = new Error('私有文档已释放')
        record.waiters.splice(0).forEach(waiter => waiter.reject(error))
        notify()
    },

    /** Owners whose documents the host must currently mount. */
    list(): Array<{ owner: string; pageId: string; baseline: DocJson }> {
        return [...docs.values()]
            .filter(record => record.status !== 'error')
            .map(record => ({ owner: record.owner, pageId: record.pageId, baseline: record.baseline }))
    },

    /** Host callback: the private editor is mounted and ready. */
    markReady(owner: string, editor: any): void {
        const record = docs.get(owner)
        if (!record) return
        record.status = 'ready'
        record.editor = editor
        const waiters = record.waiters.splice(0)
        const handle = buildHandle(record)
        waiters.forEach(waiter => waiter.resolve(handle))
        notify()
    },

    /** Host callback: mounting the private editor failed. */
    markError(owner: string, error: Error): void {
        const record = docs.get(owner)
        if (!record) return
        record.status = 'error'
        docs.delete(owner)
        const waiters = record.waiters.splice(0)
        notify()
        waiters.forEach(waiter => waiter.reject(error))
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener)
        return () => {
            listeners.delete(listener)
        }
    },

    /** Release everything (host unmount). */
    releaseAll(): void {
        for (const owner of [...docs.keys()]) {
            agentDocumentManager.release(owner)
        }
    },
}

/**
 * Bridge implementation handed to `@kn/common`. `liveEditor` resolution stays
 * with the caller (the chat surface knows which editor shows which page).
 */
export const agentDocumentBridge: AgentDocumentBridge = {
    fork: (owner, pageId, sourceEditor, title) =>
        agentDocumentManager.fork(owner, pageId, sourceEditor, title),
    get: owner => agentDocumentManager.get(owner),
    commit: (owner, liveEditor) => agentDocumentManager.commit(owner, liveEditor),
    release: owner => agentDocumentManager.release(owner),
}
