/**
 * Plugin-scoped storage.
 *
 * The storage service is global (plugins are trusted and there is no per-plugin
 * IPC channel), so the only thing that keeps a plugin inside its own data is
 * the scope it is handed. `createPluginStorage` makes that scope impossible to
 * mis-build: the namespace is always `plugin.<pluginKey>`, and callers never
 * touch the raw service.
 *
 * ```ts
 * // React
 * const store = usePluginStorage(pluginKey)
 * await store?.set('settings', { theme: 'dark' })
 *
 * // non-React
 * const store = resolvePluginStorage(pluginKey)
 * ```
 *
 * The returned scope still speaks the full {@link StorageScope} API (`keys`,
 * `list`, `count`, `clear`), so a plugin's data is one prefix scan away — and
 * it only ever sees its own namespace.
 */

import { pluginStorageNamespace, type StorageScope, type StorageService } from './types';

/**
 * Bind `pluginKey` to its storage namespace.
 *
 * Returns `undefined` when there is no host storage service (the plugin is
 * loaded outside an app shell) or the key is empty. An unroutable key (one that
 * slugifies to nothing, e.g. `"@@@"`) throws, because that is a programming
 * error the author should see immediately.
 */
export function createPluginStorage(
    storage: StorageService | undefined,
    pluginKey: string | undefined,
): StorageScope | undefined {
    if (!storage) return undefined;
    const key = typeof pluginKey === 'string' ? pluginKey.trim() : '';
    if (!key) return undefined;
    return storage.scope(pluginStorageNamespace(key));
}
