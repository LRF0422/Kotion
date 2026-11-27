import { useMemo } from "react";
import { createPluginStorage } from "../storage/plugin-storage";
import type { StorageScope, StorageService } from "../storage/types";
import { useOptionalService } from "../hooks/use-service";
import { resolveOptionalService } from "./service-resolver";

/**
 * The host's durable storage service.
 *
 * Registered by the host application on every platform (`@kn/core`'s
 * `createAppStorage`): SQLite through the desktop capability bridge on
 * Electron, `localStorage` in a browser, session memory as the last resort.
 * On desktop there is no `localStorage` fallback.
 *
 * Plugins should not reach for this directly: {@link usePluginStorage} hands
 * them a scope for their own `plugin.<pluginKey>` namespace and nothing else.
 * Prefer {@link useStorageScope} when the namespace is genuinely known (the app
 * shell), so it is asserted once.
 */
export const useStorage = (): StorageService | undefined => useOptionalService("storage");

/** Imperative counterpart of {@link useStorage} for non-React code. */
export const resolveStorage = (): StorageService | undefined => resolveOptionalService("storage");

/**
 * A namespace-bound view of the host storage service, or `undefined` when no
 * host registered one (a plugin loaded outside an app shell, or SSR).
 *
 * ```ts
 * const store = useStorageScope(appStorageNamespace('recent-pages'));
 * await store?.set('list', pages);
 * ```
 *
 * The scope is memoised: it is safe (and expected) to put it in a `useEffect`
 * dependency list.
 */
export const useStorageScope = (namespace: string): StorageScope | undefined => {
    const storage = useStorage();
    return useMemo(() => (storage ? storage.scope(namespace) : undefined), [storage, namespace]);
};

/** Imperative counterpart of {@link useStorageScope}. */
export const resolveStorageScope = (namespace: string): StorageScope | undefined => {
    const storage = resolveStorage();
    return storage ? storage.scope(namespace) : undefined;
};

/**
 * The storage a plugin is allowed to use: `plugin.<pluginKey>`, nothing else.
 *
 * This is the API third-party plugins (and the plugin studio) should use. It
 * hides the namespace so a plugin cannot accidentally read the shell's keys or
 * another plugin's data, and it is stable across renders, so it can be a hook
 * dependency.
 *
 * ```tsx
 * const store = usePluginStorage(pluginKey)   // the host passes `pluginKey` to plugin components
 * useEffect(() => {
 *     void store?.set('settings', settings)
 * }, [store, settings])
 * ```
 *
 * Resolves `undefined` without a host storage service or a plugin key, so the
 * caller can decide between "no persistence" and an explicit error.
 */
export const usePluginStorage = (pluginKey: string | undefined): StorageScope | undefined => {
    const storage = useStorage();
    return useMemo(() => createPluginStorage(storage, pluginKey), [storage, pluginKey]);
};

/** Imperative counterpart of {@link usePluginStorage}. */
export const resolvePluginStorage = (pluginKey: string | undefined): StorageScope | undefined =>
    createPluginStorage(resolveStorage(), pluginKey);
