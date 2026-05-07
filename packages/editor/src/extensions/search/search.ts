import { event as rawEvent } from "@kn/common";
import { Extension, Range } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import scrollIntoView from "scroll-into-view-if-needed";

import { ON_SEARCH_RESULTS, ON_SEARCH_TOGGLE } from "./events";

// The shared event emitter is strictly typed against a core EventMap.
// Cast once so we can emit extension-local events without polluting common.
const event = rawEvent as unknown as {
    emit: (name: string, ...args: any[]) => unknown;
    on: (name: string, fn: (...args: any[]) => void) => unknown;
    off: (name: string, fn?: (...args: any[]) => void) => unknown;
};

declare module "@tiptap/core" {
    interface Storage {
        search: SearchStorage;
    }
    interface Commands<ReturnType> {
        search: {
            /** Set the current search term; triggers re-decoration. */
            setSearchTerm: (searchTerm: string) => ReturnType;
            /** Set the replacement term (does not re-run the search). */
            setReplaceTerm: (replaceTerm: string) => ReturnType;
            /** Update search-matching options (case-sensitive / regex / whole-word). */
            setSearchOptions: (opts: {
                caseSensitive?: boolean;
                disableRegex?: boolean;
                wholeWord?: boolean;
            }) => ReturnType;
            /** Replace the current match. */
            replace: () => ReturnType;
            /** Replace all matches. */
            replaceAll: () => ReturnType;
            /** Jump to the previous match. */
            goToPrevSearchResult: () => ReturnType;
            /** Jump to the next match. */
            goToNextSearchResult: () => ReturnType;
            /** Open the floating search panel. */
            openSearchPanel: () => ReturnType;
            /** Close the floating search panel. */
            closeSearchPanel: () => ReturnType;
            /** Toggle the floating search panel. */
            toggleSearchPanel: () => ReturnType;
        };
    }
}

export interface SearchResult extends Range { }

interface TextNodeWithPosition {
    text: string;
    pos: number;
}

export interface SearchOptions {
    searchTerm: string;
    replaceTerm: string;
    caseSensitive: boolean;
    disableRegex: boolean;
    wholeWord: boolean;
    searchResultClass: string;
    searchResultCurrentClass: string;
}

export interface SearchStorage {
    results: SearchResult[];
    currentIndex: number;
    panelOpen: boolean;
}

interface SearchPluginState {
    decorations: DecorationSet;
    results: SearchResult[];
    currentIndex: number;
    searchTerm: string;
    replaceTerm: string;
    caseSensitive: boolean;
    disableRegex: boolean;
    wholeWord: boolean;
}

interface SearchMeta {
    searchTerm?: string;
    replaceTerm?: string;
    caseSensitive?: boolean;
    disableRegex?: boolean;
    wholeWord?: boolean;
    currentIndex?: number;
    /** Force a rescan even if params haven't changed (after replace). */
    rescan?: boolean;
}

export const searchPluginKey = new PluginKey<SearchPluginState>("search");

/** Escape all regex metacharacters. */
const escapeRegex = (value: string): string =>
    value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

/** Build a RegExp honouring the current search parameters. */
const buildRegex = (
    term: string,
    { disableRegex, caseSensitive, wholeWord }: {
        disableRegex: boolean;
        caseSensitive: boolean;
        wholeWord: boolean;
    }
): RegExp | null => {
    if (!term) return null;
    let source = disableRegex ? escapeRegex(term) : term;
    if (wholeWord) {
        source = `\\b(?:${source})\\b`;
    }
    const flags = caseSensitive ? "gu" : "gui";
    try {
        return new RegExp(source, flags);
    } catch {
        // Invalid user-supplied regex — treat as "no results" rather than crashing.
        return null;
    }
};

/** Scan the doc and compute result ranges. */
const processSearches = (
    doc: ProseMirrorNode,
    searchTerm: RegExp | null
): SearchResult[] => {
    if (!searchTerm) return [];

    const textNodes: TextNodeWithPosition[] = [];
    const results: SearchResult[] = [];

    let lastPos = -1;

    doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        if (lastPos === -1 || pos !== lastPos) {
            textNodes.push({ text: node.text, pos });
        } else {
            const entry = textNodes[textNodes.length - 1];
            entry.text += node.text;
        }
        lastPos = pos + node.nodeSize;
    });

    for (const { text, pos } of textNodes) {
        searchTerm.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = searchTerm.exec(text)) !== null) {
            if (match[0].length === 0) {
                searchTerm.lastIndex += 1;
                continue;
            }
            const from = pos + match.index;
            const to = from + match[0].length;
            results.push({ from, to });
        }
    }

    return results;
};

