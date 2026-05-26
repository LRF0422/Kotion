import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ChangeSet, simplifyChanges } from "prosemirror-changeset";

// ─── Types ───────────────────────────────────────────────────────────

/** The type of change for a single block. */
export type BlockChangeAction = 'update' | 'delete';

/** Represents a single block-level change. */
export interface BlockChange {
    /** The blockId of the changed block */
    blockId: string;
    /** Whether this block was updated/inserted or deleted */
    action: BlockChangeAction;
    /** The node type (e.g., 'paragraph', 'heading') — undefined for deletions */
    type?: string;
    /** The serialized JSON of the block node — undefined for deletions */
    content?: any;
    /**
     * The block-level version number that the client believes was the most
     * recent state when these changes started accumulating. Used by the
     * backend for optimistic concurrency control.
     */
    prevVersion?: number;
}

/** Payload sent to the backend for an incremental save. */
export interface IncrementalSavePayload {
    /** Ordered list of all current top-level blockIds (defines document structure) */
    blockOrder: string[];
    /** Only the blocks that actually changed since the last save */
    changes: BlockChange[];
}

/** Storage interface exposed by the DirtyTracker extension. */
export interface DirtyTrackerStorage {
    /** BlockIds that have been touched by transactions since the last save */
    touchedBlockIds: Set<string>;
    /** Snapshot of all top-level blockIds at the last save checkpoint */
    lastSavedBlockIds: Set<string>;
    /** Per-block version numbers known to the client (set by callers after load) */
    blockVersions: Map<string, number>;
    /** Whether the tracker has been initialized with a baseline */
    initialized: boolean;
    /** Get all dirty changes since the last save */
    getDirtyChanges: () => BlockChange[];
    /** Get the full incremental save payload (block order + changes) */
    getIncrementalPayload: () => IncrementalSavePayload;
    /** Mark the current state as "saved" — clears dirty tracking and snapshots blockIds */
    commitSave: () => void;
    /** Check if there are any unsaved changes (touched blocks or deletions) */
    hasDirtyChanges: () => boolean;
    /** Re-initialize the baseline (e.g., after content finishes loading) */
    reinitialize: () => void;
    /** Replace the per-block version map (e.g., from a freshly-loaded page). */
    setBlockVersions: (versions: Map<string, number> | Record<string, number>) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const DIRTY_TRACKER_KEY = new PluginKey<{ changeSet: ChangeSet }>('dirtyTracker');

export interface DirtyTrackerOptions {
    /** The attribute name used for block identification (default: 'blockId') */
    attributeName: string;
    /** Node types to track. If empty, tracks all nodes that carry the attribute. */
    types: string[];
    /** Optional transaction filter — return false to ignore a transaction. */
    filterTransaction: ((transaction: Transaction) => boolean) | null;
}

/**
 * Collect all blockIds from direct children of the document node.
 * These are the "top-level blocks" that we track for incremental saves.
 */
function collectTopLevelBlockIds(doc: ProseMirrorNode, attr: string): Set<string> {
    const ids = new Set<string>();
    doc.forEach((node) => {
        const id = node.attrs[attr];
        if (id) ids.add(id);
    });
    return ids;
}

/**
 * Get the ordered list of top-level blockIds.
 * Used to communicate document structure to the backend.
 */
function getTopLevelBlockOrder(doc: ProseMirrorNode, attr: string): string[] {
    const order: string[] = [];
    doc.forEach((node) => {
        const id = node.attrs[attr];
        if (id) order.push(id);
    });
    return order;
}

/**
 * Find every top-level blockId whose range overlaps any of the provided
 * change ranges in the *current* document.
 */
function blockIdsTouchedByChanges(
    doc: ProseMirrorNode,
    changes: ReadonlyArray<{ fromB: number; toB: number }>,
    attr: string,
): Set<string> {
    const result = new Set<string>();
    if (changes.length === 0) return result;

    // Walk the top-level children once and test overlap.
    let pos = 0;
    doc.forEach((node) => {
        const start = pos;
        const end = pos + node.nodeSize;
        const id = node.attrs[attr];
        if (id) {
            for (const c of changes) {
                if (c.toB > start && c.fromB < end) {
                    result.add(id);
                    break;
                }
            }
        }
        pos = end;
    });
    return result;
}

// ─── Extension ───────────────────────────────────────────────────────

/**
 * DirtyTracker — Tiptap extension that tracks which top-level blocks have
 * been modified since the last save, enabling incremental saves.
 *
 * The change-detection core is delegated to {@code prosemirror-changeset}:
 *  1. A ProseMirror plugin maintains a {@code ChangeSet} starting from the
 *     last-saved doc snapshot.
 *  2. On every doc-changing transaction the steps are folded into the
 *     {@code ChangeSet} via {@code addSteps()}.
 *  3. {@code getDirtyChanges()} reads {@code changeSet.changes} (after
 *     {@code simplifyChanges()}) and maps each affected range back to the
 *     enclosing top-level block by id.
 *  4. Deletions are detected by diffing the snapshot of top-level blockIds
 *     captured at the last save against the current set.
 *  5. After a successful save, {@code commitSave()} resets the ChangeSet to
 *     start from the new "last-saved" doc.
 */
export const DirtyTracker = Extension.create<DirtyTrackerOptions>({
    name: 'dirtyTracker',
    // Lower priority → runs AFTER UniqueID (priority 1000) so that all
    // blockIds have been assigned before we track changes.
    priority: 50,

    addOptions() {
        return {
            attributeName: 'id',
            types: [],
            filterTransaction: null,
        };
    },

    addStorage(): DirtyTrackerStorage {
        return {
            touchedBlockIds: new Set<string>(),
            lastSavedBlockIds: new Set<string>(),
            blockVersions: new Map<string, number>(),
            initialized: false,
            getDirtyChanges: () => [],
            getIncrementalPayload: () => ({ blockOrder: [], changes: [] }),
            commitSave: () => { },
            hasDirtyChanges: () => false,
            reinitialize: () => { },
            setBlockVersions: () => { },
        };
    },

    onCreate() {
        const { attributeName } = this.options;
        const storage = this.storage as DirtyTrackerStorage;
        const editor = this.editor;

        // ── Initialize baseline from current document ──
        storage.lastSavedBlockIds = collectTopLevelBlockIds(
            editor.state.doc,
            attributeName,
        );
        storage.initialized = true;

        // ── Bind public methods (they close over editor & storage) ──

        const readChangeSet = (): ChangeSet | null => {
            const pluginState = DIRTY_TRACKER_KEY.getState(editor.state);
            return pluginState ? pluginState.changeSet : null;
        };

        storage.getDirtyChanges = (): BlockChange[] => {
            if (!storage.initialized) return [];

            const doc = editor.state.doc;
            const currentBlockIds = collectTopLevelBlockIds(doc, attributeName);
            const out: BlockChange[] = [];

            // 1. Deletions — blockIds present at last save but missing now.
            for (const blockId of storage.lastSavedBlockIds) {
                if (!currentBlockIds.has(blockId)) {
                    out.push({
                        blockId,
                        action: 'delete',
                        prevVersion: storage.blockVersions.get(blockId),
                    });
                }
            }

            // 2. Updates / inserts — derived from ChangeSet ranges plus the
            //    legacy touchedBlockIds fallback (covers the rare case where
            //    the ChangeSet has been reset but transactions haven't been
            //    flushed yet).
            const cs = readChangeSet();
            const dirtyIds = new Set<string>(storage.touchedBlockIds);
            if (cs) {
                const simplified = simplifyChanges(cs.changes, doc);
                blockIdsTouchedByChanges(doc, simplified, attributeName)
                    .forEach((id) => dirtyIds.add(id));
            }

            const seen = new Set<string>();
            for (const blockId of dirtyIds) {
                if (seen.has(blockId)) continue;
                seen.add(blockId);
                if (!currentBlockIds.has(blockId)) continue;

                doc.forEach((node) => {
                    if (node.attrs[attributeName] === blockId) {
                        out.push({
                            blockId,
                            action: 'update',
                            type: node.type.name,
                            content: node.toJSON(),
                            prevVersion: storage.blockVersions.get(blockId),
                        });
                    }
                });
            }

            return out;
        };

        storage.getIncrementalPayload = (): IncrementalSavePayload => ({
            blockOrder: getTopLevelBlockOrder(editor.state.doc, attributeName),
            changes: storage.getDirtyChanges(),
        });

        storage.commitSave = () => {
            storage.touchedBlockIds.clear();
            storage.lastSavedBlockIds = collectTopLevelBlockIds(
                editor.state.doc,
                attributeName,
            );
            // Reset the ChangeSet baseline to the just-saved doc.
            const view = editor.view;
            view.dispatch(view.state.tr.setMeta(DIRTY_TRACKER_KEY, { reset: true }));
        };

        storage.hasDirtyChanges = (): boolean => {
            if (!storage.initialized) return false;
            if (storage.touchedBlockIds.size > 0) return true;

            const cs = readChangeSet();
            if (cs && cs.changes.length > 0) return true;

            const currentBlockIds = collectTopLevelBlockIds(
                editor.state.doc,
                attributeName,
            );
            for (const blockId of storage.lastSavedBlockIds) {
                if (!currentBlockIds.has(blockId)) return true;
            }
            return false;
        };

        storage.reinitialize = () => {
            storage.touchedBlockIds.clear();
            storage.lastSavedBlockIds = collectTopLevelBlockIds(
                editor.state.doc,
                attributeName,
            );
            storage.initialized = true;
            const view = editor.view;
            view.dispatch(view.state.tr.setMeta(DIRTY_TRACKER_KEY, { reset: true }));
        };

        storage.setBlockVersions = (versions) => {
            storage.blockVersions = versions instanceof Map
                ? new Map(versions)
                : new Map(Object.entries(versions));
        };
    },

    addProseMirrorPlugins() {
        const { attributeName, filterTransaction } = this.options;
        const storage = this.storage as DirtyTrackerStorage;

        return [
            new Plugin<{ changeSet: ChangeSet }>({
                key: DIRTY_TRACKER_KEY,

                state: {
                    init(_, state) {
                        return { changeSet: ChangeSet.create(state.doc) };
                    },
                    apply(tr, value, oldState, newState) {
                        // Manual reset (commitSave / reinitialize)
                        const meta = tr.getMeta(DIRTY_TRACKER_KEY) as { reset?: boolean } | undefined;
                        if (meta?.reset) {
                            return { changeSet: ChangeSet.create(newState.doc) };
                        }

                        // Skip transactions that didn't change the doc.
                        if (!tr.docChanged) return value;

                        // Apply user-provided filter.
                        if (filterTransaction && !filterTransaction(tr)) {
                            return value;
                        }

                        const updated = value.changeSet.addSteps(
                            newState.doc,
                            tr.mapping.maps,
                            null,
                        );
                        return { changeSet: updated };
                    },
                },

                appendTransaction: (transactions, oldState, newState) => {
                    // Maintain `touchedBlockIds` as a fast-path index for
                    // hasDirtyChanges() and as a fallback for getDirtyChanges().
                    const docChanged = transactions.some((t) => t.docChanged)
                        && !oldState.doc.eq(newState.doc);
                    if (!docChanged) return null;

                    if (filterTransaction && transactions.some((t) => !filterTransaction(t))) {
                        return null;
                    }

                    // Aggregate all step maps and walk back to find the affected
                    // ranges in the new doc.
                    transactions.forEach((tr) => {
                        tr.mapping.maps.forEach((stepMap) => {
                            stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                                const from = Math.max(0, newStart);
                                const to = Math.min(newEnd, newState.doc.content.size);
                                if (from >= to) return;
                                newState.doc.nodesBetween(from, to, (node, _pos, parent) => {
                                    if (parent === newState.doc) {
                                        const blockId = node.attrs[attributeName];
                                        if (blockId) storage.touchedBlockIds.add(blockId);
                                        return false;
                                    }
                                });
                            });
                        });
                    });
                    return null;
                },
            }),
        ];
    },
});
