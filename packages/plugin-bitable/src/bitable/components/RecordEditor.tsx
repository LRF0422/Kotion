import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { EditorContent, getSchema, rewritePluginContent, useEditor, useEditorExtension } from '@kn/editor';
import { BubbleMenu, TextSelection } from '@kn/editor';
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    Code,
    Link as LinkIcon,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    CodeSquare,
} from '@kn/icon';
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

    const [extensions] = useEditorExtension();
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

    const shouldShow = useCallback(() => {
        return editor.state.selection instanceof TextSelection &&
            !editor.state.selection.empty &&
            !editor.isActive('codeBlock');
    }, [editor]);

    if (!editor) {
        return null;
    }

    return (
        <div className={cn('record-editor relative', className)}>
            {editor && editable && (
                <BubbleMenu
                    shouldShow={shouldShow}
                    editor={editor}
                    className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-1 shadow-lg"
                >
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        active={editor.isActive('bold')}
                        title="Bold"
                    >
                        <Bold className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        active={editor.isActive('italic')}
                        title="Italic"
                    >
                        <Italic className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        active={editor.isActive('underline')}
                        title="Underline"
                    >
                        <UnderlineIcon className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        active={editor.isActive('strike')}
                        title="Strikethrough"
                    >
                        <Strikethrough className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        active={editor.isActive('code')}
                        title="Code"
                    >
                        <Code className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => {
                            const url = window.prompt('Enter URL');
                            if (url) {
                                editor.chain().focus().setLink({ href: url }).run();
                            }
                        }}
                        active={editor.isActive('link')}
                        title="Link"
                    >
                        <LinkIcon className="h-4 w-4" />
                    </ToolbarButton>

                    <div className="mx-1 h-5 w-px bg-border" />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        active={editor.isActive('heading', { level: 1 })}
                        title="Heading 1"
                    >
                        <Heading1 className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        active={editor.isActive('heading', { level: 2 })}
                        title="Heading 2"
                    >
                        <Heading2 className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                        active={editor.isActive('heading', { level: 3 })}
                        title="Heading 3"
                    >
                        <Heading3 className="h-4 w-4" />
                    </ToolbarButton>

                    <div className="mx-1 h-5 w-px bg-border" />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        active={editor.isActive('bulletList')}
                        title="Bullet List"
                    >
                        <List className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        active={editor.isActive('orderedList')}
                        title="Ordered List"
                    >
                        <ListOrdered className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        active={editor.isActive('blockquote')}
                        title="Quote"
                    >
                        <Quote className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                        active={editor.isActive('codeBlock')}
                        title="Code Block"
                    >
                        <CodeSquare className="h-4 w-4" />
                    </ToolbarButton>
                </BubbleMenu>
            )}

            <EditorContent
                editor={editor}
                className={cn(
                    'prose prose-sm dark:prose-invert max-w-none',
                    'min-h-[200px] w-full',
                    'focus-within:outline-none',
                    '[&_.tiptap]:min-h-[200px] [&_.tiptap]:px-4 [&_.tiptap]:py-3',
                    '[&_.tiptap]:focus:outline-none',
                    '[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground',
                    '[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
                    '[&_.tiptap_p.is-editor-empty:first-child::before]:float-left',
                    '[&_.tiptap_p.is-editor-empty:first-child::before]:h-0',
                    '[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none',
                )}
            />
        </div>
    );
};

interface ToolbarButtonProps {
    onClick: () => void;
    active?: boolean;
    title?: string;
    children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, active, title, children }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            active && 'bg-accent text-accent-foreground'
        )}
    >
        {children}
    </button>
);

export default RecordEditor;
