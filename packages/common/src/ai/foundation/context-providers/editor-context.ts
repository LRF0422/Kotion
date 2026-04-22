/**
 * Editor Context Provider
 *
 * Manages the editor context for AI operations.
 * Provides a centralized way to access and update editor state.
 */

import type { Editor } from '@tiptap/core'
import type { AIContext, EditorContextData, AIContextType } from '../types'

type ContextChangeListener = (context: AIContext<EditorContextData> | null) => void

class EditorContextManager {
    private context: AIContext<EditorContextData> | null = null
    private listeners: Set<ContextChangeListener> = new Set()
    private editor: Editor | null = null

    /**
     * Set the editor context
     */
    setEditor(editor: Editor, documentId?: string): void {
        this.editor = editor

        this.context = {
            type: 'editor',
            id: documentId || 'default-editor',
            data: {
                editor,
                documentId,
                selection: this.getSelection(editor)
            }
        }

        this.notifyListeners()
    }

    /**
     * Get the editor instance
     */
    getEditor(): Editor | undefined {
        return this.editor || undefined
    }

    /**
     * Get the current context
     */
    getContext(): AIContext<EditorContextData> | null {
        // Update selection if context exists
        if (this.context && this.editor) {
            this.context.data.selection = this.getSelection(this.editor)
        }
        return this.context
    }

    /**
     * Update context metadata
     */
    updateMetadata(metadata: Record<string, any>): void {
        if (this.context) {
            this.context.metadata = {
                ...this.context.metadata,
                ...metadata
            }
            this.notifyListeners()
        }
    }

    /**
     * Clear the context
     */
    clear(): void {
        this.context = null
        this.editor = null
        this.notifyListeners()
    }

    /**
     * Subscribe to context changes
     */
    subscribe(listener: ContextChangeListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    /**
     * Get current selection from editor
     */
    private getSelection(editor: Editor): { from: number; to: number } | undefined {
        try {
            const { from, to } = editor.state.selection
            return { from, to }
        } catch {
            return undefined
        }
    }

    /**
     * Notify all listeners of context change
     */
    private notifyListeners(): void {
        const context = this.getContext()
        this.listeners.forEach(listener => listener(context))
    }
}

// Singleton instance
let editorContextInstance: EditorContextManager | null = null

export function getEditorContextManager(): EditorContextManager {
    if (!editorContextInstance) {
        editorContextInstance = new EditorContextManager()
    }
    return editorContextInstance
}

export function createEditorContextManager(): EditorContextManager {
    return new EditorContextManager()
}

export { EditorContextManager }
