import { Mark, mergeAttributes, Plugin, PluginKey, Decoration, DecorationSet } from "@kn/editor";
import { v4 as uuidv4 } from "uuid";
import { DEFAULT_STICKY_NOTE_COLOR } from "./constants";
import "./sticky-note.css";

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        stickyNote: {
            /** Add a sticky-note mark on the current selection. */
            addStickyNote: (options?: { color?: string; content?: string }) => ReturnType;
            /** Update the rich-text content of an existing sticky note. */
            updateStickyNoteContent: (noteId: string, content: string) => ReturnType;
            /** Update the color of an existing sticky note. */
            updateStickyNoteColor: (noteId: string, color: string) => ReturnType;
            /** Remove a sticky note entirely. */
            removeStickyNote: (noteId: string) => ReturnType;
        };
    }
}

/**
 * Locate the FIRST contiguous range of a sticky-note mark with a given note_id.
 * Used by static.tsx for caret placement after adding a note.
 * For update/remove commands that need to cover ALL fragments, use
 * findAllStickyNoteRanges instead.
 */
export function findStickyNoteRange(
    doc: any,
    markType: any,
    noteId: string
): { from: number; to: number; mark: any } | null {
    let result: { from: number; to: number; mark: any } | null = null;

    doc.descendants((node: any, pos: number) => {
        if (result) return false;
        if (!node.isText) return;

        const mark = node.marks.find(
            (m: any) => m.type === markType && m.attrs.note_id === noteId
        );
        if (!mark) return;

        let from = pos;
        let to = pos + node.nodeSize;

        // Extend forward across contiguous text nodes carrying the same note_id.
        while (to < doc.content.size) {
            const $pos = doc.resolve(to);
            const nextIndex = $pos.index($pos.depth);
            const parentNode = $pos.parent;
            if (nextIndex >= parentNode.childCount) break;

            const child = parentNode.child(nextIndex);
            const childMark = child.marks.find(
                (m: any) => m.type === markType && m.attrs.note_id === noteId
            );
            if (!childMark) break;
            to += child.nodeSize;
        }

        result = { from, to, mark };
    });

    return result;
}

/**
 * Collect ALL disjoint ranges for a sticky-note mark with the given note_id.
 * Unlike findStickyNoteRange (which only returns the first contiguous span),
 * this returns every fragment so update/remove commands can operate on the
 * complete note even if it was split by intermediate edits.
 */
export function findAllStickyNoteRanges(
    doc: any,
    markType: any,
    noteId: string
): { from: number; to: number; mark: any }[] {
    const ranges: { from: number; to: number; mark: any }[] = [];

    doc.descendants((node: any, pos: number) => {
        if (!node.isText) return;
        const mark = node.marks.find(
            (m: any) => m.type === markType && m.attrs.note_id === noteId
        );
        if (!mark) return;

        // Skip if this node is already covered by the last range (the forward
        // extension from a previous node included it).
        if (ranges.length > 0 && ranges[ranges.length - 1].to > pos) return;

        let from = pos;
        let to = pos + node.nodeSize;

        // Extend forward across contiguous text nodes carrying the same note_id.
        while (to < doc.content.size) {
            const $pos = doc.resolve(to);
            const nextIndex = $pos.index($pos.depth);
            const parentNode = $pos.parent;
            if (nextIndex >= parentNode.childCount) break;

            const child = parentNode.child(nextIndex);
            const childMark = child.marks.find(
                (m: any) => m.type === markType && m.attrs.note_id === noteId
            );
            if (!childMark) break;
            to += child.nodeSize;
        }

        ranges.push({ from, to, mark });
    });

    return ranges;
}

export interface StickyNoteRange {
    noteId: string;
    from: number;
    to: number;
    color: string;
    content: string;
}

/**
 * Collect every sticky-note mark in the document, grouped by note_id, with the
 * contiguous span [from, to) it covers. Shared by the inline mobile markers and
 * (conceptually) the margin panel.
 */
export function collectStickyNotes(doc: any, markType: any): StickyNoteRange[] {
    const map = new Map<string, StickyNoteRange>();
    if (!markType) return [];
    doc.descendants((node: any, pos: number) => {
        if (!node.isText) return;
        const mark = node.marks.find((m: any) => m.type === markType);
        if (!mark) return;
        const noteId = mark.attrs.note_id;
        if (!noteId) return;
        const existing = map.get(noteId);
        if (existing) {
            existing.to = Math.max(existing.to, pos + node.nodeSize);
        } else {
            map.set(noteId, {
                noteId,
                from: pos,
                to: pos + node.nodeSize,
                color: mark.attrs.color || DEFAULT_STICKY_NOTE_COLOR,
                content: mark.attrs.content || "",
            });
        }
    });
    return Array.from(map.values());
}

