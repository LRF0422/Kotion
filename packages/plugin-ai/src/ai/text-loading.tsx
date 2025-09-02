import { Plugin, PluginKey, ReactRenderer } from "@kn/editor";
import { Decoration, DecorationSet } from "@kn/editor";
import { Command, Extension } from "@kn/editor";
import { Loader2 } from "@kn/icon";
import { cn, MessageLoading } from "@kn/ui";
import React from "react";

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        textLoadingDecoration: {
            toggleLoadingDecoration: (pos: number, loadingHtml?: string) => ReturnType;
            removeLoadingDecoration: () => ReturnType;
        };
    }
}

export const loadingDecorationKey = new PluginKey<LoadingDecorationState>("loadingDecoration");

interface LoadingDecorationState {
    decorationSet: DecorationSet;
    hasDecoration: boolean;
}

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

                            if (remove) {
                                return {
                                    decorationSet: DecorationSet.empty,
                                    hasDecoration: false
                                };
                            }

                            const decoration = Decoration.widget(pos, () => {
                                const container = document.createElement("span");
                                container.className = "loading-decoration p-1 border rounded-md outline";

                                if (loadingHtml) {
                                    container.innerHTML = loadingHtml;
                                } else {
                                    const span = document.createElement("span");
                                    const component = new ReactRenderer(() => (<span>
                                        <Loader2 className=" w-4 h-4 animate-spin inline" />
                                    </span>), {
                                        editor,
                                        as: 'span'
                                    })
                                    span.innerText = "loading...";
                                    container.appendChild(component.element);
                                }

                                return container;
                            });

                            return {
                                decorationSet: DecorationSet.empty.add(tr.doc, [decoration]),
                                hasDecoration: true
                            };
                        }

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
