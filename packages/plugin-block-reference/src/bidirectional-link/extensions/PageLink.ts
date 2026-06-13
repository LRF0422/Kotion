/**
 * PageLink Mark Extension
 * Creates inline page links with [[Page Title]] syntax.
 * 
 * @module @kn/plugin-block-reference/bidirectional-link/extensions
 */

import { Mark, mergeAttributes, ChainedCommands, Plugin, PluginKey } from "@kn/editor";
import { event } from "@kn/common";

/**
 * Global event emitted when a [[page link]] is clicked in the editor.
 * A ProseMirror plugin cannot use React hooks (useNavigator), so the click is
 * bridged to PageFooter (always mounted) which resolves the spaceId and navigates.
 * Payload: { pageId: string }
 */
export const PAGE_LINK_CLICK = "WIKI_PAGE_LINK_CLICK";

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

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('pageLinkClick'),
                props: {
                    handleClick(_view, _pos, e) {
                        const el = (e.target as HTMLElement)?.closest('[data-page-link]');
                        const pageId = el?.getAttribute('data-page-id');
                        if (!pageId) return false;
                        e.preventDefault();
                        event.emit(PAGE_LINK_CLICK as any, { pageId });
                        return true;
                    },
                },
            }),
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
