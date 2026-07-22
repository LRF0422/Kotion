/**
 * PageLink Mark Extension (LEGACY)
 *
 * Kept only so documents created before the inline `pageLinkNode` migration
 * still parse and render their `[[Page Title]]` text links. New links are
 * inserted as `pageLinkNode` atoms (see ./PageLinkNode.tsx).
 *
 * @module @kn/plugin-block-reference/bidirectional-link/extensions
 */

import { Mark, mergeAttributes, Plugin, PluginKey } from "@kn/editor";
import { event } from "@kn/common";

/**
 * Global event emitted when a [[page link]] is clicked in the editor.
 * A ProseMirror plugin cannot use React hooks (useNavigator), so the click is
 * bridged to PageFooter (always mounted) which resolves the spaceId and navigates.
 * Payload: { pageId, title, left, top, direct }
 */
export const PAGE_LINK_CLICK = "WIKI_PAGE_LINK_CLICK";

export interface PageLinkAttributes {
    pageId: number | null;
    title: string | null;
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
            }),
            0,
        ];
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('pageLinkClick'),
                props: {
                    handleClick(view, _pos, e) {
                        const el = (e.target as HTMLElement)?.closest('[data-page-link]');
                        const pageId = el?.getAttribute('data-page-id');
                        if (!pageId) return false;
                        e.preventDefault();
                        const rect = el!.getBoundingClientRect();
                        const title = (el?.textContent || '').replace(/^\[\[/, '').replace(/\]\]$/, '');
                        // Cmd/Ctrl+Click and read-only mode jump straight away;
                        // a plain click while editing shows the confirm tooltip
                        // (avoids accidental navigation mid-edit).
                        const direct = e.metaKey || e.ctrlKey || !view.editable;
                        event.emit(PAGE_LINK_CLICK as any, {
                            pageId,
                            title,
                            left: rect.left,
                            top: rect.bottom + 4,
                            direct,
                        });
                        return true;
                    },
                },
            }),
        ];
    },
});
