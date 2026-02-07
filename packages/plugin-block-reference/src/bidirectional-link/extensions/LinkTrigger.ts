/**
 * Link Trigger Extension
 * Automatically detects [[ and (( triggers and opens link pickers.
 * 
 * @module @kn/plugin-block-reference/bidirectional-link/extensions
 */

import { Extension, Plugin, PluginKey, EditorView, Editor, ReactRenderer, computePosition, flip, posToDOMRect } from "@kn/editor";
import { PageLinkPicker } from "../components/PageLinkPicker";
import { BlockLinkPicker } from "../components/BlockLinkPicker";

/**
 * LinkTrigger Extension
 * 
 * Listens for [[ and (( key sequences and opens the appropriate picker.
 * The pickers automatically get spaceId from PageContext.
 */
export const LinkTrigger = Extension.create({
    name: 'linkTrigger',
    priority: 100,

    addProseMirrorPlugins() {
        const editor = this.editor;
        let activeComponent: ReactRenderer | null = null;

        const cleanupComponent = () => {
            if (activeComponent) {
                try {
                    activeComponent.element?.parentElement?.removeChild(activeComponent.element);
                } catch {
                    // Element might already be removed
                }
                activeComponent.destroy();
                activeComponent = null;
            }
        };

        const positionComponent = (component: ReactRenderer, editor: Editor) => {
            const { selection } = editor.state;
            const domRect = posToDOMRect(editor.view, selection.from, selection.to);

            const virtualElement = {
                getBoundingClientRect: () => domRect,
                getClientRects: () => [domRect],
            };

            computePosition(virtualElement, component.element as HTMLElement, {
                placement: "bottom-start",
                middleware: [flip()],
            }).then(({ x, y, strategy }) => {
                const el = component.element as HTMLElement;
                el.style.zIndex = '9999';
                el.style.position = strategy;
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
            });
        };

        const showPagePicker = (deleteChars: number) => {
            cleanupComponent();

            // Delete trigger characters
            const { state, view } = editor;
            const from = state.selection.from - deleteChars;
            if (from >= 0) {
                view.dispatch(state.tr.delete(from, state.selection.from));
            }

            const component = new ReactRenderer(PageLinkPicker, {
                editor,
                props: {
                    visible: true,
                    // spaceId will be obtained from PageContext inside the component
                    onSelect: (page: { id: number; title: string }) => {
                        (editor.commands as any).setPageLink({ pageId: page.id, title: page.title });
                        cleanupComponent();
                        editor.commands.focus();
                    },
                    onCancel: () => {
                        cleanupComponent();
                        editor.commands.focus();
                    },
                },
            });

            component.render();
            document.body.appendChild(component.element);
            activeComponent = component;
            positionComponent(component, editor);
        };

        const showBlockPicker = (deleteChars: number) => {
            cleanupComponent();

            // Delete trigger characters
            const { state, view } = editor;
            const from = state.selection.from - deleteChars;
            if (from >= 0) {
                view.dispatch(state.tr.delete(from, state.selection.from));
            }

            const component = new ReactRenderer(BlockLinkPicker, {
                editor,
                props: {
                    visible: true,
                    // spaceId will be obtained from PageContext inside the component
                    onSelect: (block: { id: string }) => {
                        (editor.commands as any).setBlockLink({ blockId: block.id });
                        cleanupComponent();
                        editor.commands.focus();
                    },
                    onCancel: () => {
                        cleanupComponent();
                        editor.commands.focus();
                    },
                },
            });

            component.render();
            document.body.appendChild(component.element);
            activeComponent = component;
            positionComponent(component, editor);
        };

        return [
            new Plugin({
                key: new PluginKey('linkTrigger'),

                props: {
                    handleTextInput(view: EditorView, from: number, _to: number, text: string) {
                        const { state } = view;
                        const $from = state.doc.resolve(from);
                        const textBefore = $from.parent.textBetween(
                            Math.max(0, $from.parentOffset - 1),
                            $from.parentOffset,
                            ''
                        );

                        // Check for [[ trigger
                        if (text === '[' && textBefore === '[') {
                            setTimeout(() => {
                                showPagePicker(2);
                            }, 0);
                            return false;
                        }

                        // Check for (( trigger
                        if (text === '(' && textBefore === '(') {
                            setTimeout(() => {
                                showBlockPicker(2);
                            }, 0);
                            return false;
                        }

                        return false;
                    },
                },
            }),
        ];
    },
});
