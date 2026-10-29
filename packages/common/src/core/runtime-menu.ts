import type { ReactNode } from "react"
import type { SiderMenuItemProps } from "./menu"

/**
 * Rail entries contributed **while the app is running**.
 *
 * `KPlugin.menus[]` describes what a plugin always contributes; it is a
 * declaration inside a bundle and only changes when the bundle is (re)loaded.
 * That is the wrong shape for entries whose existence is *user state* — a page
 * the user pinned to the rail, a shortcut they added, a session-scoped entry —
 * because (a) such an entry can appear or disappear at any moment, and (b) the
 * host, not the plugin, is the one that knows it changed.
 *
 * Hence this registry: a host-owned list of live rail entries that the shell
 * rail merges next to the plugin menus and re-reads through a subscription
 * (`useRuntimeMenus`). Nothing here touches the plugin registry, so adding an
 * entry cannot trigger a plugin re-init or a router rebuild.
 */
export interface RuntimeMenuRegistration extends SiderMenuItemProps {
    /**
     * Body of the entry's context menu, rendered by the rail inside a
     * `ContextMenuContent`. Contributors build it from `ContextMenuItem`s; the
     * menu closes itself on select, so no callback is needed here.
     */
    contextMenu?: ReactNode
}

/** A live rail entry plus the owner handle needed to take it back. */
export interface RuntimeMenuItem extends RuntimeMenuRegistration {
    /** Who registered it (`pinned-pages`, a plugin key, …). */
    owner: string
}

/**
 * The service surface behind `Services['runtimeMenus']`.
 *
 * Ownership is explicit: an entry is addressed by `(owner, key)`, so one
 * contributor can never remove another's entry — and a plugin unloading can
 * drop everything it owns with one `clear(owner)`.
 */
export interface RuntimeMenuService {
    /** Add or replace one entry. Same `(owner, key)` replaces in place. */
    register(owner: string, item: RuntimeMenuRegistration): void
    /** Remove one entry. Returns false when it did not exist. */
    unregister(owner: string, key: string): boolean
    /** Remove every entry registered by `owner`. */
    clear(owner: string): void
    /**
     * Current entries, in registration order.
     *
     * The returned array is **stable between commits**: `useSyncExternalStore`
     * compares snapshots by identity, and handing back a fresh array on every
     * read would re-render forever.
     */
    list(): RuntimeMenuItem[]
    /** Notified after every commit (register / unregister / clear). */
    subscribe(listener: () => void): () => void
}

/** Why a registration was dropped, for the caller's log. */
export type RuntimeMenuRejection = 'missing-owner' | 'missing-identity' | 'key-taken'

/** Snapshot of "nothing registered"; shared so `useSyncExternalStore` stays stable. */
const EMPTY: readonly RuntimeMenuItem[] = Object.freeze([])

/**
 * Default implementation: an in-memory, version-less registry.
 *
 * Entries are de-duplicated by `key` **across owners** as well: the rail keys
 * its React children by `key`, so two owners publishing the same key would
 * render two buttons fighting over one identity. First writer wins and the
 * loser is reported through `onReject` rather than silently swapped in.
 */
export class RuntimeMenuRegistry implements RuntimeMenuService {
    private _items: RuntimeMenuItem[] = []
    private _snapshot: readonly RuntimeMenuItem[] = EMPTY
    private readonly _listeners = new Set<() => void>()

    constructor(
        private readonly _onReject?: (reason: RuntimeMenuRejection, owner: string, key: string) => void,
    ) { }

    register(owner: string, item: RuntimeMenuRegistration): void {
        if (!owner) {
            this._reject('missing-owner', owner ?? '', item?.key ?? '')
            return
        }
        if (!item || !item.key || !item.id) {
            this._reject('missing-identity', owner, item?.key ?? '')
            return
        }

        const ownIndex = this._items.findIndex((entry) => entry.owner === owner && entry.key === item.key)
        const holder = this._items.find((entry) => entry.key === item.key)

        // Someone else already uses this key: the rail keys children by `key`,
        // so the loser must be rejected instead of silently replacing the winner.
        if (holder && ownIndex < 0) {
            this._reject('key-taken', owner, item.key)
            return
        }

        const next: RuntimeMenuItem = { ...item, owner }
        if (ownIndex >= 0) {
            // Re-registering keeps the entry's position: a pinned page that was
            // renamed must not jump around in the rail.
            this._items = [
                ...this._items.slice(0, ownIndex),
                next,
                ...this._items.slice(ownIndex + 1),
            ]
        } else {
            this._items = [...this._items, next]
        }
        this._commit()
    }

    unregister(owner: string, key: string): boolean {
        const index = this._items.findIndex((entry) => entry.owner === owner && entry.key === key)
        if (index < 0) return false
        this._items = [...this._items.slice(0, index), ...this._items.slice(index + 1)]
        this._commit()
        return true
    }

    clear(owner: string): void {
        const next = this._items.filter((entry) => entry.owner !== owner)
        if (next.length === this._items.length) return
        this._items = next
        this._commit()
    }

    list(): RuntimeMenuItem[] {
        return this._snapshot as RuntimeMenuItem[]
    }

    subscribe(listener: () => void): () => void {
        this._listeners.add(listener)
        return () => {
            this._listeners.delete(listener)
        }
    }

    private _reject(reason: RuntimeMenuRejection, owner: string, key: string): void {
        this._onReject?.(reason, owner, key)
    }

    private _commit(): void {
        // A fresh frozen array per commit, reused for every read in between.
        this._snapshot = Object.freeze(this._items.slice())
        for (const listener of [...this._listeners]) {
            try {
                listener()
            } catch {
                // One broken subscriber must not stop the others from rendering.
            }
        }
    }
}
