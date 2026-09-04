import React, { useEffect, useMemo, useRef } from 'react';
import {
    EditorContent,
    EditorMenu,
    getSchema,
    rewritePluginContent,
    StyledEditor,
    useEditor,
    useEditorExtension,
} from '@kn/editor';
import { cn } from '@kn/ui';
import { deepEqual } from '@kn/common';

export interface RecordEditorProps {
    content?: any;
    onUpdate?: (content: any) => void;
    editable?: boolean;
    className?: string;
}

export const RecordEditor: React.FC<RecordEditorProps> = ({
    content,
    onUpdate,
    editable = true,
    className,
}) => {
    const [extensions, extensionWrappers] = useEditorExtension('dragable');
    const onUpdateRef = useRef(onUpdate);
    const lastEmittedContentRef = useRef<any>(null);
    onUpdateRef.current = onUpdate;

    const schemaContent = useMemo(() => {
        if (!content || typeof content !== 'object') {
            return content;
        }

        return rewritePluginContent(
            content,
            getSchema(extensions),
            { fallbackToParagraph: true },
        ).json;
    }, [content, extensions]);

    const editor = useEditor({
        extensions,
        content: schemaContent,
        editable,
        onUpdate: ({ editor }) => {
            const nextContent = editor.getJSON();
            lastEmittedContentRef.current = nextContent;
            onUpdateRef.current?.(nextContent);
        },
    }, [extensions]);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;

        if (
            lastEmittedContentRef.current &&
            deepEqual(lastEmittedContentRef.current, schemaContent)
        ) {
            lastEmittedContentRef.current = null;
            return;
        }

        if (!schemaContent && editor.isEmpty) return;
        if (schemaContent && deepEqual(editor.getJSON(), schemaContent)) return;

        editor.commands.setContent(schemaContent || '', { emitUpdate: false });
        lastEmittedContentRef.current = null;
    }, [editor, schemaContent]);

    useEffect(() => {
        if (editor && editor.isEditable !== editable) {
            editor.setEditable(editable);
        }
    }, [editor, editable]);

    if (!editor) {
        return null;
    }

    return (
        <div
            className={cn(
                'record-editor relative w-full min-w-0 max-w-full overflow-x-hidden',
                className,
            )}
        >
            {editable && (
                <EditorMenu
                    editor={editor}
                    extensionWrappers={extensionWrappers}
                />
            )}

            <StyledEditor
                $fullWidth
                className="min-w-0 max-w-full prose-sm !px-4"
            >
                <EditorContent
                    editor={editor}
                    className={cn(
                        'min-h-[200px] w-full min-w-0 max-w-full',
                        'focus-within:outline-none',
                        '[&_.tiptap]:min-h-[200px]',
                        '[&_.tiptap]:focus:outline-none',
                        '[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground',
                        '[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
                        '[&_.tiptap_p.is-editor-empty:first-child::before]:float-left',
                        '[&_.tiptap_p.is-editor-empty:first-child::before]:h-0',
                        '[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none',
                    )}
                />
            </StyledEditor>
        </div>
    );
};

export default RecordEditor;
