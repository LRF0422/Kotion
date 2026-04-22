import type { Editor } from "@tiptap/core"

/**
 * Scroll the editor viewport to show the specified position.
 * Sets the text selection at that position so the cursor acts as a visual hint.
 */
export const scrollToPosition = (editor: Editor, pos: number) => {
    const maxPos = editor.state.doc.content.size
    const safePos = Math.max(0, Math.min(pos, maxPos))
    editor.chain().setTextSelection(safePos).scrollIntoView().run()
}
