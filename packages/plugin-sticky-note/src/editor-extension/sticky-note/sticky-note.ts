import { Mark, mergeAttributes } from "@kn/editor";
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
 * Locate the contiguous range of a sticky-note mark with a given note_id.
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
                        const range = findStickyNoteRange(state.doc, markType, noteId);
                        if (!range) return false;

                        const newMark = markType.create({
                            ...range.mark.attrs,
                            content,
                        });
                        tr.removeMark(range.from, range.to, markType);
                        tr.addMark(range.from, range.to, newMark);
                        tr.setMeta("addToHistory", false);
                        return true;
                    },

            updateStickyNoteColor:
                (noteId, color) =>
                    ({ tr, state }) => {
                        const markType = state.schema.marks.stickyNote;
                        const range = findStickyNoteRange(state.doc, markType, noteId);
                        if (!range) return false;

                        const newMark = markType.create({
                            ...range.mark.attrs,
                            color,
                        });
                        tr.removeMark(range.from, range.to, markType);
                        tr.addMark(range.from, range.to, newMark);
                        tr.setMeta("addToHistory", false);
                        return true;
                    },

            removeStickyNote:
                (noteId) =>
                    ({ tr, state }) => {
                        const markType = state.schema.marks.stickyNote;
                        const range = findStickyNoteRange(state.doc, markType, noteId);
                        if (!range) return false;
                        tr.removeMark(range.from, range.to, markType);
                        return true;
                    },
        };
    },
});

export default StickyNoteMark;
