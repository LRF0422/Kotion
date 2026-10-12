/**
 * Local-first domain capabilities (`spacepage.*`).
 *
 * Same shape as `../storage/index.ts` on purpose: the handlers never throw, they
 * answer with a discriminated envelope, because Electron flattens a rejected
 * `ipcMain.handle` into a message string and the renderer needs the *code* in
 * order to decide between "use the local database" and "fall back to the cloud".
 *
 * When the database could not be opened the app still starts: every capability
 * answers `LOCAL_STORE_UNAVAILABLE` and `@kn/core` registers the plain HTTP
 * `spacePageService` instead of the local-first one.
 */

import { ipcMain } from 'electron';
import { SqliteDomainStore, type DomainStoreOptions } from './store';
import { DomainError, type DomainErrorCode } from './types';
import type { StorageRuntime } from '../storage/index';

export type DomainEnvelope<T> =
    | { ok: true; value: T }
    | { ok: false; code: DomainErrorCode; message: string };

export interface DomainRuntime {
    /** The repository, or `null` when the database could not be opened. */
    readonly store: SqliteDomainStore | null;
    readonly location: string;
    readonly failure?: string;
}

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

/**
 * Build the repository over the connection the storage layer already opened.
 * Sharing one connection means one writer, shared WAL and a single `will-quit`
 * close — there is no second database file to keep consistent.
 */
export function createDomainRuntime(
    runtime: Pick<StorageRuntime, 'db' | 'location' | 'failure'>,
    options: Omit<DomainStoreOptions, 'location'> = {},
): DomainRuntime {
    if (!runtime.db) {
        return { store: null, location: runtime.location, failure: runtime.failure };
    }
    return {
        store: new SqliteDomainStore(runtime.db, { location: runtime.location, ...options }),
        location: runtime.location,
    };
}

