import { Extension, findChildrenInRange } from "@tiptap/core";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import combineTransactionSteps from "../unique-id/utilities/combine-transaction-steps";
import getChangedRanges from "../unique-id/utilities/get-changed-ranges";

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
}

// ─── Helpers ─────────────────────────────────────────────────────────

const DIRTY_TRACKER_KEY = new PluginKey('dirtyTracker');

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

// ─── Extension ───────────────────────────────────────────────────────

/**
 * DirtyTracker — a Tiptap extension that tracks which blocks have been
 * modified since the last save, enabling efficient incremental saves.
 *
 * How it works:
 *  1. A ProseMirror plugin intercepts every document-changing transaction.
 *  2. It uses `getChangedRanges()` to find the affected positions.
 *  3. For each changed range it looks up the top-level block (direct child
 *     of the doc node) and adds its `blockId` to the `touchedBlockIds` set.
 *  4. At save time, `getDirtyChanges()` compares the touched set and the
 *     last-saved snapshot to produce a minimal list of updates and deletions.
 *  5. After a successful save, `commitSave()` clears the dirty state and
 *     takes a new snapshot.
 */
export const DirtyTracker = Extension.create<DirtyTrackerOptions>({
    name: 'dirtyTracker',
    // Lower priority → runs AFTER UniqueID (priority 1000) so that all
    // blockIds have been assigned before we track changes.
    priority: 50,

    addOptions() {
        return {
            attributeName: 'blockId',
            types: [],
            filterTransaction: null,
        };
    },

    addStorage(): DirtyTrackerStorage {
        return {
            touchedBlockIds: new Set<string>(),
            lastSavedBlockIds: new Set<string>(),
            initialized: false,
            getDirtyChanges: () => [],
            getIncrementalPayload: () => ({ blockOrder: [], changes: [] }),
            commitSave: () => {},
            hasDirtyChanges: () => false,
            reinitialize: () => {},
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

        storage.getDirtyChanges = (): BlockChange[] => {
            if (!storage.initialized) return [];

            const doc = editor.state.doc;
            const currentBlockIds = collectTopLevelBlockIds(doc, attributeName);
            const changes: BlockChange[] = [];

            // 1. Deletions — blockIds that were in the last snapshot but are gone now
            for (const blockId of storage.lastSavedBlockIds) {
                if (!currentBlockIds.has(blockId)) {
                    changes.push({ blockId, action: 'delete' });
                }
            }

            // 2. Updates / inserts — touched blockIds that are still present
            const seen = new Set<string>();
            for (const blockId of storage.touchedBlockIds) {
                if (seen.has(blockId)) continue;
                seen.add(blockId);

                if (currentBlockIds.has(blockId)) {
                    // Walk top-level children to find the node
                    doc.forEach((node) => {
                        if (node.attrs[attributeName] === blockId) {
                            changes.push({
                                blockId,
                                action: 'update',
                                type: node.type.name,
                                content: node.toJSON(),
                            });
                        }
                    });
                }
            }

            return changes;
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
        };

        storage.hasDirtyChanges = (): boolean => {
            if (!storage.initialized) return false;
            if (storage.touchedBlockIds.size > 0) return true;

            // Check for deletions (blocks that disappeared)
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
        };
    },

    addProseMirrorPlugins() {
        const { attributeName, filterTransaction } = this.options;
        const storage = this.storage as DirtyTrackerStorage;

        return [
            new Plugin({
                key: DIRTY_TRACKER_KEY,

                appendTransaction: (transactions, oldState, newState) => {
                    // Only care about transactions that actually changed the document
                    const docChanged =
                        transactions.some(t => t.docChanged) &&
                        !oldState.doc.eq(newState.doc);

                    if (!docChanged) return null;

                    // Apply the user-provided filter (e.g., ignore collab-origin changes)
                    if (
                        filterTransaction &&
                        transactions.some(t => !filterTransaction(t))
                    ) {
                        return null;
                    }

                    // Combine all steps and compute the changed ranges
                    // @ts-ignore — transactions type is compatible
                    const transform = combineTransactionSteps(
                        oldState.doc,
                        [...transactions],
                    );
                    const changes = getChangedRanges(transform);

                    // For each changed range, find the top-level block that overlaps
                    changes.forEach(change => {
                        const from = Math.max(0, change.newStart);
                        const to = Math.min(change.newEnd, newState.doc.content.size);
                        if (from >= to) return;

                        newState.doc.nodesBetween(from, to, (node, _pos, parent) => {
                            // Only track direct children of the document node
                            if (parent === newState.doc) {
                                const blockId = node.attrs[attributeName];
                                if (blockId) {
                                    storage.touchedBlockIds.add(blockId);
                                }
                                return false; // no need to descend into children
                            }
                        });
                    });

                    // Read-only — never return a new transaction
                    return null;
                },
            }),
        ];
    },
});
