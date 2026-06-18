import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, Editor as InnerEditor, useEditorExtension } from "@kn/editor";
import type { AnyExtension } from "@kn/editor";
import { Button, useTheme } from "@kn/ui";
import { Trash2, Palette, Bold, Italic, List, ListOrdered, Code } from "@kn/icon";
import { findStickyNoteColor, STICKY_NOTE_COLORS } from "../constants";

/**
 * Extensions from the parent editor that should NOT be active inside
 * the tiny in-card mini editor. Mostly UI affordances that don't make
 * sense in a small annotation surface.
 */
const INNER_EDITOR_EXCLUDED = new Set<string>([
    "dragable", // floating drag handle / "+" add-block button
    "placeholder"
]);

export interface StickyNoteCardProps {
    noteId: string;
    color: string;
    content: string;
    top: number;
    left: number;
    width: number;
    isEditable: boolean;
    /** Ref callback so the margin panel can measure this card's height. */
    registerRef?: (el: HTMLElement | null) => void;
    onContentChange: (content: string) => void;
    onColorChange: (color: string) => void;
    onDelete: () => void;
    /**
     * "margin" (default): fixed-positioned card in the editor's left margin (desktop).
     * "sheet": plain block that fills its container (mobile bottom sheet) — no
     * fixed positioning, toolbar always visible.
     */
    variant?: "margin" | "sheet";
}

/**
 * Always-visible margin sticky note. Hosts a tiny rich-text editor
 * (StarterKit) so the user can format content (bold/italic/lists/code).
 */
