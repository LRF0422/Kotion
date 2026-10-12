import type { StorageScope, StorageService } from "../storage/types";
import { useOptionalService } from "../hooks/use-service";
import { resolveOptionalService } from "./service-resolver";

/**
 * The host's durable storage service.
 *
 * Registered by the host application on every platform (`@kn/core`'s
 * `createAppStorage`): SQLite through the desktop capability bridge on
 * Electron, `localStorage` in a browser, in-memory as the last resort. Prefer
 * {@link useStorageScope} in components so a namespace is asserted once.
 */
export const useStorage = (): StorageService | undefined => useOptionalService("storage");

/** Imperative counterpart of {@link useStorage} for non-React code. */
export const resolveStorage = (): StorageService | undefined => resolveOptionalService("storage");

/**
 * A namespace-bound view of the host storage service, or `undefined` when no
 * host registered one (a plugin loaded outside an app shell, or SSR).
 *
 * ```ts
 * const store = useStorageScope(pluginStorageNamespace('my-plugin'));
 * await store?.set(storageKey('doc', id), { title });
 * ```
 */
export const useStorageScope = (namespace: string): StorageScope | undefined => {
    const storage = useStorage();
    return storage ? storage.scope(namespace) : undefined;
};

/** Imperative counterpart of {@link useStorageScope}. */
export const resolveStorageScope = (namespace: string): StorageScope | undefined => {
    const storage = resolveStorage();
    return storage ? storage.scope(namespace) : undefined;
};