const buildDecorationSet = (
    doc: ProseMirrorNode,
    results: SearchResult[],
    currentIndex: number,
    searchResultClass: string,
    searchResultCurrentClass: string
): DecorationSet => {
    if (results.length === 0) return DecorationSet.empty;
    const decorations: Decoration[] = results.map((r, i) =>
        Decoration.inline(r.from, r.to, {
            class: i === currentIndex ? searchResultCurrentClass : searchResultClass,
        })
    );
    return DecorationSet.create(doc, decorations);
};

const replaceAtRange = (
    replaceTerm: string,
    range: SearchResult,
    state: EditorState,
    dispatch?: (tr: Transaction) => void
): void => {
    if (!dispatch) return;
    const tr = state.tr.insertText(replaceTerm, range.from, range.to);
    tr.setMeta(searchPluginKey, { rescan: true } as SearchMeta);
    dispatch(tr);
};

const replaceAllMatches = (
    replaceTerm: string,
    results: SearchResult[],
    state: EditorState,
    dispatch?: (tr: Transaction) => void
): boolean => {
    if (!dispatch || results.length === 0) return false;
    const tr = state.tr;
    // Replace in reverse so earlier positions don't shift.
    for (let i = results.length - 1; i >= 0; i -= 1) {
        const { from, to } = results[i];
        tr.insertText(replaceTerm, from, to);
    }
    tr.setMeta(searchPluginKey, { rescan: true, currentIndex: -1 } as SearchMeta);
    dispatch(tr);
    return true;
};

const scrollToResult = (
    view: EditorView,
    result: SearchResult | undefined
): void => {
    if (!result) return;
    try {
        const { node } = view.domAtPos(result.from);
        const el = node instanceof HTMLElement ? node : (node.parentElement ?? null);
        if (el) {
            scrollIntoView(el, {
                behavior: "smooth",
                scrollMode: "if-needed",
                block: "center",
                inline: "nearest",
            });
        }
    } catch {
        // domAtPos can throw after a doc change if positions are stale; ignore.
    }
};

/** Build a SearchPluginState that reflects `next` params against `doc`. */
const rescan = (
    doc: ProseMirrorNode,
    next: SearchPluginState,
    searchResultClass: string,
    searchResultCurrentClass: string
): SearchPluginState => {
    const regex = buildRegex(next.searchTerm, {
        disableRegex: next.disableRegex,
        caseSensitive: next.caseSensitive,
        wholeWord: next.wholeWord,
    });
    const results = processSearches(doc, regex);
    let currentIndex = next.currentIndex;
    if (results.length === 0) {
        currentIndex = -1;
    } else if (currentIndex < 0 || currentIndex >= results.length) {
        currentIndex = 0;
    }
    const decorations = buildDecorationSet(
        doc,
        results,
        currentIndex,
        searchResultClass,
        searchResultCurrentClass
    );
    return { ...next, results, currentIndex, decorations };
};

