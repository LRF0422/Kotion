import { Editor, JSONContent } from '@tiptap/core';

const BATCH_SIZE = 20; // Top-level nodes per batch

/**
 * Load large content into the editor in batches to keep the UI responsive.
 *
 * ProseMirror's `setContent()` creates all DOM nodes synchronously in one call,
 * which blocks the main thread for large documents. This utility breaks the
 * content into smaller batches, inserting each one individually and yielding
 * to the browser between batches so user interactions can be processed.
 *
 * Small documents (<= BATCH_SIZE top-level nodes) are loaded all at once
 * for better performance since the overhead of batching isn't worth it.
 */
export async function loadContentInBatches(
    editor: Editor,
    content: JSONContent,
): Promise<void> {
    const topLevelNodes = content.content || [];
    const total = topLevelNodes.length;

    if (total === 0) return;

    // For small documents, load all at once
    if (total <= BATCH_SIZE) {
        editor.commands.setContent(content, { emitUpdate: false });
        return;
    }

    // Phase 1: Set initial content with first batch (no update event)
    editor.commands.setContent(
        { type: 'doc', content: topLevelNodes.slice(0, BATCH_SIZE) },
        { emitUpdate: false }
    );

    // Phase 2: Insert remaining content in batches with UI yields
    for (let i = BATCH_SIZE; i < total; i += BATCH_SIZE) {
        // Bail out if the editor was destroyed during loading
        if (editor.isDestroyed) return;

        const batch = topLevelNodes.slice(i, Math.min(i + BATCH_SIZE, total));
        const endPos = editor.state.doc.content.size;

        // Insert batch at the end of the document (pass array of nodes directly)
        editor.commands.insertContentAt(endPos, batch);

        // Yield to browser — allows paint, input events, and other microtasks
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}
