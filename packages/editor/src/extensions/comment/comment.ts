import { Mark, mergeAttributes } from "@tiptap/core";
import { v4 as uuidv4 } from "uuid";
import type { CommentItem, CommentOptions, CommentStorage } from "./types";
import "./types";

export type { CommentUser, CommentItem, CommentOptions, CommentStorage } from "./types";

/**
 * Find the range of a comment mark with a specific thread_id in the document.
 */
function findMarkRange(
    doc: any,
    markType: any,
    threadId: string
): { from: number; to: number; mark: any } | null {
    let result: { from: number; to: number; mark: any } | null = null;

    doc.descendants((node: any, pos: number) => {
        if (result) return false;
        if (!node.isText) return;

        const mark = node.marks.find(
            (m: any) => m.type === markType && m.attrs.thread_id === threadId
        );
        if (!mark) return;

        // Found the start, now find the full range
        let from = pos;
        let to = pos + node.nodeSize;

        // Extend forward to find contiguous marks with same thread_id
        const resolvedTo = doc.resolve(to);
        while (to < doc.content.size) {
            const nextNode = resolvedTo.nodeAfter;
            if (!nextNode) break;

            const parent = doc.resolve(to).parent;
            let found = false;
            // Check next text node at position `to`
            let nextPos = to;
            const $pos = doc.resolve(nextPos);
            const nextIndex = $pos.index($pos.depth);
            const parentNode = $pos.parent;
            if (nextIndex < parentNode.childCount) {
                const child = parentNode.child(nextIndex);
                const childMark = child.marks.find(
                    (m: any) => m.type === markType && m.attrs.thread_id === threadId
                );
                if (childMark) {
                    to = nextPos + child.nodeSize;
                    found = true;
                }
            }
            if (!found) break;
        }

        result = { from, to, mark };
    });

    return result;
}

const Comments = Mark.create<CommentOptions, CommentStorage>({
    name: 'comment',

    addOptions() {
        return {
            user: { id: '', name: 'Anonymous', avatar: '' },
            HTMLAttributes: {
                class: 'bg-muted/50 cursor-pointer p-1 rounded-md hover:bg-muted outline'
            },
        };
    },

    addStorage() {
        return {
            activeThreadId: null,
        };
    },

    addAttributes() {
        return {
            thread_id: {
                default: null,
                parseHTML: (el: HTMLElement) => el.getAttribute('data-thread-id'),
                renderHTML: (attrs) => ({ 'data-thread-id': attrs.thread_id }),
            },
            comments: {
                default: '[]',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-comments') || '[]',
                renderHTML: (attrs) => ({ 'data-comments': attrs.comments }),
            },
        };
    },

    addCommands() {
        return {
            addComment: (content: string) => ({ commands }) => {
                const user = this.options.user?.id
                    ? this.options.user
                    : { id: 'anonymous', name: 'Anonymous', avatar: '' };

                const item: CommentItem = {
                    id: uuidv4(),
                    user,
                    content: content.trim(),
                    createdAt: Date.now(),
                    parentId: null,
                };

                const threadId = uuidv4();

                return commands.setMark('comment', {
                    thread_id: threadId,
                    comments: JSON.stringify([item]),
                });
            },

            replyComment: (threadId: string, content: string, parentId?: string) => ({ tr, state }) => {
                const markType = state.schema.marks.comment;
                const range = findMarkRange(state.doc, markType, threadId);
                if (!range) return false;

                const user = this.options.user?.id
                    ? this.options.user
                    : { id: 'anonymous', name: 'Anonymous', avatar: '' };

                const existingComments: CommentItem[] = JSON.parse(range.mark.attrs.comments || '[]');

                const newItem: CommentItem = {
                    id: uuidv4(),
                    user,
                    content: content.trim(),
                    createdAt: Date.now(),
                    parentId: parentId || null,
                };

                existingComments.push(newItem);

                // Replace mark: remove old, add new with updated attrs
                const newMark = markType.create({
                    thread_id: threadId,
                    comments: JSON.stringify(existingComments),
                });

                tr.removeMark(range.from, range.to, markType);
                tr.addMark(range.from, range.to, newMark);
                tr.setMeta('addToHistory', false);

                return true;
            },

            deleteComment: (threadId: string, commentId: string) => ({ tr, state }) => {
                const markType = state.schema.marks.comment;
                const range = findMarkRange(state.doc, markType, threadId);
                if (!range) return false;

                const existingComments: CommentItem[] = JSON.parse(range.mark.attrs.comments || '[]');
                const filtered = existingComments.filter((c) => c.id !== commentId);

                if (filtered.length === 0) {
                    // No comments left, remove the mark entirely
                    tr.removeMark(range.from, range.to, markType);
                } else {
                    const newMark = markType.create({
                        thread_id: threadId,
                        comments: JSON.stringify(filtered),
                    });
                    tr.removeMark(range.from, range.to, markType);
                    tr.addMark(range.from, range.to, newMark);
                }

                tr.setMeta('addToHistory', false);
                return true;
            },

            resolveThread: (threadId: string) => ({ tr, state }) => {
                const markType = state.schema.marks.comment;
                const range = findMarkRange(state.doc, markType, threadId);
                if (!range) return false;

                tr.removeMark(range.from, range.to, markType);
                return true;
            },
        };
    },

    onSelectionUpdate() {
        if (!this.editor.isActive('comment')) {
            this.storage.activeThreadId = null;
        } else {
            const attrs = this.editor.getAttributes('comment');
            this.storage.activeThreadId = attrs.thread_id || null;
        }
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-thread-id]',
                getAttrs: (el) =>
                    !!(el as HTMLSpanElement).getAttribute('data-thread-id')?.trim() && null,
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, this.options.HTMLAttributes), 0];
    },
});

export default Comments;
