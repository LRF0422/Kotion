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
            /**
             * Ask the margin panel to bring the given note into view and focus
             * its mini editor. Purely UI-state; does not modify the document.
             */
            focusStickyNote: (noteId: string | null) => ReturnType;
            /** Ask the margin panel to emphasize a note (bidirectional hover). */
            hoverStickyNote: (noteId: string | null) => ReturnType;
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
 * contiguous span [from, to) it covers. Shared by the margin panel and the
 * plugin's own hover-decoration builder.
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

/**
 * Single source of truth for the sticky-note UI overlay state.
 * `activeNoteId` — the note whose margin card should be scrolled into view and
 *   whose mini editor should take focus (e.g. after creation, or after clicking
 *   a highlight). Also used to open the bottom sheet on mobile.
 * `hoveredNoteId` — the note whose highlight and margin card should be
 *   emphasized (bidirectional hover sync).
 *
 * The panel subscribes to transactions and reads this via `getState()`. It is
 * NEVER duplicated into `editor.storage` or React state (except as derived
 * snapshots).
 */
export interface StickyNoteUIState {
    activeNoteId: string | null;
    hoveredNoteId: string | null;
}

export const stickyNoteUIKey = new PluginKey<StickyNoteUIState>("stickyNoteUI");

/**
 * Meta payload shape. Each field is optional so callers can patch either or
 * both. `activeNoteId: undefined` means "leave alone"; explicit `null` clears.
 */
export interface StickyNoteUIMeta {
    activeNoteId?: string | null;
    hoveredNoteId?: string | null;
}

/**
 * Every doc range covered by `hoveredNoteId`, tagged with the `.is-hovered`
 * class. Complements the mark's own `.sticky-note-highlight` (which stays
 * static). Doing this via decorations keeps hover styling inside ProseMirror
 * rather than reaching into the DOM from React.
 */