export const StickyNoteCard: React.FC<StickyNoteCardProps> = ({
    noteId,
    color,
    content,
    top,
    left,
    width,
    isEditable,
    registerRef,
    onContentChange,
    onColorChange,
    onDelete,
    variant = "margin",
}) => {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const palette = findStickyNoteColor(color);
    const tone = isDark ? palette.dark : palette.light;

    const [showColors, setShowColors] = useState(false);

    // The latest content prop, kept in a ref to avoid re-creating the editor.
    const contentRef = useRef(content);
    contentRef.current = content;

    // Debounced save handle
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Reuse the parent editor's full extension set so the inner mini-editor
    // supports the same formatting (marks, lists, code, etc.). We exclude
    // "stickyNote" to avoid infinite recursion, plus a few extensions that
    // don't belong inside a tiny inline card (drag handle, etc.).
    const [parentExtensions] = useEditorExtension("stickyNote");
    const innerExtensions = useMemo(
        () =>
            (parentExtensions as AnyExtension[]).filter(
                (e) => !INNER_EDITOR_EXCLUDED.has(e.name)
            ),
        [parentExtensions]
    );

    const innerEditor = useEditor(
        {
            editable: isEditable,
            extensions: innerExtensions,
            content: content || "",
            onUpdate: ({ editor }) => {
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                saveTimerRef.current = setTimeout(() => {
                    const html = editor.getHTML();
                    if (html !== contentRef.current) onContentChange(html);
                }, 250);
            },
            editorProps: {
                attributes: {
                    class: "outline-none",
                },
            },
        },
        [innerExtensions]
    );

    // Sync external content changes (e.g. another collaborator edited the mark)
    useEffect(() => {
        if (!innerEditor) return;
        if (innerEditor.isDestroyed) return;
        if (innerEditor.isFocused) return;
        const current = innerEditor.getHTML();
        if (current !== content) {
            innerEditor.commands.setContent(content || "");
        }
    }, [content, innerEditor]);

    useEffect(() => {
        if (!innerEditor) return;
        innerEditor.setEditable(isEditable);
    }, [innerEditor, isEditable]);

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    const isEmpty = innerEditor ? innerEditor.isEmpty : !content;

    const triggerCmd = useCallback(
        (fn: (e: InnerEditor) => void) => {
            if (!innerEditor) return;
            fn(innerEditor);
        },
        [innerEditor]
    );

    return (
        <div
            ref={variant === "sheet" ? undefined : registerRef}
            className={
                variant === "sheet"
                    ? "group/card w-full"
                    : "fixed z-40 sticky-note-card-enter group/card"
            }
            style={
                variant === "sheet"
                    ? undefined
                    : {
                          top: `${top}px`,
                          left: `${left}px`,
                          width: `${width}px`,
                          maxWidth: "calc(100vw - 24px)",
                      }
            }
            data-note-id={noteId}
        >
            <div
                className={`sticky-note-card-shell${variant === "sheet" ? " sticky-note-card-shell--sheet" : ""}`}
                style={{
                    background: `linear-gradient(180deg, ${tone.bg} 0%, ${tone.bg} 100%)`,
                    boxShadow: `inset 3px 0 0 0 ${tone.border}`,
                    borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                }}
            >
                {/* Body */}
                <div className="px-3 py-2.5 sticky-note-card-editor relative">
                    {isEmpty && isEditable && (
                        <div className="pointer-events-none absolute top-2.5 left-3 text-[12px] text-foreground/40 select-none">
                            Write a note…
                        </div>
                    )}
                    <EditorContent editor={innerEditor} />
                </div>

                {/* Footer toolbar — fades in on hover/focus */}
                {isEditable && (
                    <div
                        className={`sticky-note-card-toolbar flex items-center gap-0.5 px-2 py-1.5 ${showColors || variant === "sheet" ? "is-open" : ""
                            }`}
                        style={{ borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}` }}
                    >
                        <ToolbarButton
                            tooltip="Bold"
                            active={!!innerEditor?.isActive("bold")}
                            onClick={() => triggerCmd((e) => e.chain().focus().toggleBold().run())}
                        >
                            <Bold className="h-3 w-3" />
                        </ToolbarButton>
                        <ToolbarButton
                            tooltip="Italic"
                            active={!!innerEditor?.isActive("italic")}
                            onClick={() => triggerCmd((e) => e.chain().focus().toggleItalic().run())}
                        >
                            <Italic className="h-3 w-3" />
                        </ToolbarButton>
                        <ToolbarButton
                            tooltip="Code"
                            active={!!innerEditor?.isActive("code")}
                            onClick={() => triggerCmd((e) => e.chain().focus().toggleCode().run())}
                        >
                            <Code className="h-3 w-3" />
                        </ToolbarButton>
                        <span className="sticky-note-toolbar-divider" />
                        <ToolbarButton
                            tooltip="Bullet list"
                            active={!!innerEditor?.isActive("bulletList")}
                            onClick={() => triggerCmd((e) => e.chain().focus().toggleBulletList().run())}
                        >
                            <List className="h-3 w-3" />
                        </ToolbarButton>
                        <ToolbarButton
                            tooltip="Ordered list"
                            active={!!innerEditor?.isActive("orderedList")}
                            onClick={() => triggerCmd((e) => e.chain().focus().toggleOrderedList().run())}
                        >
                            <ListOrdered className="h-3 w-3" />
                        </ToolbarButton>

                        <div className="flex-1" />

                        <div className="relative">
                            <ToolbarButton
                                tooltip="Color"
                                active={showColors}
                                onClick={() => setShowColors((v) => !v)}
                            >
                                <Palette className="h-3 w-3" />
                            </ToolbarButton>
                            {showColors && (
                                <div
                                    className="sticky-note-color-pop absolute right-0 bottom-8 z-50 flex items-center gap-1.5 p-2 rounded-lg border bg-popover text-popover-foreground shadow-lg"
                                    onMouseLeave={() => setShowColors(false)}
                                >
                                    {STICKY_NOTE_COLORS.map((c) => {
                                        const swatch = isDark ? c.dark : c.light;
                                        const selected = c.name === color;
                                        return (
                                            <button
                                                key={c.name}
                                                type="button"
                                                aria-label={c.label}
                                                title={c.label}
                                                className={`h-5 w-5 rounded-full transition-transform duration-150 hover:scale-110 ${selected ? "ring-2 ring-offset-1 ring-offset-popover" : ""
                                                    }`}
                                                style={{
                                                    backgroundColor: swatch.bg,
                                                    border: `1px solid ${swatch.border}`,
                                                    ...(selected ? { boxShadow: `0 0 0 1px ${swatch.border}` } : {}),
                                                }}
                                                onClick={() => {
                                                    onColorChange(c.name);
                                                    setShowColors(false);
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-foreground/60 hover:text-destructive hover:bg-destructive/10"
                            onClick={onDelete}
                            aria-label="Delete sticky note"
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

interface ToolbarButtonProps {
    tooltip: string;
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}
const ToolbarButton: React.FC<ToolbarButtonProps> = ({ tooltip, active, onClick, children }) => (
    <button
        type="button"
        title={tooltip}
        aria-label={tooltip}
        onClick={onClick}
        className={`h-5 w-5 inline-flex items-center justify-center rounded-[4px] text-foreground/60 hover:text-foreground hover:bg-black/[0.08] dark:hover:bg-white/10 transition-colors ${active ? "bg-black/10 dark:bg-white/15 text-foreground" : ""
            }`}
    >
        {children}
    </button>
);