function run<T>(runtime: DomainRuntime, operation: string, fn: (store: SqliteDomainStore) => T): DomainEnvelope<T> {
    if (!runtime.store) {
        return {
            ok: false,
            code: 'LOCAL_STORE_UNAVAILABLE',
            message: runtime.failure ?? 'desktop local store is unavailable',
        };
    }
    try {
        return { ok: true, value: fn(runtime.store) };
    } catch (error) {
        if (error instanceof DomainError) {
            return { ok: false, code: error.code, message: error.message };
        }
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[domain] ${operation} failed:`, message);
        return { ok: false, code: 'LOCAL_STORE_IO', message: `${operation}: ${message}` };
    }
}

/** Every capability this module registers. Kept in sync with the preload list. */
export const SPACEPAGE_CAPABILITIES = [
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
] as const;

export function setupDomainHandlers(
    runtime: StorageRuntime,
    options: Omit<DomainStoreOptions, 'location'> = {},
): DomainRuntime {
    const domain = createDomainRuntime(runtime, options);

    const handle = <T>(capability: string, fn: (params: Record<string, unknown>) => DomainEnvelope<T>): void => {
        ipcMain.handle('desktop:' + capability, (_event, raw) => fn(asRecord(raw)));
    };

    handle('spacepage.info', () => run(domain, 'spacepage.info', (store) => store.info()));

    handle('spacepage.getSpace', (params) =>
        run(domain, 'spacepage.getSpace', (store) => store.getSpace(asString(params.spaceId))),
    );
    handle('spacepage.listSpaces', (params) =>
        run(domain, 'spacepage.listSpaces', (store) => store.listSpaces(params)),
    );
    handle('spacepage.countSpaces', (params) =>
        run(domain, 'spacepage.countSpaces', (store) => store.countSpaces(params)),
    );
    handle('spacepage.upsertSpaces', (params) =>
        run(domain, 'spacepage.upsertSpaces', (store) => store.upsertSpaces(params.records)),
    );
    handle('spacepage.deleteSpaces', (params) =>
        run(domain, 'spacepage.deleteSpaces', (store) => store.deleteSpaces(params.spaceIds)),
    );
    handle('spacepage.remapSpace', (params) =>
        run(domain, 'spacepage.remapSpace', (store) => store.remapSpace(params.from, params.to)),
    );

    handle('spacepage.getPage', (params) =>
        run(domain, 'spacepage.getPage', (store) => store.getPage(asString(params.pageId))),
    );
    handle('spacepage.listPages', (params) => run(domain, 'spacepage.listPages', (store) => store.listPages(params)));
    handle('spacepage.countPages', (params) => run(domain, 'spacepage.countPages', (store) => store.countPages(params)));
    handle('spacepage.upsertPages', (params) =>
        run(domain, 'spacepage.upsertPages', (store) => store.upsertPages(params.records)),
    );
    handle('spacepage.deletePages', (params) =>
        run(domain, 'spacepage.deletePages', (store) => store.deletePages(params.pageIds)),
    );
    handle('spacepage.remapPage', (params) =>
        run(domain, 'spacepage.remapPage', (store) => store.remapPage(params.from, params.to)),
    );

    handle('spacepage.getDocument', (params) =>
        run(domain, 'spacepage.getDocument', (store) => store.getDocument(asString(params.pageId))),
    );
    handle('spacepage.upsertDocument', (params) =>
        run(domain, 'spacepage.upsertDocument', (store) => store.upsertDocument(params.record)),
    );

    handle('spacepage.getBlock', (params) =>
        run(domain, 'spacepage.getBlock', (store) => store.getBlock(asString(params.blockId))),
    );
    handle('spacepage.listBlocks', (params) => run(domain, 'spacepage.listBlocks', (store) => store.listBlocks(params)));
    handle('spacepage.countBlocks', (params) =>
        run(domain, 'spacepage.countBlocks', (store) => store.countBlocks(params)),
    );
    handle('spacepage.upsertBlocks', (params) =>
        run(domain, 'spacepage.upsertBlocks', (store) => store.upsertBlocks(params.records)),
    );
    handle('spacepage.deleteBlocks', (params) =>
        run(domain, 'spacepage.deleteBlocks', (store) => store.deleteBlocks(params.blockIds)),
    );

    handle('spacepage.enqueue', (params) => run(domain, 'spacepage.enqueue', (store) => store.enqueue(params.entries)));
    handle('spacepage.listOutbox', (params) =>
        run(domain, 'spacepage.listOutbox', (store) => store.listOutbox(params)),
    );
    handle('spacepage.countOutbox', (params) =>
        run(domain, 'spacepage.countOutbox', (store) => store.countOutbox((params as { state?: unknown }).state)),
    );
    handle('spacepage.ackOutbox', (params) =>
        run(domain, 'spacepage.ackOutbox', (store) => store.ackOutbox(params.ids)),
    );
    handle('spacepage.failOutbox', (params) =>
        run(domain, 'spacepage.failOutbox', (store) => store.failOutbox(params.id, params.error)),
    );
    handle('spacepage.retryOutbox', (params) =>
        run(domain, 'spacepage.retryOutbox', (store) => store.retryOutbox(params.ids)),
    );
    handle('spacepage.markSynced', (params) =>
        run(domain, 'spacepage.markSynced', (store) => store.markSynced(params.entity, params.ids)),
    );

    handle('spacepage.getState', (params) =>
        run(domain, 'spacepage.getState', (store) => store.getState(asString(params.key))),
    );
    handle('spacepage.setState', (params) =>
        run(domain, 'spacepage.setState', (store) => {
            store.setState(asString(params.key), params.value);
            return undefined;
        }),
    );

    handle('spacepage.clear', () =>
        run(domain, 'spacepage.clear', (store) => {
            store.clear();
            return undefined;
        }),
    );

    console.log('[domain] local-first capability handlers ready' + (domain.store ? '' : ' (degraded)'));
    return domain;
}
