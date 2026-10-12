/**
 * `SpacePageLocalStore` over the desktop capability bridge.
 *
 * The main process answers `spacepage.*` with a `{ok, value} | {ok, code,
 * message}` envelope (Electron flattens a thrown handler error into a string,
 * which would lose the code). This module translates the envelope back into
 * values and {@link LocalStoreError}s, so the local-first service sees exactly
 * the contract declared in `@kn/common` and cannot tell an IPC hop from an
 * in-process call.
 *
 * `createSpacePageBridge` returns `undefined` when the build exposes no
 * `spacepage.*` capabilities — the web app, or a desktop build whose database
 * could not be opened — so `@kn/core` can register the cloud-only service.
 */

import type {
    BlockId,
    DesktopCapability,
    DesktopCapabilityContract,
    DesktopSpacePageEnvelope,
    LocalBlockQuery,
    LocalBlockRecord,
    LocalDocumentRecord,
    LocalHistoryDraft,
    LocalHistoryRecord,
    LocalMutationCount,
    LocalOutboxDraft,
    LocalOutboxEntity,
    LocalOutboxEntry,
    LocalOutboxQuery,
    LocalOutboxState,
    LocalPageQuery,
    LocalPageRecord,
    LocalSpaceQuery,
    LocalSpaceRecord,
    LocalStoreErrorCode,
    LocalStoreInfo,
    Revision,
    PageId,
    SpaceId,
    SpacePageLocalStore,
} from '@kn/common'
import { LocalStoreError } from '@kn/common'
import type { StorageHostBridge } from './storage-bridge'

/** Capabilities that must all be present for `desktop.spacePage` to exist. */
const SPACEPAGE_CAPABILITIES: DesktopCapability[] = [
    'spacepage.info',
    'spacepage.getSpace',
    'spacepage.listSpaces',
    'spacepage.countSpaces',
    'spacepage.upsertSpaces',
    'spacepage.deleteSpaces',
    'spacepage.remapSpace',
    'spacepage.getPage',
    'spacepage.listPages',
    'spacepage.countPages',
    'spacepage.upsertPages',
    'spacepage.deletePages',
    'spacepage.remapPage',
    'spacepage.getDocument',
    'spacepage.upsertDocument',
    'spacepage.appendHistory',
    'spacepage.listHistory',
    'spacepage.getHistoryDocument',
    'spacepage.markHistorySynced',
    'spacepage.deleteHistory',
    'spacepage.getBlock',
    'spacepage.listBlocks',
    'spacepage.countBlocks',
    'spacepage.upsertBlocks',
    'spacepage.deleteBlocks',
    'spacepage.enqueue',
    'spacepage.listOutbox',
    'spacepage.countOutbox',
    'spacepage.claimOutbox',
    'spacepage.ackOutbox',
    'spacepage.failOutbox',
    'spacepage.retryOutbox',
    'spacepage.markSynced',
    'spacepage.getState',
    'spacepage.setState',
    'spacepage.clear',
]

/** Turn a failure envelope into the error the contract promises. */
function unwrap<T>(envelope: DesktopSpacePageEnvelope<T> | undefined, operation: string): T {
    if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
        if (envelope.ok) return envelope.value
        throw new LocalStoreError(envelope.code as LocalStoreErrorCode, envelope.message)
    }
    throw new LocalStoreError('LOCAL_STORE_IO', `${operation}: malformed reply from the desktop main process`)
}

