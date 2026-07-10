import { Extension, Plugin, PluginKey } from "@kn/editor";
import { v4 as uuidv4 } from "uuid";
import { getCurrentUser } from "./comment";
import type { CommentItem } from "./types";

export interface BlockCommentThread {
    threadId: string;
    blockId: string;
    comments: CommentItem[];
}

const BlockCommentPluginKey = new PluginKey("blockComment");

interface BlockCommentState {
    threads: BlockCommentThread[];
}

/**
 * Read the current block-comment threads from the editor's plugin state.
 * Exported so the margin panel can collect block-level threads.
 */
export function getBlockCommentThreads(editor: any): BlockCommentThread[] {
    const state = BlockCommentPluginKey.getState(editor.state);
    return state?.threads ?? [];
}

/**
 * Block-level comment extension.
 *
 * Unlike the inline `comment` Mark (which can only highlight text ranges),
 * this Extension stores comment threads keyed by **block id** in a
 * ProseMirror plugin state.  This lets users comment on ANY block —
 * including atom nodes (images, charts, embeds) that contain no text.
 *
 * The threads live in plugin state (not in the document JSON) so they
 * survive text edits within the block without being split or lost.
 */
export const BlockCommentExt = Extension.create({
    name: "blockComment",

    addStorage() {
        return {
            activeBlockThreadId: null as string | null,
        };
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: BlockCommentPluginKey,
                state: {
                    init: (): BlockCommentState => ({ threads: [] }),
                    apply(tr: any, prevState: BlockCommentState) {
                        const meta = tr.getMeta(BlockCommentPluginKey);
                        if (meta) return meta;
                        return prevState;
                    },
                },
            }),
        ];
    },

    addCommands() {
        const readState = (state: any): BlockCommentState =>
            BlockCommentPluginKey.getState(state) ?? { threads: [] };

        return {
            addBlockComment: (blockId: string) => ({ tr, state, dispatch }) => {
                const user = getCurrentUser();
                const thread: BlockCommentThread = {
                    threadId: uuidv4(),
                    blockId,
                    comments: [
                        {
                            id: uuidv4(),
                            user,
                            content: "",
                            createdAt: Date.now(),
                            parentId: null,
                        },
                    ],
                };

                const prev = readState(state);
                tr.setMeta(BlockCommentPluginKey, {
                    threads: [...prev.threads, thread],
                });
                (this.editor.storage as any).blockComment.activeBlockThreadId =
                    thread.threadId;

                if (dispatch) dispatch(tr);
                return true;
            },

            setFirstBlockComment: (threadId: string, content: string) => ({
                tr,
                state,
                dispatch,
            }) => {
                const prev = readState(state);
                const threads = prev.threads.map((t) => {
                    if (t.threadId !== threadId) return t;
                    const comments = [...t.comments];
                    if (comments.length > 0) {
                        comments[0] = {
                            ...comments[0],
                            content: content.trim(),
                        };
                    } else {
                        comments.push({
                            id: uuidv4(),
                            user: getCurrentUser(),
                            content: content.trim(),
                            createdAt: Date.now(),
                            parentId: null,
                        });
                    }
                    return { ...t, comments };
                });

                tr.setMeta(BlockCommentPluginKey, { threads });
                if (dispatch) dispatch(tr);
                return true;
            },

            replyBlockComment: (threadId: string, content: string, parentId?: string) => ({
                tr,
                state,
                dispatch,
            }) => {
                const prev = readState(state);
                const newItem: CommentItem = {
                    id: uuidv4(),
                    user: getCurrentUser(),
                    content: content.trim(),
                    createdAt: Date.now(),
                    parentId: parentId || null,
                };
                const threads = prev.threads.map((t) =>
                    t.threadId === threadId
                        ? { ...t, comments: [...t.comments, newItem] }
                        : t,
                );

                tr.setMeta(BlockCommentPluginKey, { threads });
                if (dispatch) dispatch(tr);
                return true;
            },

            editBlockComment: (threadId: string, commentId: string, content: string) => ({
                tr,
                state,
                dispatch,
            }) => {
                const prev = readState(state);
                const threads = prev.threads.map((t) => {
                    if (t.threadId !== threadId) return t;
                    return {
                        ...t,
                        comments: t.comments.map((c) =>
                            c.id === commentId
                                ? {
                                      ...c,
                                      content: content.trim(),
                                      updatedAt: Date.now(),
                                  }
                                : c,
                        ),
                    };
                });

                tr.setMeta(BlockCommentPluginKey, { threads });
                if (dispatch) dispatch(tr);
                return true;
            },

            deleteBlockComment: (threadId: string, commentId: string) => ({
                tr,
                state,
                dispatch,
            }) => {
                const prev = readState(state);
                const threads = prev.threads
                    .map((t) => {
                        if (t.threadId !== threadId) return t;
                        return {
                            ...t,
                            comments: t.comments.filter(
                                (c) => c.id !== commentId,
                            ),
                        };
                    })
                    // Remove threads that have no comments left
                    .filter((t) => t.comments.length > 0);

                tr.setMeta(BlockCommentPluginKey, { threads });
                if (
                    (this.editor.storage as any).blockComment.activeBlockThreadId ===
                    threadId
                ) {
                    (this.editor.storage as any).blockComment.activeBlockThreadId = null;
                }
                if (dispatch) dispatch(tr);
                return true;
            },

            resolveBlockComment: (threadId: string) => ({
                tr,
                state,
                dispatch,
            }) => {
                const prev = readState(state);
                const threads = prev.threads.filter(
                    (t) => t.threadId !== threadId,
                );

                tr.setMeta(BlockCommentPluginKey, { threads });
                if (
                    (this.editor.storage as any).blockComment.activeBlockThreadId ===
                    threadId
                ) {
                    (this.editor.storage as any).blockComment.activeBlockThreadId = null;
                }
                if (dispatch) dispatch(tr);
                return true;
            },
        };
    },
});
