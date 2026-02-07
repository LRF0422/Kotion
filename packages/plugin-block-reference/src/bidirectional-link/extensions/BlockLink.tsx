/**
 * BlockLink Node Extension
 * Creates block-level embeds for linked blocks with ((block-id)) syntax.
 * Renders the actual block content directly.
 * 
 * @module @kn/plugin-block-reference/bidirectional-link/extensions
 */

import { mergeAttributes, ChainedCommands, ReactNodeViewRenderer, PMNode as Node } from "@kn/editor";
import { BlockLinkView } from "../components/BlockLinkNodeView";

export interface BlockLinkAttributes {
    blockId: string | null;
}

declare module '@kn/editor' {
    interface Commands<ReturnType> {
        blockLink: {
            setBlockLink: (attrs: { blockId: string }) => ReturnType;
        };
    }
}

export const BlockLink = Node.create({
    name: 'blockLink',
    group: 'block',
    inline: false,
    atom: true,
    draggable: true,

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            blockId: { default: null },
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-block-link]' }];
    },

    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
        return [
            'div',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                'data-block-link': 'true',
                'data-block-id': HTMLAttributes.blockId,
                class: 'block-link-embed',
            }),
            0,
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(BlockLinkView);
    },

    addCommands() {
        return {
            setBlockLink:
                ({ blockId }: { blockId: string }) =>
                    ({ chain }: { chain: () => ChainedCommands }) => {
                        return chain()
                            .insertContent({
                                type: this.name,
                                attrs: { blockId },
                            })
                            .run();
                    },
        };
    },
});
