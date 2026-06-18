import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor, useMarginCards } from "@kn/editor";
import { useIsMobile } from "@kn/ui";
import type { CommentItem as CommentItemType } from "../types";
import { MarginCommentCard } from "./MarginCommentCard";
import { CommentSheet } from "./CommentSheet";
import { getCurrentUser } from "../comment";

interface ThreadItem {
    id: string;
    from: number;
    to: number;
    comments: CommentItemType[];
    isNew: boolean; // true if thread has no real comment content yet
}

/**
 * Walk the document to find all comment marks and extract thread data.
 */
function getThreads(editor: Editor): ThreadItem[] {
    const { doc } = editor.state;
    const markType = editor.schema.marks.comment;
    if (!markType) return [];

    const threadsMap = new Map<string, { from: number; to: number; comments: CommentItemType[] }>();

    doc.descendants((node, pos) => {
        if (!node.isText) return;
        const mark = node.marks.find((m) => m.type === markType);
        if (!mark) return;

        const threadId = mark.attrs.thread_id;
        if (!threadId) return;

        const existing = threadsMap.get(threadId);
        if (existing) {
            existing.to = Math.max(existing.to, pos + node.nodeSize);
        } else {
            let comments: CommentItemType[] = [];
            try {
                comments = JSON.parse(mark.attrs.comments || "[]");
            } catch { /* ignore */ }
            threadsMap.set(threadId, { from: pos, to: pos + node.nodeSize, comments });
        }
    });

    const threads: ThreadItem[] = [];
    threadsMap.forEach((data, id) => {
        const isNew = data.comments.length === 0 || (data.comments.length === 1 && !data.comments[0].content);
        threads.push({ id, comments: data.comments, from: data.from, to: data.to, isNew });
    });

    threads.sort((a, b) => a.from - b.from);
    return threads;
}

export const CommentMarginPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const isMobile = useIsMobile();
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const prevActiveRef = useRef<string | null>(null);

    const currentUserId = useMemo(() => getCurrentUser().id, []);

    const { panelLeft, panelWidth, anchors, registerCard } = useMarginCards<ThreadItem>(editor, {
        side: "right",
        cardWidth: 300,
        minVisible: 160,
        collect: getThreads,
        disabled: isMobile,
    });

    // Mirror the extension's active thread (set by onSelectionUpdate / addComment).
    useEffect(() => {
        if (!editor) return;
        const sync = () => setActiveThreadId((editor.storage as any).comment?.activeThreadId || null);
        sync();
        editor.on("transaction", sync);
        return () => { editor.off("transaction", sync); };
    }, [editor]);

    // Clean up orphaned empty threads: when the user leaves a thread that still
    // has no real comment content, remove its (empty) highlight mark.
    useEffect(() => {
        const prev = prevActiveRef.current;
        if (prev && prev !== activeThreadId && editor && !editor.isDestroyed) {
            const outgoing = anchors.find((t) => t.id === prev);
            if (outgoing && outgoing.isNew) {
                editor.commands.resolveThread(prev);
            }
        }
        prevActiveRef.current = activeThreadId;
    }, [activeThreadId, editor, anchors]);

    const setActive = useCallback((threadId: string | null) => {
        setActiveThreadId(threadId);
        if ((editor.storage as any).comment) {
            (editor.storage as any).comment.activeThreadId = threadId;
        }
    }, [editor]);

    const handleReply = useCallback((threadId: string, content: string, parentId?: string) => {
        if (!content.trim()) return;
        editor.commands.replyComment(threadId, content, parentId);
    }, [editor]);

    const handleEdit = useCallback((threadId: string, commentId: string, content: string) => {
        if (!content.trim()) return;
        editor.commands.editComment(threadId, commentId, content);
    }, [editor]);

    const handleDelete = useCallback((threadId: string, commentId: string) => {
        editor.commands.deleteComment(threadId, commentId);
    }, [editor]);

    const handleResolve = useCallback((threadId: string) => {
        editor.commands.resolveThread(threadId);
    }, [editor]);

    const handleSetFirstComment = useCallback((threadId: string, content: string) => {
        if (!content.trim()) return;
        editor.commands.setFirstComment(threadId, content);
    }, [editor]);

    // Mobile: present the active thread in a bottom sheet.
    if (isMobile) {
        const active = activeThreadId ? anchors.find((t) => t.id === activeThreadId) : undefined;
        if (!active) return null;
        return (
            <CommentSheet
                key={active.id}
                open
                onOpenChange={(open) => { if (!open) setActive(null); }}
                comments={active.comments}
                isNew={active.isNew}
                isEditable={editor.isEditable}
                currentUserId={currentUserId}
                onReply={(content, parentId) => handleReply(active.id, content, parentId)}
                onEdit={(commentId, content) => handleEdit(active.id, commentId, content)}
                onDelete={(commentId) => handleDelete(active.id, commentId)}
                onResolve={() => handleResolve(active.id)}
                onSetFirstComment={(content) => handleSetFirstComment(active.id, content)}
            />
        );
    }

    if (panelLeft === null || anchors.length === 0) return null;

    // Portal to <body> so the fixed cards escape any transformed ancestor
    // (e.g. the tab/workspace switcher), keeping them viewport-relative.
    return createPortal(
        <>
            {anchors.map((thread) => (
                <MarginCommentCard
                    key={thread.id}
                    registerRef={registerCard(thread.id)}
                    threadId={thread.id}
                    comments={thread.comments}
                    top={thread.top}
                    left={panelLeft}
                    width={panelWidth}
                    isNew={thread.isNew}
                    isActive={thread.id === activeThreadId}
                    isEditable={editor.isEditable}
                    currentUserId={currentUserId}
                    onClick={() => setActive(thread.id)}
                    onReply={(content, parentId) => handleReply(thread.id, content, parentId)}
                    onEdit={(commentId, content) => handleEdit(thread.id, commentId, content)}
                    onDelete={(commentId) => handleDelete(thread.id, commentId)}
                    onResolve={() => handleResolve(thread.id)}
                    onSetFirstComment={(content) => handleSetFirstComment(thread.id, content)}
                />
            ))}
        </>,
        document.body
    );
};
