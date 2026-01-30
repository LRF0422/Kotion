import { Mark, mergeAttributes } from "@tiptap/core";
import { v4 as uuidv4 } from "uuid";
import { findIndex } from 'lodash'
import { Doc } from "yjs";

export interface UserInfo {
    id: string;
    name: string;
    avatar?: string;
}

export interface CommentInterface {
    user: UserInfo;
    uuid: string;
    comment: string;
    date: number;
    parent_id: string | null;
    parent_title: string | null;
}

export interface Comment {
    comment: string;
    parent_id: string | null;
}

export interface CustomCommentInterface {
    threadId: string;
    comments: CommentInterface[];
}

interface CommentsStorageInterface {
    comments: CustomCommentInterface[];
    comment_id: string | null;
}

export interface CommentOptionsInterface {
    user: UserInfo;
    document?: Doc;
    HTMLAttributes: Record<string, any>;
}


declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        comment: {
            addComments: (comment: Comment) => ReturnType,
            removeSpecificComment: (threadId: string, commentId: string) => ReturnType,
            syncComments: () => ReturnType
        }
    }
}


const Comments = Mark.create<CommentOptionsInterface, CommentsStorageInterface>({
    name: 'comment',
    addOptions() {
        return {
            user: { id: '', name: 'Anonymous', avatar: '' },
            HTMLAttributes: {
                class: 'bg-muted/50 cursor-pointer p-1 rounded-md hover:bg-muted outline'
            },
        }
    },
    addStorage() {
        return {
            comments: [],
            comment_id: null
        }
    },
    addAttributes() {
        return {
            comment_id: {
                parseHTML: (element: any) => element.getAttribute('comment_id'),
                renderHTML: (attrs) => ({ 'comment_id': attrs.comment_id }),
            },
        }
    },
    addCommands() {
        return {
            addComments: comment => ({ commands }) => {
                try {
                    // Validate user info first
                    if (!this.options.user || !this.options.user.id) {
                        console.warn('[Comment Extension] User information not configured, using default');
                        // Allow anonymous users with default info
                        this.options.user = {
                            id: 'anonymous',
                            name: 'Anonymous',
                            avatar: ''
                        };
                    }

                    // Allow empty comments for new threads (to be filled later in bubble menu)
                    const commentText = comment.comment?.trim() || '';

                    const finalComment: CommentInterface = {
                        uuid: uuidv4(),
                        user: this.options.user,
                        comment: commentText,
                        date: Date.now(),
                        parent_title: null,
                        parent_id: null
                    };

                    if (comment.parent_id) {
                        // Add reply to existing thread
                        const threadIndex = findIndex(this.storage.comments, { threadId: "" });

                        if (threadIndex === -1) {
                            console.error('[Comment Extension] Thread not found');
                            return false;
                        }

                        const thread = this.storage.comments[threadIndex];
                        const parentCommentIndex = findIndex(thread.comments, { uuid: comment.parent_id });

                        if (parentCommentIndex === -1) {
                            console.error('[Comment Extension] Parent comment not found');
                            return false;
                        }

                        const parentComment = thread.comments[parentCommentIndex];
                        finalComment.parent_id = parentComment.uuid;
                        finalComment.parent_title = parentComment.comment.substring(0, 50);

                        thread.comments.push(finalComment);
                    } else {
                        // Create new thread
                        const newThread: CustomCommentInterface = {
                            threadId: uuidv4(),
                            comments: [finalComment]
                        };

                        commands.setMark('comment', { 'comment_id': newThread.threadId });
                        this.storage.comments.push(newThread);
                    }

                    // Sync to document after adding comment
                    commands.syncComments();

                    return true;
                } catch (error) {
                    console.error('[Comment Extension] Error adding comment:', error);
                    return false;
                }
            },
            removeSpecificComment: (threadId: string, commentId: string) => ({ commands }) => {
                try {
                    if (!threadId || !commentId) {
                        console.error('[Comment Extension] threadId and commentId are required');
                        return false;
                    }

                    const comments = this.storage?.comments;
                    if (!comments || comments.length === 0) {
                        console.warn('[Comment Extension] No comments to remove');
                        return false;
                    }

                    const threadIndex = findIndex(comments, { threadId });

                    if (threadIndex === -1) {
                        console.warn('[Comment Extension] Thread not found');
                        return false;
                    }

                    const thread = comments[threadIndex];
                    const commentIndex = findIndex(thread.comments, { uuid: commentId });

                    if (commentIndex === -1) {
                        console.warn('[Comment Extension] Comment not found');
                        return false;
                    }

                    // Remove the comment
                    thread.comments.splice(commentIndex, 1);

                    // If no comments left in thread, remove the thread and unmark text
                    if (thread.comments.length === 0) {
                        comments.splice(threadIndex, 1);
                        // this.removeMarkFromDocument(threadId);
                    }

                    // Sync to document after removing comment
                    commands.syncComments();

                    return true;
                } catch (error) {
                    console.error('[Comment Extension] Error removing comment:', error);
                    return false;
                }
            },
            syncComments: () => ({ editor }) => {
                try {
                    if (!editor || !editor.view) {
                        return false;
                    }

                    const { state, view } = editor;
                    const docNode = state.doc;
                    const currentComments = this.storage.comments;

                    // Only update if comments have changed
                    const docComments = docNode.attrs.comment;
                    const currentJSON = JSON.stringify(currentComments || []);
                    const docJSON = JSON.stringify(docComments || []);

                    if (currentJSON !== docJSON) {
                        // Create a new transaction to update doc attributes
                        const tr = state.tr.setNodeMarkup(0, undefined, {
                            ...docNode.attrs,
                            comment: currentComments || []
                        });

                        // Don't add to history - this is a metadata update
                        tr.setMeta('addToHistory', false);

                        view.dispatch(tr);
                    }

                    return true;
                } catch (error) {
                    console.error('[Comment Extension] Error syncing comments:', error);
                    return false;
                }
            }
        }
    },
    onCreate() {
        // Load comments from document attributes on creation
        try {
            const docNode = this.editor.state.doc;
            const docComments = docNode.attrs.comment;

            if (docComments && Array.isArray(docComments) && docComments.length > 0) {
                this.storage.comments = docComments;
                console.log('[Comment Extension] Loaded comments from document:', docComments.length);
            }
        } catch (error) {
            console.error('[Comment Extension] Error loading comments from document:', error);
        }
    },
    onSelectionUpdate() {
        try {
            if (!this.editor.isActive('comment')) {
                this.storage.comment_id = null;
            } else {
                const attrs = this.editor.getAttributes('comment');
                this.storage.comment_id = attrs.comment_id || null;
            }
        } catch (error) {
            console.error('[Comment Extension] Error in selection update:', error);
        }
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, this.options.HTMLAttributes), 0]
    },
    parseHTML() {
        return [
            {
                tag: 'span[comment_id]',
                getAttrs: (el) => !!(el as HTMLSpanElement).getAttribute('comment_id')?.trim() && null,
            },
        ]
    }
})

export default Comments;