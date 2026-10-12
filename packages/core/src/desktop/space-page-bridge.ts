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
    'spacepage.getBlock',
    'spacepage.listBlocks',
    'spacepage.countBlocks',
    'spacepage.upsertBlocks',
    'spacepage.deleteBlocks',
    'spacepage.enqueue',
    'spacepage.listOutbox',
    'spacepage.countOutbox',
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

    const store: SpacePageLocalStore = {
        durable: true,

        async info(): Promise<LocalStoreInfo> {
            return unwrap(await invoke('spacepage.info'), 'spacepage.info')
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
