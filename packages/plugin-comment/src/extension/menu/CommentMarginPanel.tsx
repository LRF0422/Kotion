import React, { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "@kn/editor";
import type { CommentItem as CommentItemType } from "../types";
import { MarginCommentCard } from "./MarginCommentCard";

interface ThreadPosition {
    threadId: string;
    comments: CommentItemType[];
    from: number;
    to: number;
    top: number; // viewport-relative Y
    isNew: boolean; // true if thread has no real comment content yet
}

/**
 * Walk the document to find all comment marks and extract thread data.
 */
function getThreads(editor: Editor): Omit<ThreadPosition, 'top'>[] {
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

    const threads: Omit<ThreadPosition, 'top'>[] = [];
    threadsMap.forEach((data, threadId) => {
        const isNew = data.comments.length === 0 || (data.comments.length === 1 && !data.comments[0].content);
        threads.push({ threadId, comments: data.comments, from: data.from, to: data.to, isNew });
    });

    threads.sort((a, b) => a.from - b.from);
    return threads;
}

/**
 * Calculate viewport-relative positions for each thread and resolve overlaps.
 */
function calcPositions(editor: Editor, threads: Omit<ThreadPosition, 'top'>[]): ThreadPosition[] {
    const positioned: ThreadPosition[] = [];

    for (const thread of threads) {
        try {
            const coords = editor.view.coordsAtPos(thread.from);
            positioned.push({ ...thread, top: coords.top });
        } catch {
            // Skip threads whose positions can't be calculated
        }
    }

    // Resolve vertical overlaps (push down if cards collide)
    const CARD_HEIGHT = 40;
    const GAP = 6;
    for (let i = 1; i < positioned.length; i++) {
        const minTop = positioned[i - 1].top + CARD_HEIGHT + GAP;
        if (positioned[i].top < minTop) {
            positioned[i].top = minTop;
        }
    }

    return positioned;
}

export const CommentMarginPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [threads, setThreads] = useState<ThreadPosition[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [panelLeft, setPanelLeft] = useState<number | null>(null);
    const rawThreadsRef = useRef<Omit<ThreadPosition, 'top'>[]>([]);

    // Update thread data on document changes
    const updateThreadData = useCallback(() => {
        if (!editor || editor.isDestroyed) return;
        rawThreadsRef.current = getThreads(editor);
        setActiveThreadId((editor.storage as any).comment?.activeThreadId || null);
    }, [editor]);

    // Update viewport positions (called on scroll + transaction)
    const updatePositions = useCallback(() => {
        if (!editor || editor.isDestroyed) return;

        // Calculate the left edge of the margin panel
        const proseMirrorEl = editor.view.dom;
        if (proseMirrorEl) {
            const rect = proseMirrorEl.getBoundingClientRect();
            setPanelLeft(rect.right + 16);
        }

        const positioned = calcPositions(editor, rawThreadsRef.current);
        setThreads(positioned);
    }, [editor]);

    useEffect(() => {
        if (!editor) return;

        const handleUpdate = () => {
            updateThreadData();
            requestAnimationFrame(updatePositions);
        };

        handleUpdate();
        editor.on("transaction", handleUpdate);

        const editorContainer = document.getElementById("editor-container");
        const handleScroll = () => requestAnimationFrame(updatePositions);
        editorContainer?.addEventListener("scroll", handleScroll, { passive: true });

        // Also listen to window resize for left recalculation
        window.addEventListener("resize", handleScroll, { passive: true });

        return () => {
            editor.off("transaction", handleUpdate);
            editorContainer?.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
        };
    }, [editor, updateThreadData, updatePositions]);

    const handleCardClick = useCallback((threadId: string, from: number) => {
        // Card is already visible (user clicked on highlight), no need to scroll
        setActiveThreadId(threadId);
        (editor.storage as any).comment.activeThreadId = threadId;
    }, [editor]);

    const handleReply = useCallback((threadId: string, content: string, parentId?: string) => {
        if (!content.trim()) return;
        editor.commands.replyComment(threadId, content, parentId);
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

    if (panelLeft === null || !activeThreadId) return null;

    // Only show the thread that's currently active (user clicked on its highlight)
    const visibleThread = threads.find((t) => t.threadId === activeThreadId);

    if (!visibleThread) return null;

    return (
        <MarginCommentCard
            key={visibleThread.threadId}
            threadId={visibleThread.threadId}
            comments={visibleThread.comments}
            top={visibleThread.top}
            left={panelLeft}
            isNew={visibleThread.isNew}
            isActive={true}
            isEditable={editor.isEditable}
            onClick={() => handleCardClick(visibleThread.threadId, visibleThread.from)}
            onReply={(content, parentId) => handleReply(visibleThread.threadId, content, parentId)}
            onDelete={(commentId) => handleDelete(visibleThread.threadId, commentId)}
            onResolve={() => handleResolve(visibleThread.threadId)}
            onSetFirstComment={(content) => handleSetFirstComment(visibleThread.threadId, content)}
        />
    );
};
