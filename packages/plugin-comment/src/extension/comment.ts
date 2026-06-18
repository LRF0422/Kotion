import { Mark, mergeAttributes, Plugin, PluginKey, TextSelection } from "@kn/editor";
import { v4 as uuidv4 } from "uuid";
import { store } from "@kn/common";
import type { CommentUser, CommentItem, CommentOptions, CommentStorage } from "./types";
import "./types";
import "./comment.css";

export type { CommentUser, CommentItem, CommentOptions, CommentStorage } from "./types";

/**
 * Get the current user info from the Redux store.
 */
export function getCurrentUser(): CommentUser {
    const state = store.getState();
    const userInfo = state.userInfo;
    if (userInfo?.id) {
        return {
            id: userInfo.id,
            name: userInfo.name || 'Anonymous',
            avatar: userInfo.avatar || '',
        };
    }
    return { id: 'anonymous', name: 'Anonymous', avatar: '' };
}

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
            HTMLAttributes: {
                class: 'comment-highlight',
                style: 'background-color: rgb(255 212 0 / 0.14); border-bottom: 2px solid rgb(255 212 0 / 0.4); cursor: pointer; padding-bottom: 1px; transition: background-color 0.2s;',
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
            addComment: (content: string) => ({ commands, editor }) => {
                const user = getCurrentUser();

                const item: CommentItem = {
                    id: uuidv4(),
                    user,
                    content: content.trim(),
                    createdAt: Date.now(),
                    parentId: null,
                };

                const threadId = uuidv4();

                // setMark keeps the current selection unchanged, so the extension's
                // onSelectionUpdate hook won't fire and the margin panel would never
                // learn about the new thread. Mark it active up-front so the panel
                // opens on the setMark transaction.
                ((editor.storage as any).comment as CommentStorage).activeThreadId = threadId;

                return commands.setMark('comment', {
                    thread_id: threadId,
                    comments: JSON.stringify([item]),
                });
            },

            setFirstComment: (threadId: string, content: string) => ({ tr, state }) => {
                const markType = state.schema.marks.comment;
                const range = findMarkRange(state.doc, markType, threadId);
                if (!range) return false;

                const user = getCurrentUser();

                const newItem: CommentItem = {
                    id: uuidv4(),
                    user,
                    content: content.trim(),
                    createdAt: Date.now(),
                    parentId: null,
                };

                const newMark = markType.create({
                    thread_id: threadId,
                    comments: JSON.stringify([newItem]),
                });

                tr.removeMark(range.from, range.to, markType);
                tr.addMark(range.from, range.to, newMark);
                tr.setMeta('addToHistory', false);

                return true;
            },

            replyComment: (threadId: string, content: string, parentId?: string) => ({ tr, state }) => {
                const markType = state.schema.marks.comment;
                const range = findMarkRange(state.doc, markType, threadId);
                if (!range) return false;

                const user = getCurrentUser();

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

            editComment: (threadId: string, commentId: string, content: string) => ({ tr, state }) => {
                const markType = state.schema.marks.comment;
                const range = findMarkRange(state.doc, markType, threadId);
                if (!range) return false;

                const trimmed = content.trim();
                if (!trimmed) return false;

                const existingComments: CommentItem[] = JSON.parse(range.mark.attrs.comments || '[]');
                let changed = false;
                const updated = existingComments.map((c) => {
                    if (c.id !== commentId) return c;
                    changed = true;
                    return { ...c, content: trimmed, updatedAt: Date.now() };
                });
                if (!changed) return false;

                const newMark = markType.create({
                    thread_id: threadId,
                    comments: JSON.stringify(updated),
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

    addProseMirrorPlugins() {
        const editor = this.editor;

        return [
            new Plugin({
                key: new PluginKey('commentClick'),
                props: {
                    handleDOMEvents: {
                        click: (view, event) => {
                            // Only handle in non-editable mode
                            if (editor.isEditable) return false;

                            const target = event.target as HTMLElement;
                            const commentSpan = target.closest('[data-thread-id]') as HTMLElement;

                            if (commentSpan) {
                                const threadId = commentSpan.getAttribute('data-thread-id');
                                if (threadId) {
                                    const markType = view.state.schema.marks.comment;
                                    const range = findMarkRange(view.state.doc, markType, threadId);
                                    if (range) {
                                        const tr = view.state.tr.setSelection(
                                            TextSelection.create(view.state.doc, range.from, range.to)
                                        );
                                        view.dispatch(tr);
                                    }
                                }
                                return true;
                            }

                            // Click outside comment span - reset selection to hide popup
                            try {
                                const tr = view.state.tr.setSelection(
                                    TextSelection.create(view.state.doc, 1)
                                );
                                view.dispatch(tr);
                            } catch {
                                // Ignore - position might be invalid
                            }
                            return true;
                        },
                    },
                },
            }),
            new Plugin({
                key: new PluginKey('commentKeyDown'),
                props: {
                    handleKeyDown(view, evt) {
                        if (evt.key !== 'Enter') return false;
                        if (!editor.isActive('comment')) return false;

                        const { state, dispatch } = view;
                        const { $from } = state.selection;

                        // Find the end position of the comment mark
                        const commentMarkType = state.schema.marks.comment;
                        let endPos = $from.pos;

                        // Find the end of the current comment mark
                        for (let d = $from.depth; d > 0; d--) {
                            const node = $from.node(d);
                            if (node.marks.some((m) => m.type === commentMarkType)) {
                                const index = $from.index(d);
                                if (index + 1 < node.childCount) {
                                    // Move to after this node
                                    endPos = $from.pos - $from.parentOffset + node.nodeSize;
                                    break;
                                } else {
                                    // Last child, go to end of this node
                                    endPos = $from.pos + 1;
                                }
                                break;
                            }
                        }

                        const tr = state.tr.setSelection(
                            TextSelection.create(state.doc, Math.min(endPos, state.doc.content.size))
                        );
                        if (dispatch) dispatch(tr);
                        return true;
                    },
                },
            }),
        ];
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
