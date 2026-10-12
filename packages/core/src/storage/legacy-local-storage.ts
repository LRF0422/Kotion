/**
 * One-time import of pre-storage `localStorage` data into the storage service.
 *
 * Why: the app has years of `localStorage` writes behind it. When the desktop
 * app started offering SQLite, that history must not silently disappear the
 * first time a user clears their web cache — or the first time a consumer is
 * switched over to the storage service.
 *
 * Rules:
 *  - **Non-destructive.** Legacy keys are left in place; consumers keep working
 *    until they are migrated one by one.
 *  - **Idempotent.** A marker in `app.migration` records the version that ran,
 *    so the import happens once per database.
 *  - **Never overwrites.** A key that already exists in storage wins — storage
 *    is newer by definition.
 *  - **Desktop only.** On the web the storage service *is* `localStorage`;
 *    copying it onto itself is pointless (see {@link shouldImportLegacyData}).
 *
 * Deliberate exclusions, and why:
 *  - auth tokens (`knowledge-access-token`, …) — a session, not user data.
 *  - theme / language / layout keys (`vite-ui-theme`, `kn-ui-style`,
 *    `kn-color-scheme`, `language`, `toc-pinned`, `kn:space-tree-collapsed`) —
 *    these are read synchronously on the first render to avoid a flash of the
 *    wrong theme; an async SQLite read would reintroduce it.
 *  - `agentcore:run:*` / `agentcore:tool-results:*` — the agent SDK's crash
 *    journals are a *synchronous* interface (`AgentRunStore`) with a TTL; they
 *    need a write-behind adapter before they can move, which is a separate
 *    change.
 *  - `kn-ai-chat-sessions-index` and friends are imported as a seed, but the
 *    panel keeps reading its synchronous cache until that consumer migrates.
 */

import { logger, storageKey, type StorageService } from '@kn/common'

/** One legacy key and where it belongs in the storage service. */
export interface LegacyStorageImport {
    /** The `localStorage` key written by the pre-storage eras. */
    legacyKey: string
    /** Target namespace (`app.*` or `plugin.<key>.*`). */
    namespace: string
    /** Target key inside that namespace. */
    key: string
    /** `json` parses the raw string; `raw` stores it as a string. */
    parse: 'json' | 'raw'
    /** Why this key is worth keeping, for the next reader of this table. */
    note: string
}

/** Namespace holding the import marker and any future migration bookkeeping. */
export const MIGRATION_NAMESPACE = 'app.migration'

/** Key holding the marker; its `version` gates re-runs. */
export const LEGACY_IMPORT_MARKER_KEY = 'legacy-local-storage'

/** Bump when the table below gains entries that existing databases lack. */
export const LEGACY_IMPORT_VERSION = 1

export const LEGACY_STORAGE_IMPORTS: LegacyStorageImport[] = [
    {
        legacyKey: 'kn.plugin-studio.projects.v1',
        namespace: 'plugin.plugin-studio',
        key: 'projects',
        parse: 'json',
        note: 'plugin studio project list (paths the user opened)',
    },
    {
        legacyKey: 'kn-ai-chat-sessions-index',
        namespace: 'plugin.ai',
        key: 'chat-sessions-index',
        parse: 'json',
        note: 'AI panel session metadata cache',
    },
    {
        legacyKey: 'kn-ai-chat-active-session',
        namespace: 'plugin.ai',
        key: 'chat-active-session',
        parse: 'raw',
        note: 'last opened AI chat session',
    },
    {
        legacyKey: 'kn-ai-chat-messages',
        namespace: 'plugin.ai',
        key: 'legacy-chat-messages',
        parse: 'json',
        note: 'pre-engine single-session transcript (import source)',
    },
    {
        legacyKey: 'agent-conversation-id',
        namespace: 'plugin.ai',
        key: 'legacy-conversation-id',
        parse: 'raw',
        note: 'pre-engine conversation id, used by the one-time importer',
    },
    {
        legacyKey: 'kn_chat_model',
        namespace: 'plugin.ai',
        key: 'model',
        parse: 'raw',
        note: 'preferred chat model',
    },
    {
        legacyKey: 'kn_chat_model_params',
        namespace: 'plugin.ai',
        key: 'model-params',
        parse: 'json',
        note: 'per-model generation parameters',
    },
    {
        legacyKey: 'kn_chat_mode',
        namespace: 'plugin.ai',
        key: 'mode',
        parse: 'raw',
        note: 'chat mode (agent / ask / …)',
    },
    {
        legacyKey: 'kn:recent-pages',
        namespace: 'app.recent-pages',
        key: 'list',
        parse: 'json',
        note: 'recently opened pages',
    },
    {
        legacyKey: 'kn_tour_progress',
        namespace: 'app.tour',
        key: 'progress',
        parse: 'json',
        note: 'tour progress, so onboarding does not restart',
    },
    {
        legacyKey: 'hasCompletedWelcome',
        namespace: 'app.tour',
        key: 'completed-welcome',
        parse: 'raw',
        note: 'welcome-flow completion flag',
    },
    {
        legacyKey: 'kn:recent-emojis',
        namespace: 'app.editor',
        key: 'recent-emojis',
        parse: 'json',
        note: 'recently used emoji',
    },
]

