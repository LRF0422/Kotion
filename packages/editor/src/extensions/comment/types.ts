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
    parentId: string | null;
}

export interface CommentOptions {
    user: CommentUser;
    HTMLAttributes: Record<string, any>;
}

export interface CommentStorage {
    activeThreadId: string | null;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        comment: {
            addComment: (content: string) => ReturnType;
            setFirstComment: (threadId: string, content: string) => ReturnType;
            replyComment: (threadId: string, content: string, parentId?: string) => ReturnType;
            deleteComment: (threadId: string, commentId: string) => ReturnType;
            resolveThread: (threadId: string) => ReturnType;
        }
    }
}
