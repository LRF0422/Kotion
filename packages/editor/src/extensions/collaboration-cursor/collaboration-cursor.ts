import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface CollaborationCursorUser {
    name: string;
    color: string;
    [key: string]: any;
}

export interface NodeSelectionCursorOptions {
    provider: any;
}

export const nodeSelectionCursorPluginKey = new PluginKey('nodeSelectionCursor');

// Awareness type from provider
type Awareness = {
    clientID: number;
    getStates: () => Map<number, any>;
    getLocalState: () => any;
    setLocalStateField: (field: string, value: any) => void;
    on: (event: string, listener: (...args: any[]) => void) => void;
    off: (event: string, listener: (...args: any[]) => void) => void;
};

/**
 * Create node selection decorations for remote users
 */
function createNodeSelectionDecorations(
    state: any,
    awareness: Awareness,
): DecorationSet {
    const decorations: Decoration[] = [];

    awareness.getStates().forEach((awarenessState: any, clientId: number) => {
        // Skip own cursor
        if (clientId === awareness.clientID) {
            return;
        }

        const cursorUser = awarenessState.user as CollaborationCursorUser;
        if (!cursorUser?.color) {
            return;
        }

        // Get nodeSelection state from separate field (not cursor field)
        const nodeSelectionData = awarenessState.nodeSelection;

        console.log('NodeSelectionCursor: checking remote client', {
            clientId,
            user: cursorUser?.name,
            nodeSelectionData,
        });

        if (!nodeSelectionData || !nodeSelectionData.isNodeSelection) {
            return;
        }

        const { from, to } = nodeSelectionData;
        if (from == null || to == null || from >= to) {
            return;
        }

        // Ensure positions are valid
        const docSize = state.doc.nodeSize - 2;
        const validFrom = Math.max(0, Math.min(from, docSize));
        const validTo = Math.max(0, Math.min(to, docSize));

        if (validFrom >= validTo) {
            return;
        }

        try {
            // Try to create a node decoration for the selected node
            const $from = state.doc.resolve(validFrom);
            const node = $from.nodeAfter;

            if (node && validFrom + node.nodeSize === validTo) {
                // This is a proper node selection - use node decoration
                decorations.push(
                    Decoration.node(validFrom, validTo, {
                        class: 'collaboration-cursor__node-selection',
                        style: `--collaboration-cursor-color: ${cursorUser.color}; outline-color: ${cursorUser.color};`,
                    })
                );
            }
        } catch (error) {
            console.debug('NodeSelectionCursor: Error creating decoration', error);
        }
    });

    return DecorationSet.create(state.doc, decorations);
}

/**
 * Extension to add node selection visualization for collaboration cursors
 * This works alongside the original CollaborationCaret extension
 * 
 * Key design: Uses a separate 'nodeSelection' field in awareness to avoid
 * conflicts with yCursorPlugin's internal cursor management
 */
export const NodeSelectionCursor = Extension.create<NodeSelectionCursorOptions>({
    name: 'nodeSelectionCursor',

    addOptions() {
        return {
            provider: null,
        };
    },

    addProseMirrorPlugins() {
        const { provider } = this.options;

        return [
            new Plugin({
                key: nodeSelectionCursorPluginKey,
                state: {
                    init(_, state) {
                        const awareness = provider?.awareness as Awareness | undefined;
                        if (!awareness) {
                            return DecorationSet.empty;
                        }
                        return createNodeSelectionDecorations(state, awareness);
                    },
                    apply(tr, prevDecorations, _, newState) {
                        const awareness = provider?.awareness as Awareness | undefined;
                        if (!awareness) {
                            return DecorationSet.empty;
                        }

                        // Check if we need to update decorations
                        const meta = tr.getMeta(nodeSelectionCursorPluginKey);
                        if (meta?.awarenessUpdated || tr.docChanged) {
                            return createNodeSelectionDecorations(newState, awareness);
                        }

                        // Map decorations through document changes
                        return prevDecorations.map(tr.mapping, tr.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                },
                view(view) {
                    const awareness = provider?.awareness as Awareness | undefined;

                    const onAwarenessChange = () => {
                        // Dispatch a transaction to trigger decoration update
                        if (view.state) {
                            const tr = view.state.tr.setMeta(nodeSelectionCursorPluginKey, {
                                awarenessUpdated: true,
                            });
                            view.dispatch(tr);
                        }
                    };

                    awareness?.on('change', onAwarenessChange);

                    return {
                        destroy() {
                            awareness?.off('change', onAwarenessChange);
                        },
                    };
                },
            }),
        ];
    },

    onSelectionUpdate() {
        const { provider } = this.options;

        if (!provider?.awareness || !this.editor) {
            return;
        }

        const { state } = this.editor;
        const { selection } = state;

        // Detect NodeSelection by checking constructor name and position patterns
        const isNodeSelection =
            selection.constructor.name === 'NodeSelection' ||
            (selection.$head.pos === selection.$anchor.pos && selection.from !== selection.to);

        console.log('NodeSelectionCursor: onSelectionUpdate', {
            isNodeSelection,
            constructorName: selection.constructor.name,
            from: selection.from,
            to: selection.to,
            $headPos: selection.$head.pos,
            $anchorPos: selection.$anchor.pos,
        });

        // Store nodeSelection in a SEPARATE awareness field to avoid conflicts with yCursorPlugin
        // yCursorPlugin manages its own 'cursor' field, so we use 'nodeSelection' instead
        provider.awareness.setLocalStateField('nodeSelection', {
            isNodeSelection,
            from: selection.from,
            to: selection.to,
        });
    },

    onUpdate() {
        const { provider } = this.options;

        if (!provider?.awareness || !this.editor) {
            return;
        }

        const { state } = this.editor;
        const { selection } = state;

        // Detect NodeSelection by checking constructor name and position patterns
        const isNodeSelection =
            selection.constructor.name === 'NodeSelection' ||
            (selection.$head.pos === selection.$anchor.pos && selection.from !== selection.to);

        // Store nodeSelection in a SEPARATE awareness field to avoid conflicts with yCursorPlugin
        provider.awareness.setLocalStateField('nodeSelection', {
            isNodeSelection,
            from: selection.from,
            to: selection.to,
        });
    },
});

export default NodeSelectionCursor;