function buildHoverDecorations(
    doc: any,
    markType: any,
    hoveredNoteId: string | null
): DecorationSet {
    if (!markType || !hoveredNoteId) return DecorationSet.empty;
    const ranges = findAllStickyNoteRanges(doc, markType, hoveredNoteId);
    if (ranges.length === 0) return DecorationSet.empty;
    return DecorationSet.create(
        doc,
        ranges.map((r) =>
            Decoration.inline(r.from, r.to, { class: "is-hovered" })
        )
    );
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
                    ({ commands, tr, dispatch }) => {
                        const noteId = uuidv4();
                        const ok = commands.setMark("stickyNote", {
                            note_id: noteId,
                            color: options?.color || DEFAULT_STICKY_NOTE_COLOR,
                            content: options?.content || "",
                        });
                        if (ok && dispatch) {
                            // Piggy-back on the same tr so the panel can pick up the
                            // new active note in the same transaction cycle that adds
                            // the mark — no double dispatch, no visible race.
                            tr.setMeta(stickyNoteUIKey, {
                                activeNoteId: noteId,
                            } satisfies StickyNoteUIMeta);
                        }
                        return ok;
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
                        // Content edits enter history — undo/redo restores prior text,
                        // consistent with color / delete behaviour.
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
                        // Also clear the UI state pointing at this note.
                        tr.setMeta(stickyNoteUIKey, {
                            activeNoteId: null,
                            hoveredNoteId: null,
                        } satisfies StickyNoteUIMeta);
                        return true;
                    },

            focusStickyNote:
                (noteId) =>
                    ({ tr, dispatch }) => {
                        if (dispatch) {
                            tr.setMeta(stickyNoteUIKey, {
                                activeNoteId: noteId,
                            } satisfies StickyNoteUIMeta);
                        }
                        return true;
                    },

            hoverStickyNote:
                (noteId) =>
                    ({ tr, dispatch }) => {
                        if (dispatch) {
                            tr.setMeta(stickyNoteUIKey, {
                                hoveredNoteId: noteId,
                            } satisfies StickyNoteUIMeta);
                        }
                        return true;
                    },
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
        return [
            new Plugin<StickyNoteUIState & { deco: DecorationSet }>({
                key: stickyNoteUIKey as PluginKey<any>,
                state: {
                    init: (_config, state) => ({
                        activeNoteId: null,
                        hoveredNoteId: null,
                        deco: buildHoverDecorations(state.doc, state.schema.marks.stickyNote, null),
                    }),
                    apply(tr, old, _oldState, newState) {
                        const meta = tr.getMeta(stickyNoteUIKey) as StickyNoteUIMeta | undefined;
                        const nextActive =
                            meta && "activeNoteId" in meta
                                ? meta.activeNoteId ?? null
                                : old.activeNoteId;
                        const nextHovered =
                            meta && "hoveredNoteId" in meta
                                ? meta.hoveredNoteId ?? null
                                : old.hoveredNoteId;

                        // Rebuild decorations only when the hovered id or the doc
                        // changed; otherwise map the existing set through the tx.
                        let deco = old.deco;
                        const markType = newState.schema.marks.stickyNote;
                        if (nextHovered !== old.hoveredNoteId || tr.docChanged) {
                            deco = buildHoverDecorations(newState.doc, markType, nextHovered);
                        } else if (deco.find().length > 0) {
                            deco = deco.map(tr.mapping, tr.doc);
                        }

                        if (
                            nextActive === old.activeNoteId &&
                            nextHovered === old.hoveredNoteId &&
                            deco === old.deco
                        ) {
                            return old;
                        }
                        return {
                            activeNoteId: nextActive,
                            hoveredNoteId: nextHovered,
                            deco,
                        };
                    },
                },
                props: {
                    decorations(state) {
                        const s = (stickyNoteUIKey as PluginKey<any>).getState(state);
                        return s?.deco ?? DecorationSet.empty;
                    },
                    handleDOMEvents: {
                        // Clicking a highlight sets it as the active note so the
                        // margin panel scrolls to (and focuses) the card. We do
                        // NOT preventDefault so the caret still lands normally.
                        click: (view, event) => {
                            const target = event.target as HTMLElement | null;
                            const highlight = target?.closest?.(".sticky-note-highlight") as HTMLElement | null;
                            if (!highlight) return false;
                            const noteId = highlight.getAttribute("data-note-id");
                            if (!noteId) return false;
                            view.dispatch(
                                view.state.tr.setMeta(stickyNoteUIKey, {
                                    activeNoteId: noteId,
                                } satisfies StickyNoteUIMeta)
                            );
                            return false;
                        },
                        // Symmetric hover sync keeps the margin card and inline
                        // highlight in step, including when the pointer leaves the
                        // editor directly from a highlight.
                        mouseover: (view, event) => {
                            const target = event.target as HTMLElement | null;
                            const highlight = target?.closest?.(".sticky-note-highlight") as HTMLElement | null;
                            const noteId = highlight?.getAttribute("data-note-id") ?? null;
                            const cur = (stickyNoteUIKey as PluginKey<any>).getState(view.state);
                            if (cur?.hoveredNoteId === noteId) return false;
                            view.dispatch(
                                view.state.tr.setMeta(stickyNoteUIKey, {
                                    hoveredNoteId: noteId,
                                } satisfies StickyNoteUIMeta)
                            );
                            return false;
                        },
                        mouseout: (view, event) => {
                            const target = event.target as HTMLElement | null;
                            const highlight = target?.closest?.(".sticky-note-highlight") as HTMLElement | null;
                            if (!highlight) return false;

                            const related = event.relatedTarget as HTMLElement | null;
                            const nextHighlight = related?.closest?.(".sticky-note-highlight") as HTMLElement | null;
                            const currentNoteId = highlight.getAttribute("data-note-id");
                            const nextNoteId = nextHighlight?.getAttribute("data-note-id") ?? null;
                            if (currentNoteId === nextNoteId) return false;

                            view.dispatch(
                                view.state.tr.setMeta(stickyNoteUIKey, {
                                    hoveredNoteId: nextNoteId,
                                } satisfies StickyNoteUIMeta)
                            );
                            return false;
                        },
                    },
                },
            }),
        ];
    },
});

export default StickyNoteMark;
