/**
 * PageLinkNode — inline atom node for [[Page Title]] links.
 *
 * Replaces the legacy `pageLink` mark: the node stores only ids (plus a title
 * snapshot for text serialization), so the visible title is always resolved at
 * render time and never goes stale when the target page is renamed. Being an
 * atom it also cannot be partially deleted into a broken half-link.
 *
 * Text serialization stays `[[Title]]` so backend parsing keeps working.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/extensions
 */

import { mergeAttributes, ReactNodeViewRenderer, PMNode as Node } from "@kn/editor";
import { PageLinkNodeView } from "../components/PageLinkNodeView";

export interface PageLinkNodeAttributes {
    pageId: string | null;
    /** Title snapshot at insert time; refreshed by the view when it drifts. */
    title: string | null;
}

declare module '@kn/editor' {
    interface Commands<ReturnType> {
        pageLinkNode: {
            setPageLink: (attrs: { pageId: number | string; title: string }) => ReturnType;
        };
    }
}

export const PageLinkNode = Node.create({
    name: 'pageLinkNode',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            // Keep ids as strings: page ids are 19-digit snowflakes > 2^53.
            pageId: {
                default: null,
                parseHTML: (el) => el.getAttribute('data-page-id'),
            },
            title: {
                default: null,
                parseHTML: (el) => el.getAttribute('data-title'),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-page-link-node]' }];
    },

    renderHTML({ node, HTMLAttributes }) {
        return [
            'span',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                'data-page-link-node': 'true',
                'data-page-id': node.attrs.pageId,
                'data-title': node.attrs.title,
                class: 'wiki-page-link-node',
            }),
            `[[${node.attrs.title ?? ''}]]`,
        ];
    },

    renderText({ node }) {
        // Backend parses the [[Title]] pattern out of plain text.
        return `[[${node.attrs.title ?? ''}]]`;
    },

    addNodeView() {
        return ReactNodeViewRenderer(PageLinkNodeView);
    },

    addCommands() {
        return {
            setPageLink:
                ({ pageId, title }: { pageId: number | string; title: string }) =>
                    ({ chain }) => {
                        return chain()
                            .insertContent([
                                {
                                    type: this.name,
                                    attrs: { pageId: String(pageId), title },
                                },
                                { type: 'text', text: ' ' },
                            ])
                            .run();
                    },
        };
    },
});