export interface LegacyImportReport {
    /** Legacy keys copied into storage. */
    imported: string[]
    /** Legacy keys not present locally, or already stored. */
    skipped: string[]
    /** Legacy keys whose raw value could not be used. */
    failed: Array<{ legacyKey: string; error: string }>
    /** True when the marker said this database already ran the import. */
    alreadyRan: boolean
}

/** True when the backend is a different store than `localStorage`. */
export function shouldImportLegacyData(storage: StorageService): boolean {
    return storage.engine !== 'local-storage'
}

/**
 * Copy {@link LEGACY_STORAGE_IMPORTS} into `storage` once.
 *
 * Never throws: an import is best-effort housekeeping on the startup path, so
 * failures are reported in the result and logged, not propagated.
 */
export async function importLegacyLocalStorage(
    storage: StorageService,
    options: {
        imports?: LegacyStorageImport[];
        /** Injectable store, for checks; defaults to `globalThis.localStorage`. */
        webStorage?: Pick<Storage, 'getItem'> | null;
        now?: () => number;
    } = {},
): Promise<LegacyImportReport> {
    const imports = options.imports ?? LEGACY_STORAGE_IMPORTS;
    const report: LegacyImportReport = { imported: [], skipped: [], failed: [], alreadyRan: false };

    if (!shouldImportLegacyData(storage)) {
        return { ...report, alreadyRan: true };
    }

    let webStorage = options.webStorage;
    if (webStorage === undefined) {
        try {
            webStorage = typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
        } catch {
            webStorage = null;
        }
    }
    if (!webStorage) return report;

    const now = options.now ?? (() => Date.now());
    const marker = await storage
        .get<{ version?: number }>(MIGRATION_NAMESPACE, LEGACY_IMPORT_MARKER_KEY)
        .catch(() => null);
    if ((marker?.value?.version ?? 0) >= LEGACY_IMPORT_VERSION) {
        return { ...report, alreadyRan: true };
    }

    for (const entry of imports) {
        try {
            const raw = webStorage.getItem(entry.legacyKey);
            if (raw === null || raw === '') {
                report.skipped.push(entry.legacyKey);
                continue;
            }
            const existing = await storage.get(entry.namespace, entry.key);
            if (existing) {
                report.skipped.push(entry.legacyKey);
                continue;
            }
            const value = entry.parse === 'json' ? JSON.parse(raw) : raw;
            await storage.set(entry.namespace, entry.key, value);
            report.imported.push(entry.legacyKey);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            report.failed.push({ legacyKey: entry.legacyKey, error: message });
        }
    }

    try {
        await storage.set(MIGRATION_NAMESPACE, LEGACY_IMPORT_MARKER_KEY, {
            version: LEGACY_IMPORT_VERSION,
            completedAt: now(),
            imported: report.imported.length,
            failed: report.failed.length,
        });
    } catch (error) {
        logger.warn('storage: could not record the legacy import marker', error);
    }

    if (report.imported.length || report.failed.length) {
        logger.info(
            `storage: imported ${report.imported.length} legacy localStorage key(s)` +
                (report.failed.length ? `, ${report.failed.length} failed` : ''),
        );
    }
    return report;
}

/**
 * Read a legacy-backed value through the storage service, falling back to the
 * original `localStorage` key.
 *
 * The pattern a migrated consumer should use while other builds of the app may
 * still be running the old code:
 *
 * ```ts
 * const projects = await readWithLegacyFallback(storage, 'plugin.plugin-studio', 'projects', 'kn.plugin-studio.projects.v1', [])
 * ```
 */
export async function readWithLegacyFallback<T>(
    storage: StorageService | undefined,
    namespace: string,
    key: string,
    legacyKey: string,
    fallback: T,
): Promise<T> {
    if (storage) {
        try {
            const entry = await storage.get<T>(namespace, key);
            if (entry) return entry.value;
        } catch (error) {
            logger.warn(`storage: read ${storageKey(namespace, key)} failed, using localStorage`, error);
        }
    }
    try {
        const raw = typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage.getItem(legacyKey) : null;
        if (raw === null || raw === '') return fallback;
        try {
            return JSON.parse(raw) as T;
        } catch {
            // Keys written with `parse: 'raw'` (a plain model id, a flag) are
            // not JSON at all; hand them back as the string they are.
            return raw as unknown as T;
        }
    } catch {
        return fallback;
    }
}
