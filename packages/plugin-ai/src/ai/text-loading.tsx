import { useTranslation } from "@kn/common";
import { Plugin, PluginKey, ReactRenderer } from "@kn/editor";
import { Decoration, DecorationSet } from "@kn/editor";
import { Command, Extension } from "@kn/editor";
import { Loader2 } from "@kn/icon";
import React from "react";

/**
 * Commands for managing loading decoration in the editor
 */

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        textLoadingDecoration: {
            toggleLoadingDecoration: (pos: number, loadingHtml?: string) => ReturnType;
            removeLoadingDecoration: () => ReturnType;
        };
    }
}

export const loadingDecorationKey = new PluginKey<LoadingDecorationState>("loadingDecoration");

/**
 * State interface for loading decoration plugin
 */
interface LoadingDecorationState {
    decorationSet: DecorationSet;
    hasDecoration: boolean;
}

/**
 * Text Loading Decoration Extension
 * Provides visual feedback during AI text generation with streaming support
 */

const TextLoadingDecorationExtension = Extension.create({
    name: "loadingDecoration",

    addOptions() {
        return {
            pluginKey: loadingDecorationKey
        };
    },

    addProseMirrorPlugins() {
        const pluginKey = this.options.pluginKey;
        const editor = this.editor;
        return [
            new Plugin<LoadingDecorationState>({
                key: pluginKey,

                state: {
                    init() {
                        return {
                            decorationSet: DecorationSet.empty,
                            hasDecoration: false
                        };
                    },

                    apply(tr, oldState) {
                        const action = tr.getMeta(pluginKey);

                        if (action?.type === "loadingDecoration") {
                            const { pos, remove, loadingHtml } = action;

                            // Remove decoration if requested
                            if (remove) {
                                return {
                                    decorationSet: DecorationSet.empty,
                                    hasDecoration: false
                                };
                            }

                            // Create loading decoration widget
                            const decoration = Decoration.widget(pos, () => {
                                const container = document.createElement("span");
                                container.className = "loading-decoration p-1 border rounded-md outline";

                                if (loadingHtml) {
                                    // Show streaming content
                                    container.innerHTML = loadingHtml;
                                } else {
                                    // Show loading indicator
                                    const component = new ReactRenderer(() => {
                                        const { t } = useTranslation();
                                        return (
                                            <span>
                                                {t('ai.generate')}
                                                <Loader2 className="w-4 h-4 animate-spin inline" />
                                            </span>
                                        );
                                    }, {
                                        editor,
                                        as: 'span'
                                    });
                                    container.appendChild(component.element);
                                }

                                return container;
                            });

                            return {
                                decorationSet: DecorationSet.empty.add(tr.doc, [decoration]),
                                hasDecoration: true
                            };
                        }

                        // Map decorations through document changes
                        return {
                            decorationSet: oldState.decorationSet.map(tr.mapping, tr.doc),
                            hasDecoration: oldState.hasDecoration
                        };
                    }
                },

                props: {
                    decorations(state) {
                        return this.getState(state)?.decorationSet || DecorationSet.empty;
                    }
                }
            })
        ];
    },

    addCommands() {
        return {
            /**
             * Toggle loading decoration at a specific position
             * @param pos - Document position to show decoration
             * @param loadingHtml - Optional HTML content to show during streaming
             */
            toggleLoadingDecoration: (pos: number, loadingHtml?: string): Command => ({ state, dispatch }) => {
                if (!dispatch) return false;

                const pluginKey = this.options.pluginKey;
                const tr = state.tr.setMeta(pluginKey, {
                    pos,
                    type: "loadingDecoration",
                    remove: false,
                    loadingHtml
                });

                dispatch(tr);
                return true;
            },

            /**
             * Remove loading decoration
             */
            removeLoadingDecoration: (): Command => ({ state, dispatch }) => {
                if (!dispatch) return false;

                const pluginKey = this.options.pluginKey;
                const tr = state.tr.setMeta(pluginKey, {
                    pos: 0,
                    type: "loadingDecoration",
                    remove: true
                });

                dispatch(tr);
                return true;
            }
        };
    }
});

export default TextLoadingDecorationExtension;