const stickyNoteMarkerKey = new PluginKey("stickyNoteMarker");

/**
 * Build widget decorations: a small tappable marker at the END of each note's
 * range. The marker is hidden on tablet/desktop via CSS (the margin cards are
 * used there) and only shown on mobile, where tapping it opens the note's
 * bottom sheet. Being a widget keeps it inline with the text and scrolling
 * naturally — no fragile fixed-positioning.
 */
function buildStickyNoteDecorations(doc: any, markType: any): DecorationSet {
    if (!markType) return DecorationSet.empty;
    const notes = collectStickyNotes(doc, markType);
    const decorations = notes.map((n) =>
        Decoration.widget(
            n.to,
            () => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "sticky-note-marker";
                btn.setAttribute("data-note-id", n.noteId);
                btn.setAttribute("data-color", n.color);
                btn.setAttribute("contenteditable", "false");
                btn.setAttribute("aria-label", "Open sticky note");
                return btn;
            },
            { side: 1, key: `sticky-note-marker-${n.noteId}-${n.color}`, ignoreSelection: true }
        )
    );
    return DecorationSet.create(doc, decorations);
}

const StickyNoteMark = Mark.create({
    name: "stickyNote",

    // Allow nesting/coexistence with comments and other inline marks.
    inclusive: false,
    excludes: "",

    addOptions() {
        return {
            HTMLAttributes: {
                class: "sticky-note-highlight",
            },
        };
    },

    addAttributes() {
        return {
            note_id: {
                default: null,
                parseHTML: (el: HTMLElement) => el.getAttribute("data-note-id"),
                renderHTML: (attrs) => ({ "data-note-id": attrs.note_id }),
            },
            color: {
                default: DEFAULT_STICKY_NOTE_COLOR,
                parseHTML: (el: HTMLElement) =>
                    el.getAttribute("data-color") || DEFAULT_STICKY_NOTE_COLOR,
                renderHTML: (attrs) => ({ "data-color": attrs.color }),
            },
            content: {
                default: "",
                parseHTML: (el: HTMLElement) => el.getAttribute("data-content") || "",
                renderHTML: (attrs) => ({ "data-content": attrs.content || "" }),
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "span[data-note-id]",
                getAttrs: (el) =>
                    !!(el as HTMLSpanElement).getAttribute("data-note-id")?.trim() && null,
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["span", mergeAttributes(HTMLAttributes, this.options.HTMLAttributes), 0];
    },

    addCommands() {
        return {
            addStickyNote:
                (options) =>
                    ({ commands }) => {
                        return commands.setMark("stickyNote", {
                            note_id: uuidv4(),
                            color: options?.color || DEFAULT_STICKY_NOTE_COLOR,
                            content: options?.content || "",
                        });
                    },

            updateStickyNoteContent:
                (noteId, content) =>
                    ({ tr, state }) => {
                        const markType = state.schema.marks.stickyNote;
                        const ranges = findAllStickyNoteRanges(state.doc, markType, noteId);
                        if (ranges.length === 0) return false;

                        for (const range of ranges) {
                            const newMark = markType.create({
                                ...range.mark.attrs,
                                content,
                            });
                            tr.removeMark(range.from, range.to, markType);
                            tr.addMark(range.from, range.to, newMark);
                        }
                        tr.setMeta("addToHistory", false);
                        return true;
                    },

            updateStickyNoteColor:
                (noteId, color) =>
                    ({ tr, state }) => {
                        const markType = state.schema.marks.stickyNote;
                        const ranges = findAllStickyNoteRanges(state.doc, markType, noteId);
                        if (ranges.length === 0) return false;

                        for (const range of ranges) {
                            const newMark = markType.create({
                                ...range.mark.attrs,
                                color,
                            });
                            tr.removeMark(range.from, range.to, markType);
                            tr.addMark(range.from, range.to, newMark);
                        }
                        // Color is a discrete user action — allow undo/redo.
                        return true;
                    },

            removeStickyNote:
                (noteId) =>
                    ({ tr, state }) => {
                        const markType = state.schema.marks.stickyNote;
                        const ranges = findAllStickyNoteRanges(state.doc, markType, noteId);
                        if (ranges.length === 0) return false;
                        for (const range of ranges) {
                            tr.removeMark(range.from, range.to, markType);
                        }
                        return true;
                    },
        };
    },

    addStorage() {
        // The note whose mobile bottom-sheet is open (set by tapping an inline
        // marker or clicking a highlight). Also tracked by the desktop margin
        // panel to emphasize / scroll the active card into view.
        // hoveredNoteId powers the bidirectional hover-sync between a highlight
        // in the document and its margin card.
        return {
            activeNoteId: null as string | null,
            hoveredNoteId: null as string | null,
        };
    },

    addKeyboardShortcuts() {
        return {
            "Mod-Alt-s": () => {
                const editor = this.editor;
                if (editor.isActive("stickyNote")) {
                    const attrs = editor.getAttributes("stickyNote");
                    const noteId = attrs.note_id;
                    if (noteId) return editor.commands.removeStickyNote(noteId);
                    return false;
                }
                const { selection } = editor.state;
                if (selection.empty) return false;
                return editor.commands.addStickyNote();
            },
        };
    },

    addProseMirrorPlugins() {
        const extension = this;
        return [
            new Plugin({
                key: stickyNoteMarkerKey,
                state: {
                    init: (_config, state) =>
                        buildStickyNoteDecorations(state.doc, state.schema.marks.stickyNote),
                    apply(tr, old, _oldState, newState) {
                        // Only re-walk the doc when it actually changed; otherwise
                        // just map existing decorations through the transaction.
                        if (!tr.docChanged) return old.map(tr.mapping, tr.doc);
                        return buildStickyNoteDecorations(newState.doc, newState.schema.marks.stickyNote);
                    },
                },
                props: {
                    decorations(state) {
                        return stickyNoteMarkerKey.getState(state);
                    },
                    handleDOMEvents: {
                        // Prevent the caret from landing on the marker button.
                        mousedown: (_view, event) => {
                            const target = event.target as HTMLElement | null;
                            if (target?.closest?.(".sticky-note-marker")) {
                                event.preventDefault();
                                return true;
                            }
                            return false;
                        },
                        // Tap a marker → open that note's bottom sheet. We store the
                        // id and dispatch an empty meta transaction so the React
                        // margin panel (which listens to "transaction") picks it up.
                        // Clicking a highlight (desktop) also sets activeNoteId so
                        // the margin panel can scroll to / emphasize the card.
                        click: (view, event) => {
                            const target = event.target as HTMLElement | null;

                            // Marker click (mobile) — open bottom sheet.
                            const marker = target?.closest?.(".sticky-note-marker") as HTMLElement | null;
                            if (marker) {
                                const noteId = marker.getAttribute("data-note-id");
                                if (noteId) {
                                    extension.storage.activeNoteId = noteId;
                                    view.dispatch(view.state.tr.setMeta("stickyNoteMarkerClick", true));
                                }
                                event.preventDefault();
                                return true;
                            }

                            // Highlight click — set active note so the margin
                            // panel can scroll to / emphasize the card. Don't
                            // preventDefault so the caret is still placed.
                            const highlight = target?.closest?.(".sticky-note-highlight") as HTMLElement | null;
                            if (highlight) {
                                const noteId = highlight.getAttribute("data-note-id");
                                if (noteId) {
                                    extension.storage.activeNoteId = noteId;
                                    view.dispatch(view.state.tr.setMeta("stickyNoteHighlightClick", true));
                                }
                            }
                            return false;
                        },
                        // Hover sync: when the pointer enters / leaves a
                        // highlight, update hoveredNoteId so the margin panel
                        // can emphasize the corresponding card.
                        mouseover: (view, event) => {
                            const target = event.target as HTMLElement | null;
                            const highlight = target?.closest?.(".sticky-note-highlight") as HTMLElement | null;
                            const noteId = highlight?.getAttribute("data-note-id") ?? null;
                            if (extension.storage.hoveredNoteId !== noteId) {
                                extension.storage.hoveredNoteId = noteId;
                                view.dispatch(view.state.tr.setMeta("stickyNoteHover", true));
                            }
                            return false;
                        },
                    },
                },
            }),
        ];
    },
});

export default StickyNoteMark;
