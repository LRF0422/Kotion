import { Mark, mergeAttributes } from "@tiptap/core";
import { v4 as uuidv4 } from "uuid";
import { findIndex } from 'lodash'
import { Doc } from "yjs";

export interface CommentInterface {
    user: any,
    uuid: string | null,
    comment: string,
    date: number | null,
    parent_id: string | null
    parent_title: string | null
}

export interface Comment {
    comment: string,
    parent_id: string | null
}

export interface CustomCommentInterface {
    threadId: string | null,
    comments: CommentInterface[] | null
}

interface CommentsStorageInterface {
    comments: CustomCommentInterface[],
    comment_id: string | null
}

export interface CommentOptionsInterface {
    user: {},
    document?: Doc,
    HTMLAttributes: any,
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        comment: {
            addComments: (comment: Comment) => ReturnType,
            removeSpecificComment: (threadId: string, commentId: string) => ReturnType
        }
    }
}


const Comments = Mark.create<CommentOptionsInterface, CommentsStorageInterface>({
    name: 'comment',
    addOptions() {
        return {
            user: {},
            provider: undefined,
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
                let commentsList: CustomCommentInterface;
                const finalComment: CommentInterface = {
                    uuid: uuidv4(),
                    user: this.options.user,
                    comment: comment.comment,
                    date: Date.now(),
                    parent_title: null,
                    parent_id: null
                }
                if (comment.parent_id) {
                    const index = findIndex(this.storage.comments, { threadId: this.storage.comment_id });
                    const commentIndex = findIndex(this.storage.comments[index].comments ?? [], { uuid: comment.parent_id });
                    const parent = this.storage.comments[index];
                    if (parent && parent.comments) {
                        finalComment.parent_id = parent.comments[commentIndex].uuid;
                        finalComment.parent_title = parent.comments[commentIndex].comment.substring(0, 50);
                    }
                    this.storage.comments[index].comments?.push(finalComment)
                } else {
                    commentsList = {
                        threadId: uuidv4(),
                        comments: []
                    };
                    commentsList.comments?.push(finalComment);
                    commands.setMark('comment', { 'comment_id': commentsList.threadId })
                    this.storage.comments.push(commentsList);
                }
                return true
            },
            removeSpecificComment: (threadId: string, commentId: string) => () => {
                let comments = this.storage?.comments;
                const index = findIndex(comments, { threadId: threadId })
                if (comments[index].comments) {

                    const commentIndex = findIndex(comments[index].comments ?? [], { uuid: commentId })
                    comments[index].comments?.splice(commentIndex, 1)

                    if (!comments[index].comments?.length) {
                        comments.splice(index, 1);
                    }

                    this.storage.comments = comments;
                    this.editor.state.doc.descendants((node: any, pos: any) => {
                        const { marks } = node
                        marks.forEach((mark: any) => {
                            if (mark.type.name === 'comment') {
                                const comment_id = mark.attrs.comment_id;
                                if (!this.storage.comments.filter(obj => obj.threadId === comment_id).length) {

                                    this.editor.commands.setTextSelection({
                                        from: pos,
                                        to: pos + (node.text?.length || 0),
                                    })
                                    this.editor.commands.unsetMark('comment');
                                }
                            }
                        }
                        )

                    });
                }
                return true;
            }
        }
    },
    onSelectionUpdate(this) {
        if (!this.editor.isActive('comment')) {
            this.storage.comment_id = null;
        } else {
            this.storage.comment_id = this.editor.getAttributes('comment').comment_id;
        }
    },
    onUpdate() {

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