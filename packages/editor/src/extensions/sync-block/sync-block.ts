import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { SyncBlockView } from "./SyncBlock";

export interface SyncBlockOptions {
    /** Base URL for the collaboration server */
    baseUrl?: string;
}

export interface SyncBlockAttributes {
    /** Unique identifier for this sync block */
    id: string | null;
    /** Block ID used for collaboration room identification */
    blockId: string | null;
    /** Whether the block has been initialized */
    init: boolean;
    /** Stored content as JSON string (for persistence when room-server doesn't persist) */
    content: string | null;
}

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        syncBlock: {
            /**
             * Insert a sync block
             */
            insertSyncBlock: (attrs?: Partial<SyncBlockAttributes>) => ReturnType;
        };
    }
}

export const SyncBlock = Node.create<SyncBlockOptions>({
    name: 'syncBlock',
    group: 'block',
    isolating: true,
    atom: true,
    draggable: true,
    selectable: true,

    addOptions() {
        return {
            baseUrl: undefined,
        };
    },

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => ({
                    'data-id': attributes.id,
                }),
            },
            blockId: {
                default: null,
                parseHTML: element => element.getAttribute('data-block-id'),
                renderHTML: attributes => ({
                    'data-block-id': attributes.blockId,
                }),
            },
            init: {
                default: false,
                parseHTML: element => element.getAttribute('data-init') === 'true',
                renderHTML: attributes => ({
                    'data-init': attributes.init ? 'true' : 'false',
                }),
            },
            content: {
                default: null,
                parseHTML: element => element.getAttribute('data-content'),
                renderHTML: attributes => ({
                    'data-content': attributes.content,
                }),
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="sync-block"]',
            },
            {
                tag: 'div.node-sync-block',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'div',
            mergeAttributes(HTMLAttributes, {
                'data-type': 'sync-block',
                class: 'node-sync-block',
            }),
        ];
    },

    addCommands() {
        return {
            insertSyncBlock:
                (attrs = {}) =>
                    ({ commands }) => {
                        return commands.insertContent({
                            type: this.name,
                            attrs,
                        });
                    },
        };
    },

    addNodeView() {
        return ReactNodeViewRenderer(SyncBlockView);
    },
});