export function createSpacePageBridge(
    host: StorageHostBridge,
    capabilities: readonly string[],
): SpacePageLocalStore | undefined {
    if (!SPACEPAGE_CAPABILITIES.every((capability) => capabilities.includes(capability))) return undefined

    const invoke = <C extends DesktopCapability>(
        capability: C,
        params?: DesktopCapabilityContract[C]['params'],
    ): Promise<DesktopCapabilityContract[C]['result']> =>
        host.invoke(capability, params) as Promise<DesktopCapabilityContract[C]['result']>

    // `info()` is what the main process actually knows about the backend; the
    // contract only promises `durable` for backends that survive a restart.
    let cachedInfo: LocalStoreInfo | undefined

    const store: SpacePageLocalStore = {
        get durable(): boolean {
            return cachedInfo?.durable ?? true
        },

        async info(): Promise<LocalStoreInfo> {
            if (cachedInfo) return cachedInfo
            cachedInfo = unwrap(await invoke('spacepage.info'), 'spacepage.info')
            return cachedInfo
        },

        async getSpace(spaceId: SpaceId): Promise<LocalSpaceRecord | null> {
            return unwrap(await invoke('spacepage.getSpace', { spaceId }), 'spacepage.getSpace')
        },
        async listSpaces(query?: LocalSpaceQuery): Promise<LocalSpaceRecord[]> {
            return unwrap(await invoke('spacepage.listSpaces', query), 'spacepage.listSpaces')
        },
        async countSpaces(query?: LocalSpaceQuery): Promise<number> {
            return unwrap(await invoke('spacepage.countSpaces', query), 'spacepage.countSpaces')
        },
        async upsertSpaces(records: LocalSpaceRecord[]): Promise<number> {
            return unwrap(await invoke('spacepage.upsertSpaces', { records }), 'spacepage.upsertSpaces')
        },
        async deleteSpaces(spaceIds: SpaceId[]): Promise<number> {
            return unwrap(await invoke('spacepage.deleteSpaces', { spaceIds }), 'spacepage.deleteSpaces')
        },
        async remapSpace(from: SpaceId, to: SpaceId): Promise<LocalMutationCount> {
            return unwrap(await invoke('spacepage.remapSpace', { from, to }), 'spacepage.remapSpace')
        },

        async getPage(pageId: PageId): Promise<LocalPageRecord | null> {
            return unwrap(await invoke('spacepage.getPage', { pageId }), 'spacepage.getPage')
        },
        async listPages(query?: LocalPageQuery): Promise<LocalPageRecord[]> {
            return unwrap(await invoke('spacepage.listPages', query), 'spacepage.listPages')
        },
        async countPages(query?: LocalPageQuery): Promise<number> {
            return unwrap(await invoke('spacepage.countPages', query), 'spacepage.countPages')
        },
        async upsertPages(records: LocalPageRecord[]): Promise<number> {
            return unwrap(await invoke('spacepage.upsertPages', { records }), 'spacepage.upsertPages')
        },
        async deletePages(pageIds: PageId[]): Promise<number> {
            return unwrap(await invoke('spacepage.deletePages', { pageIds }), 'spacepage.deletePages')
        },
        async remapPage(from: PageId, to: PageId): Promise<LocalMutationCount> {
            return unwrap(await invoke('spacepage.remapPage', { from, to }), 'spacepage.remapPage')
        },

        async getDocument(pageId: PageId): Promise<LocalDocumentRecord | null> {
            return unwrap(await invoke('spacepage.getDocument', { pageId }), 'spacepage.getDocument')
        },
        async upsertDocument(record: LocalDocumentRecord): Promise<void> {
            return unwrap(await invoke('spacepage.upsertDocument', { record }), 'spacepage.upsertDocument')
        },

        async appendHistory(input: LocalHistoryDraft): Promise<LocalHistoryRecord> {
            return unwrap(await invoke('spacepage.appendHistory', input as never), 'spacepage.appendHistory')
        },
        async listHistory(pageId: PageId, limit?: number): Promise<LocalHistoryRecord[]> {
            return unwrap(
                await invoke('spacepage.listHistory', limit === undefined ? { pageId } : { pageId, limit }),
                'spacepage.listHistory',
            )
        },
        async getHistoryDocument(pageId: PageId, rev: Revision): Promise<LocalHistoryRecord | null> {
            return unwrap(
                await invoke('spacepage.getHistoryDocument', { pageId, rev: String(rev) }),
                'spacepage.getHistoryDocument',
            )
        },
        async markHistorySynced(pageId: PageId, rev: Revision, remoteRev: Revision | null): Promise<boolean> {
            return unwrap(
                await invoke('spacepage.markHistorySynced', {
                    pageId,
                    rev: String(rev),
                    remoteRev: remoteRev === null ? null : String(remoteRev),
                }),
                'spacepage.markHistorySynced',
            )
        },
        async deleteHistory(pageId: PageId): Promise<number> {
            return unwrap(await invoke('spacepage.deleteHistory', { pageId }), 'spacepage.deleteHistory')
        },

        async getBlock(blockId: BlockId): Promise<LocalBlockRecord | null> {
            return unwrap(await invoke('spacepage.getBlock', { blockId }), 'spacepage.getBlock')
        },
        async listBlocks(query?: LocalBlockQuery): Promise<LocalBlockRecord[]> {
            return unwrap(await invoke('spacepage.listBlocks', query), 'spacepage.listBlocks')
        },
        async countBlocks(query?: LocalBlockQuery): Promise<number> {
            return unwrap(await invoke('spacepage.countBlocks', query), 'spacepage.countBlocks')
        },
        async upsertBlocks(records: LocalBlockRecord[]): Promise<number> {
            return unwrap(await invoke('spacepage.upsertBlocks', { records }), 'spacepage.upsertBlocks')
        },
        async deleteBlocks(blockIds: BlockId[]): Promise<number> {
            return unwrap(await invoke('spacepage.deleteBlocks', { blockIds }), 'spacepage.deleteBlocks')
        },

        async enqueue(entries: LocalOutboxDraft[]): Promise<number[]> {
            return unwrap(await invoke('spacepage.enqueue', { entries }), 'spacepage.enqueue')
        },
        async listOutbox(query?: LocalOutboxQuery): Promise<LocalOutboxEntry[]> {
            return unwrap(await invoke('spacepage.listOutbox', query), 'spacepage.listOutbox')
        },
        async claimOutbox(query?: { limit?: number }): Promise<LocalOutboxEntry[]> {
            return unwrap(await invoke('spacepage.claimOutbox', query), 'spacepage.claimOutbox')
        },
        async countOutbox(state?: LocalOutboxState): Promise<number> {
            return unwrap(
                await invoke('spacepage.countOutbox', state === undefined ? undefined : { state }),
                'spacepage.countOutbox',
            )
        },
        async ackOutbox(ids: number[]): Promise<number> {
            return unwrap(await invoke('spacepage.ackOutbox', { ids }), 'spacepage.ackOutbox')
        },
        async failOutbox(id: number, error: string): Promise<void> {
            return unwrap(await invoke('spacepage.failOutbox', { id, error }), 'spacepage.failOutbox')
        },
        async retryOutbox(ids?: number[]): Promise<number> {
            return unwrap(await invoke('spacepage.retryOutbox', ids === undefined ? undefined : { ids }), 'spacepage.retryOutbox')
        },
        async markSynced(entity: LocalOutboxEntity, ids: string[]): Promise<number> {
            return unwrap(await invoke('spacepage.markSynced', { entity, ids }), 'spacepage.markSynced')
        },

        async getState<T = unknown>(key: string): Promise<T | null> {
            return unwrap(await invoke('spacepage.getState', { key }), 'spacepage.getState') as T | null
        },
        async setState(key: string, value: unknown): Promise<void> {
            return unwrap(await invoke('spacepage.setState', { key, value }), 'spacepage.setState')
        },

        async clear(): Promise<void> {
            return unwrap(await invoke('spacepage.clear'), 'spacepage.clear')
        },
    }

    return store
}
