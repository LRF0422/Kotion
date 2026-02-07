/**
 * PageLink Mark Extension
 * Creates inline page links with [[Page Title]] syntax.
 * 
 * @module @kn/plugin-block-reference/bidirectional-link/extensions
 */

import { Mark, mergeAttributes, ChainedCommands } from "@kn/editor";

export interface PageLinkAttributes {
    pageId: number | null;
    title: string | null;
}

declare module '@kn/editor' {
    interface Commands<ReturnType> {
        pageLink: {
            setPageLink: (attrs: { pageId: number; title: string }) => ReturnType;
            unsetPageLink: () => ReturnType;
        };
    }
}

export const PageLink = Mark.create({
    name: 'pageLink',

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            pageId: { default: null },
            title: { default: null },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-page-link]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'span',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                'data-page-link': 'true',
                'data-page-id': HTMLAttributes.pageId,
                class: 'wiki-page-link',
                style: 'color: var(--primary); cursor: pointer; border-bottom: 1px dashed currentColor;',
            }),
            0,
        ];
    },

    addCommands() {
        return {
            setPageLink:
                ({ pageId, title }: { pageId: number; title: string }) =>
                    ({ chain }: { chain: () => ChainedCommands }) => {
                        // IMPORTANT: Insert the [[Title]] pattern for backend parsing
                        return chain()
                            .insertContent({
                                type: 'text',
                                text: `[[${title}]]`,
                                marks: [{ type: this.name, attrs: { pageId, title } }],
                            })
                            .run();
                    },
            unsetPageLink:
                () =>
                    ({ chain }: { chain: () => ChainedCommands }) =>
                        chain().unsetMark(this.name).run(),
        };
    },
});
