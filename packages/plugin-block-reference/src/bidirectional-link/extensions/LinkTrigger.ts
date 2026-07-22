/**
 * Link Trigger Extension
 *
 * Inline-filtering triggers for bidirectional links, built on
 * @tiptap/suggestion (same mechanism as the slash menu):
 *
 * - `[[query` filters pages inline; Enter/click inserts a pageLinkNode.
 * - `((query` filters blocks inline; Enter/click inserts a blockLink embed.
 * - Esc dismisses the menu and leaves the typed text untouched, so users can
 *   still type literal brackets.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/extensions
 */

import {
    Extension,
    Suggestion,
    type SuggestionProps,
    type SuggestionKeyDownProps,
    PluginKey,
    ReactRenderer,
    computePosition,
    flip,
    shift,
} from "@kn/editor";
import type { Editor, Range } from "@kn/editor";
import { PageLinkPicker } from "../components/PageLinkPicker";
import { BlockLinkPicker } from "../components/BlockLinkPicker";

/** Imperative handle exposed by both suggestion lists. */
export interface LinkSuggestionListHandle {
    onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

/** Payload passed from the lists back to the suggestion `command`. */
export interface LinkSuggestionCommandProps {
    page?: { id: number | string; title: string };
    block?: { id: string };
}

/**
 * Shared renderer: mounts the given list component as a caret-anchored
 * floating menu and forwards suggestion lifecycle events to it.
 */
const createSuggestionRenderer = (Component: React.ComponentType<any>) => {
    return () => {
        let component: ReactRenderer<LinkSuggestionListHandle> | null = null;

        const updatePosition = (clientRect: (() => DOMRect | null) | null | undefined) => {
            const rect = clientRect?.();
            if (!component || !rect) return;
            const el = component.element as HTMLElement;
            // The ReactRenderer wrapper is a block-level div: appended to body it
            // spans the full viewport width, which makes shift() clamp x to the
            // left edge. Shrink it to its content before measuring.
            el.style.position = 'fixed';
            el.style.width = 'max-content';
            el.style.zIndex = '9999';
            // Provisional anchor so the menu never flashes at the viewport
            // corner while computePosition resolves asynchronously.
            el.style.left = `${rect.left}px`;
            el.style.top = `${rect.bottom}px`;
            const virtualElement = {
                getBoundingClientRect: () => rect,
                getClientRects: () => [rect],
            };
            computePosition(virtualElement, el, {
                placement: "bottom-start",
                strategy: "fixed",
                middleware: [flip(), shift({ padding: 8 })],
            }).then(({ x, y, strategy }) => {
                if (!component) return;
                el.style.position = strategy;
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
            });
        };

        const destroy = () => {
            if (!component) return;
            if (document.body.contains(component.element)) {
                document.body.removeChild(component.element);
            }
            component.destroy();
            component = null;
        };

        return {
            onStart: (props: SuggestionProps) => {
                if (!props.editor.isEditable) return;
                component = new ReactRenderer(Component, {
                    props,
                    editor: props.editor,
                });
                component.render();
                document.body.appendChild(component.element);
                updatePosition(props.clientRect);
            },

            onUpdate: (props: SuggestionProps) => {
                if (!component) return;
                component.updateProps(props);
                updatePosition(props.clientRect);
            },

            onKeyDown: (props: SuggestionKeyDownProps) => {
                if (!component) return false;
                if (props.event.key === 'Escape') {
                    // Dismiss the menu but keep the typed [[query text so the
                    // user can continue typing literal brackets.
                    destroy();
                    return true;
                }
                return component.ref?.onKeyDown(props) ?? false;
            },

            onExit: () => {
                destroy();
            },
        };
    };
};

export const LinkTrigger = Extension.create({
    name: 'linkTrigger',
    priority: 100,

    addProseMirrorPlugins() {
        const pageCommand = ({ editor, range, props }: { editor: Editor; range: Range; props: LinkSuggestionCommandProps }) => {
            if (!props.page) return;
            editor
                .chain()
                .focus()
                .deleteRange(range)
                .setPageLink({ pageId: props.page.id, title: props.page.title })
                .run();
        };

        const blockCommand = ({ editor, range, props }: { editor: Editor; range: Range; props: LinkSuggestionCommandProps }) => {
            if (!props.block) return;
            editor
                .chain()
                .focus()
                .deleteRange(range)
                .setBlockLink({ blockId: props.block.id })
                .run();
        };

        return [
            Suggestion({
                editor: this.editor,
                pluginKey: new PluginKey('pageLinkSuggestion'),
                char: '[[',
                allowSpaces: true,
                allowedPrefixes: null,
                startOfLine: false,
                decorationClass: 'link-suggestion-query',
                command: pageCommand,
                items: ({ query }) => [query],
                render: createSuggestionRenderer(PageLinkPicker),
            }),
            Suggestion({
                editor: this.editor,
                pluginKey: new PluginKey('blockLinkSuggestion'),
                char: '((',
                allowSpaces: true,
                allowedPrefixes: null,
                startOfLine: false,
                decorationClass: 'link-suggestion-query',
                command: blockCommand,
                items: ({ query }) => [query],
                render: createSuggestionRenderer(BlockLinkPicker),
            }),
        ];
    },
});
