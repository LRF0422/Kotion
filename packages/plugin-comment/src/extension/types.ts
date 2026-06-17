export interface CommentUser {
    id: string;
    name: string;
    avatar?: string;
}

export interface CommentItem {
    id: string;
    user: CommentUser;
    content: string;
    createdAt: number;
    /** Set when the comment has been edited after creation. */
    updatedAt?: number;
    parentId: string | null;
}

export interface CommentOptions {
    HTMLAttributes: Record<string, any>;
}

export interface CommentStorage {
    activeThreadId: string | null;
}

declare module '@kn/editor' {
    interface Commands<ReturnType> {
        comment: {
            addComment: (content: string) => ReturnType;
            setFirstComment: (threadId: string, content: string) => ReturnType;
            replyComment: (threadId: string, content: string, parentId?: string) => ReturnType;
            editComment: (threadId: string, commentId: string, content: string) => ReturnType;
            deleteComment: (threadId: string, commentId: string) => ReturnType;
            resolveThread: (threadId: string) => ReturnType;
        }
    }
}
