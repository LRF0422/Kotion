import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";

export interface ProgressiveLoadOptions {
    /** Number of top-level blocks inserted per chunk. Default 40. */
    chunkSize?: number;
    /** Progress callback, receives an integer in [0, 100]. */
    onProgress?: (progress: number) => void;
    /** Return true to abort mid-load (e.g. on unmount). */
    isCancelled?: () => boolean;
}

/**
 * Yield to the browser so it can paint / respond to user input between chunks.
 * Prefers requestIdleCallback when available, falls back to setTimeout.
 */
function yieldToMain(): Promise<void> {
    return new Promise((resolve) => {
        const ric = (globalThis as any).requestIdleCallback as
            | ((cb: () => void, opts?: { timeout: number }) => number)
            | undefined;
        if (typeof ric === "function") {
            ric(() => resolve(), { timeout: 50 });
        } else {
            setTimeout(resolve, 0);
        }
    });
}

/**
 * Roughly estimate how "heavy" a JSONContent document is by walking the tree
 * and summing text lengths. Bounded by `cap` so huge docs short-circuit early.
 */
export function estimateTextLength(content: JSONContent, cap = 200_000): number {
    let total = 0;
    const stack: JSONContent[] = [content];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;
        if (typeof node.text === "string") total += node.text.length;
        if (total >= cap) return total;
        if (Array.isArray(node.content)) {
            for (const child of node.content) stack.push(child);
        }
    }
    return total;
}

/**
 * Heuristic: a document is considered "large" if it has many top-level blocks
 * or a lot of plain text. Large documents are loaded progressively so the main
 * thread stays responsive and we can show a progress indicator.
 */
export function isLargeDocument(content: JSONContent): boolean {
    if (!content || !Array.isArray(content.content)) return false;
    if (content.content.length >= 200) return true;
    // ~100K characters is already enough to freeze the main thread noticeably.
    if (estimateTextLength(content, 100_000) >= 100_000) return true;
    return false;
}

/**
 * Progressive content loading for large Tiptap documents.
 *
 * Splits the top-level blocks into small chunks and inserts them with a
 * `yieldToMain()` between chunks so the browser can paint and respond to user
 * input. Insertions are dispatched as single transactions with
 * `addToHistory: false` so the undo stack is not polluted with many tiny
 * entries during initial load.
 */
export async function loadContentProgressive(
    editor: Editor,
    content: JSONContent,
    options: ProgressiveLoadOptions = {},
): Promise<void> {
    const { chunkSize = 40, onProgress, isCancelled } = options;

    const blocks = Array.isArray(content.content) ? content.content : [];
    const total = blocks.length;

    // Load the first chunk through `setContent` so the editor's schema is
    // honoured (e.g. the custom Doc requires `title block*`, so its title node
    // must be the first child). Going through an empty doc first would make
    // the schema auto-inject a placeholder title, which later gets duplicated
    // by the content's own title node being appended as an extra block.
    const firstChunkSize = Math.max(1, chunkSize);
    const firstChunk = blocks.slice(0, firstChunkSize);
    const firstDoc: JSONContent = { ...content, content: firstChunk };
    editor.commands.setContent(firstDoc, { emitUpdate: false });

    if (total === 0) {
        onProgress?.(100);
        return;
    }

    // Report progress for the initial chunk and yield to the browser.
    onProgress?.(Math.min(100, Math.round((firstChunk.length / total) * 100)));
    if (firstChunk.length >= total) return;
    await yieldToMain();

    for (let i = firstChunk.length; i < total; i += chunkSize) {
        if (isCancelled?.()) return;

        const chunk = blocks.slice(i, i + chunkSize);
        const { state, view } = editor;
        const endPos = state.doc.content.size;

        try {
            const nodes = chunk
                .map((node) => {
                    try {
                        return state.schema.nodeFromJSON(node);
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean) as any[];

            if (nodes.length > 0) {
                const tr = state.tr.insert(endPos, nodes);
                tr.setMeta("addToHistory", false);
                tr.setMeta("preventUpdate", true);
                view.dispatch(tr);
            }
        } catch {
            // Fallback: rely on tiptap's higher-level command if direct tx fails.
            editor.commands.insertContentAt(endPos, chunk as any, {
                updateSelection: false,
            });
        }

        const done = Math.min(total, i + chunk.length);
        const progress = Math.min(100, Math.round((done / total) * 100));
        onProgress?.(progress);

        // Let the browser breathe before the next chunk.
        await yieldToMain();
    }
}
