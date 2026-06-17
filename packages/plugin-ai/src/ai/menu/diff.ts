export type DiffSegmentType = "equal" | "insert" | "delete";

export interface DiffSegment {
    type: DiffSegmentType;
    text: string;
}

/**
 * Character-level diff between two strings via LCS. Returns a flat list of
 * segments (equal / insert / delete) suitable for inline rendering.
 *
 * Works for mixed CJK/Latin text (no whitespace tokenization needed). For very
 * long inputs it falls back to a coarse "delete-all + insert-all" to avoid the
 * O(n·m) table blowing up.
 */
export function diffChars(a: string, b: string): DiffSegment[] {
    const n = a.length;
    const m = b.length;

    if (n === 0) return b ? [{ type: "insert", text: b }] : [];
    if (m === 0) return [{ type: "delete", text: a }];
    if (n * m > 1_000_000) {
        return [
            { type: "delete", text: a },
            { type: "insert", text: b },
        ];
    }

    // dp[i][j] = LCS length of a[i:] and b[j:]
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const segments: DiffSegment[] = [];
    const push = (type: DiffSegmentType, ch: string) => {
        const last = segments[segments.length - 1];
        if (last && last.type === type) last.text += ch;
        else segments.push({ type, text: ch });
    };

    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            push("equal", a[i]);
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            push("delete", a[i]);
            i++;
        } else {
            push("insert", b[j]);
            j++;
        }
    }
    while (i < n) push("delete", a[i++]);
    while (j < m) push("insert", b[j++]);

    return segments;
}
