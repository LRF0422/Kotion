import type { CommentItem } from "../types";

/** Tailwind classes for avatar background/text, picked deterministically from a name. */
export const avatarColors = [
    "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400",
    "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
    "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
    "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
    "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
    "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400",
];

export function getAvatarColor(name?: string): string {
    const code = name && name.length > 0 ? name.charCodeAt(0) : 0;
    return avatarColors[code % avatarColors.length];
}

/** First letter of a name, uppercased, with a safe fallback. */
export function getInitial(name?: string): string {
    return (name?.trim().charAt(0) || "?").toUpperCase();
}

/** Compact relative time ("now", "5m", "3h", "2d") falling back to a short date. */
export function formatTime(ts: number): string {
    const diffMs = Date.now() - ts;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 30) return `${diffDays}d`;

    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Full, locale-aware timestamp for hover tooltips. */
export function formatFullTime(ts: number): string {
    return new Date(ts).toLocaleString();
}

export interface CommentNode {
    comment: CommentItem;
    /** All descendants of the root, flattened into a single ordered list. */
    replies: CommentItem[];
}

/**
 * Group a flat comment list into root comments, each carrying ALL of its
 * descendant replies flattened into one chronological list.
 *
 * Replies-to-replies (and deeper) are intentionally collapsed to a single
 * visual level so nothing is hidden in a narrow card; the "who replied to whom"
 * relationship is surfaced inline via the parent name instead of indentation.
 * Comments whose parent is missing are treated as roots so nothing is lost.
 */
export function buildCommentTree(comments: CommentItem[]): CommentNode[] {
    const byId = new Map(comments.map((c) => [c.id, c]));

    const isRoot = (c: CommentItem) => !c.parentId || !byId.has(c.parentId);

    // Walk parent links up to the top-most ancestor (guard against cycles).
    const rootIdOf = (c: CommentItem): string => {
        let cur = c;
        const seen = new Set<string>();
        while (!isRoot(cur) && !seen.has(cur.id)) {
            seen.add(cur.id);
            cur = byId.get(cur.parentId as string)!;
        }
        return cur.id;
    };

    const repliesByRoot = new Map<string, CommentItem[]>();
    const roots: CommentItem[] = [];

    for (const c of comments) {
        if (isRoot(c)) {
            roots.push(c);
        } else {
            const rid = rootIdOf(c);
            const list = repliesByRoot.get(rid) || [];
            list.push(c);
            repliesByRoot.set(rid, list);
        }
    }

    return roots
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((comment) => ({
            comment,
            replies: (repliesByRoot.get(comment.id) || []).sort((a, b) => a.createdAt - b.createdAt),
        }));
}