export const SearchNReplace = Extension.create<SearchOptions, SearchStorage>({
    name: "search",

    addOptions() {
        return {
            searchTerm: "",
            replaceTerm: "",
            caseSensitive: false,
            disableRegex: true,
            wholeWord: false,
            searchResultClass: "search-result",
            searchResultCurrentClass: "search-result-current",
        };
    },

    addStorage() {
        return {
            results: [],
            currentIndex: -1,
            panelOpen: false,
        };
    },

    addCommands() {
        return {
            setSearchTerm:
                (searchTerm: string) =>
                    ({ tr, dispatch }) => {
                        if (dispatch) {
                            tr.setMeta(searchPluginKey, {
                                searchTerm,
                                currentIndex: 0,
                            } as SearchMeta);
                        }
                        return true;
                    },

            setReplaceTerm:
                (replaceTerm: string) =>
                    ({ tr, dispatch }) => {
                        if (dispatch) {
                            tr.setMeta(searchPluginKey, { replaceTerm } as SearchMeta);
                        }
                        return true;
                    },

            setSearchOptions:
                (opts) =>
                    ({ tr, dispatch }) => {
                        if (dispatch) {
                            const meta: SearchMeta = {};
                            if (typeof opts.caseSensitive === "boolean") {
                                meta.caseSensitive = opts.caseSensitive;
                            }
                            if (typeof opts.disableRegex === "boolean") {
                                meta.disableRegex = opts.disableRegex;
                            }
                            if (typeof opts.wholeWord === "boolean") {
                                meta.wholeWord = opts.wholeWord;
                            }
                            tr.setMeta(searchPluginKey, meta);
                        }
                        return true;
                    },

            replace:
                () =>
                    ({ state, dispatch, view }) => {
                        const pluginState = searchPluginKey.getState(state);
                        if (!pluginState) return false;
                        const { replaceTerm, results, currentIndex } = pluginState;
                        const current = results[currentIndex];
                        if (!current) return false;
                        if (dispatch) {
                            replaceAtRange(replaceTerm, current, state, dispatch);
                            // After rescan the same index points to the next occurrence.
                            requestAnimationFrame(() => {
                                const ps = searchPluginKey.getState(view.state);
                                scrollToResult(view, ps?.results[ps.currentIndex]);
                            });
                        }
                        return true;
                    },

            replaceAll:
                () =>
                    ({ state, dispatch }) => {
                        const pluginState = searchPluginKey.getState(state);
                        if (!pluginState) return false;
                        const { replaceTerm, results } = pluginState;
                        if (results.length === 0) return false;
                        return replaceAllMatches(replaceTerm, results, state, dispatch);
                    },

            goToPrevSearchResult:
                () =>
                    ({ state, tr, dispatch, view }) => {
                        const pluginState = searchPluginKey.getState(state);
                        if (!pluginState || !pluginState.results.length) return false;
                        const len = pluginState.results.length;
                        const next = (pluginState.currentIndex + len - 1) % len;
                        if (dispatch) {
                            tr.setMeta(searchPluginKey, { currentIndex: next } as SearchMeta);
                            requestAnimationFrame(() => {
                                scrollToResult(view, pluginState.results[next]);
                            });
                        }
                        return true;
                    },

            goToNextSearchResult:
                () =>
                    ({ state, tr, dispatch, view }) => {
                        const pluginState = searchPluginKey.getState(state);
                        if (!pluginState || !pluginState.results.length) return false;
                        const len = pluginState.results.length;
                        const next = (pluginState.currentIndex + 1) % len;
                        if (dispatch) {
                            tr.setMeta(searchPluginKey, { currentIndex: next } as SearchMeta);
                            requestAnimationFrame(() => {
                                scrollToResult(view, pluginState.results[next]);
                            });
                        }
                        return true;
                    },

            openSearchPanel:
                () =>
                    () => {
                        if (this.storage.panelOpen) return false;
                        this.storage.panelOpen = true;
                        event.emit(ON_SEARCH_TOGGLE);
                        return true;
                    },

            closeSearchPanel:
                () =>
                    ({ tr, dispatch }) => {
                        if (!this.storage.panelOpen) return false;
                        this.storage.panelOpen = false;
                        // Clear search so decorations disappear immediately.
                        if (dispatch) {
                            tr.setMeta(searchPluginKey, {
                                searchTerm: "",
                                currentIndex: -1,
                            } as SearchMeta);
                        }
                        event.emit(ON_SEARCH_TOGGLE);
                        return true;
                    },

            toggleSearchPanel:
                () =>
                    ({ editor }) => {
                        if (this.storage.panelOpen) {
                            return editor.chain().closeSearchPanel().run();
                        }
                        return editor.chain().openSearchPanel().run();
                    },
        };
    },

    addKeyboardShortcuts() {
        return {
            "Mod-f": () => this.editor.commands.openSearchPanel(),
            "Escape": () => {
                if (!this.storage.panelOpen) return false;
                return this.editor.commands.closeSearchPanel();
            },
        };
    },

    addProseMirrorPlugins() {
        const extensionThis = this;
        return [
            new Plugin<SearchPluginState>({
                key: searchPluginKey,
                state: {
                    init(): SearchPluginState {
                        return {
                            decorations: DecorationSet.empty,
                            results: [],
                            currentIndex: -1,
                            searchTerm: extensionThis.options.searchTerm || "",
                            replaceTerm: extensionThis.options.replaceTerm || "",
                            caseSensitive: !!extensionThis.options.caseSensitive,
                            disableRegex: extensionThis.options.disableRegex !== false,
                            wholeWord: !!extensionThis.options.wholeWord,
                        };
                    },
                    apply(tr, old, _oldState, newState): SearchPluginState {
                        const meta = tr.getMeta(searchPluginKey) as SearchMeta | undefined;
                        const { searchResultClass, searchResultCurrentClass } = extensionThis.options;

                        // Merge new params from meta (if any).
                        let next: SearchPluginState = { ...old };
                        let paramsChanged = false;
                        let onlyIndexChanged = false;
                        let forceRescan = false;

                        if (meta) {
                            if ("searchTerm" in meta && meta.searchTerm !== undefined) {
                                if (meta.searchTerm !== next.searchTerm) paramsChanged = true;
                                next.searchTerm = meta.searchTerm;
                            }
                            if ("replaceTerm" in meta && meta.replaceTerm !== undefined) {
                                next.replaceTerm = meta.replaceTerm;
                            }
                            if ("caseSensitive" in meta && typeof meta.caseSensitive === "boolean") {
                                if (meta.caseSensitive !== next.caseSensitive) paramsChanged = true;
                                next.caseSensitive = meta.caseSensitive;
                            }
                            if ("disableRegex" in meta && typeof meta.disableRegex === "boolean") {
                                if (meta.disableRegex !== next.disableRegex) paramsChanged = true;
                                next.disableRegex = meta.disableRegex;
                            }
                            if ("wholeWord" in meta && typeof meta.wholeWord === "boolean") {
                                if (meta.wholeWord !== next.wholeWord) paramsChanged = true;
                                next.wholeWord = meta.wholeWord;
                            }
                            if ("currentIndex" in meta && typeof meta.currentIndex === "number") {
                                next.currentIndex = meta.currentIndex;
                                if (!paramsChanged) onlyIndexChanged = true;
                            }
                            if (meta.rescan) forceRescan = true;
                        }

                        const docChanged = tr.docChanged;

                        if (paramsChanged || forceRescan || (docChanged && next.searchTerm)) {
                            next = rescan(
                                newState.doc,
                                next,
                                searchResultClass,
                                searchResultCurrentClass
                            );
                            // Mirror to public storage for UI consumers.
                            extensionThis.storage.results = next.results;
                            extensionThis.storage.currentIndex = next.currentIndex;
                            event.emit(ON_SEARCH_RESULTS);
                            return next;
                        }

                        if (onlyIndexChanged && next.results.length) {
                            next.decorations = buildDecorationSet(
                                newState.doc,
                                next.results,
                                next.currentIndex,
                                searchResultClass,
                                searchResultCurrentClass
                            );
                            extensionThis.storage.currentIndex = next.currentIndex;
                            event.emit(ON_SEARCH_RESULTS);
                            return next;
                        }

                        if (docChanged) {
                            // No search term: just clear anything stale.
                            if (!next.searchTerm) {
                                if (
                                    extensionThis.storage.results.length !== 0 ||
                                    extensionThis.storage.currentIndex !== -1
                                ) {
                                    extensionThis.storage.results = [];
                                    extensionThis.storage.currentIndex = -1;
                                    event.emit(ON_SEARCH_RESULTS);
                                }
                                return {
                                    ...next,
                                    decorations: DecorationSet.empty,
                                    results: [],
                                    currentIndex: -1,
                                };
                            }
                            // Map existing decorations to the new doc positions.
                            next.decorations = next.decorations.map(tr.mapping, tr.doc);
                            return next;
                        }

                        return next;
                    },
                },
                props: {
                    decorations(state) {
                        return searchPluginKey.getState(state)?.decorations;
                    },
                },
            }),
        ];
    },
});
