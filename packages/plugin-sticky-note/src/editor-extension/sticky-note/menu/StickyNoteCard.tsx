import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, Editor as InnerEditor, useEditorExtension } from "@kn/editor";
import type { AnyExtension } from "@kn/editor";
import { Button, useTheme } from "@kn/ui";
import { Trash2, Palette, Bold, Italic, List, ListOrdered, Code } from "@kn/icon";
import { useTranslation } from "@kn/common";
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

const VIEWPORT_MARGIN = 16;

/**
 * Clamp a card's fixed top so it never spills past the viewport, and compute
 * the max height available for its (scrollable) body. Mirrors the comment
 * plugin's placeVertically so cards near the bottom of the viewport don't
 * extend off-screen.
 */
function placeVertically(top: number, hardCap = 560): { top: number; maxHeight: number } {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const maxAllowed = Math.min(hardCap, vh - VIEWPORT_MARGIN * 2);
    let t = Math.max(VIEWPORT_MARGIN, top);
    let available = vh - t - VIEWPORT_MARGIN;
    if (available < Math.min(240, maxAllowed)) {
        t = Math.max(VIEWPORT_MARGIN, vh - VIEWPORT_MARGIN - maxAllowed);
        available = vh - t - VIEWPORT_MARGIN;
    }
    return { top: t, maxHeight: Math.min(available, maxAllowed) };
}

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
    /** Whether this card's highlight is the active (clicked) one. */
    isActive?: boolean;
    /** Whether this card's highlight is being hovered. */
    isHovered?: boolean;
    /** Called when the card starts/stops being hovered (noteId or null). */
    onHoverChange?: (noteId: string | null) => void;
    /** Called when a collapsed card is clicked to expand it. */
    onActivate?: (noteId: string) => void;
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
    isActive = false,
    isHovered = false,
    onHoverChange,
    onActivate,
    variant = "margin",
}) => {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const { t } = useTranslation();
    const palette = findStickyNoteColor(color);
    const tone = isDark ? palette.dark : palette.light;

    const [showColors, setShowColors] = useState(false);

    // Two-step delete: first click arms, second click within 2s confirms.
    const [confirmDelete, setConfirmDelete] = useState(false);
    const confirmDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Color picker container ref — used for click-outside detection.
    const colorPopRef = useRef<HTMLDivElement>(null);

    // Close the color picker on outside click or Escape.
    useEffect(() => {
        if (!showColors) return;
        const onMouseDown = (e: MouseEvent) => {
            if (colorPopRef.current && !colorPopRef.current.contains(e.target as Node)) {
                setShowColors(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setShowColors(false);
        };
        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [showColors]);

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
            if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
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

    const handleDelete = useCallback(() => {
        if (isEmpty) {
            onDelete();
            return;
        }
        if (confirmDelete) {
            if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
            setConfirmDelete(false);
            onDelete();
        } else {
            setConfirmDelete(true);
            confirmDeleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 2000);
        }
    }, [confirmDelete, isEmpty, onDelete]);

    // Viewport clamping for the margin variant so cards near the bottom
    // don't extend off-screen.
    const placed = variant === "margin" ? placeVertically(top) : null;

    // Collapsed state: margin cards show a compact excerpt when not active or
    // hovered, reducing visual noise for documents with many notes.
    const isCollapsed = variant === "margin" && !isActive && !isHovered;

    const excerpt = useMemo(() => {
        if (!content) return "";
        const tmp = document.createElement("div");
        tmp.innerHTML = content;
        return tmp.textContent || "";
    }, [content]);

    return (
        <div
            ref={variant === "sheet" ? undefined : registerRef}
            className={
                variant === "sheet"
                    ? "group/card w-full"
                    : `fixed z-40 sticky-note-card-enter group/card${isActive ? " is-active" : ""}${isHovered ? " is-hovered" : ""}`
            }
            style={
                variant === "sheet"
                    ? undefined
                    : {
                          top: `${placed?.top ?? top}px`,
                          left: `${left}px`,
                          width: `${width}px`,
                          maxWidth: "calc(100vw - 24px)",
                      }
            }
            data-note-id={noteId}
            onMouseEnter={() => onHoverChange?.(noteId)}
            onMouseLeave={() => onHoverChange?.(null)}
        >
            <div
                className={`sticky-note-card-shell${variant === "sheet" ? " sticky-note-card-shell--sheet" : ""}`}
                style={{
                    background: `linear-gradient(180deg, ${tone.bg} 0%, ${tone.bg} 100%)`,
                    boxShadow: `inset 3px 0 0 0 ${tone.border}`,
                    borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                }}
            >
                {isCollapsed ? (
                    <div
                        className="px-3 py-2 cursor-pointer"
                        onClick={() => onActivate?.(noteId)}
                    >
                        <div className="flex items-start gap-1.5">
                            <span
                                className="mt-1 h-2 w-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: tone.border }}
                            />
                            <p className="line-clamp-2 text-[12px] leading-snug text-foreground/70">
                                {excerpt || t("stickyNote.placeholder")}
                            </p>
                        </div>
                    </div>
                ) : (
                <>
                {/* Body */}
                <div
                    className="px-3 py-2.5 sticky-note-card-editor relative"
                    style={placed ? { maxHeight: `${Math.max(80, placed.maxHeight - 48)}px` } : undefined}
                >
                    {isEmpty && isEditable && (
                        <div className="pointer-events-none absolute top-2.5 left-3 text-[12px] text-foreground/40 select-none">
                            {t("stickyNote.placeholder")}
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
                            tooltip={t("stickyNote.bold")}
                            active={!!innerEditor?.isActive("bold")}
                            onClick={() => triggerCmd((e) => e.chain().focus().toggleBold().run())}
                        >
                            <Bold className="h-3 w-3" />
                        </ToolbarButton>
                        <ToolbarButton
                            tooltip={t("stickyNote.italic")}
                            active={!!innerEditor?.isActive("italic")}
                            onClick={() => triggerCmd((e) => e.chain().focus().toggleItalic().run())}
                        >
                            <Italic className="h-3 w-3" />
                        </ToolbarButton>
                        <ToolbarButton
                            tooltip={t("stickyNote.code")}
                            active={!!innerEditor?.isActive("code")}
                            onClick={() => triggerCmd((e) => e.chain().focus().toggleCode().run())}
                        >
                            <Code className="h-3 w-3" />
                        </ToolbarButton>
                        <span className="sticky-note-toolbar-divider" />
                        <ToolbarButton
                            tooltip={t("stickyNote.bulletList")}
                            active={!!innerEditor?.isActive("bulletList")}
                            onClick={() => triggerCmd((e) => e.chain().focus().toggleBulletList().run())}
                        >
                            <List className="h-3 w-3" />
                        </ToolbarButton>
                        <ToolbarButton
                            tooltip={t("stickyNote.orderedList")}
                            active={!!innerEditor?.isActive("orderedList")}
                            onClick={() => triggerCmd((e) => e.chain().focus().toggleOrderedList().run())}
                        >
                            <ListOrdered className="h-3 w-3" />
                        </ToolbarButton>

                        <div className="flex-1" />

                        <div className="relative" ref={colorPopRef}>
                            <ToolbarButton
                                tooltip={t("stickyNote.color")}
                                active={showColors}
                                onClick={() => setShowColors((v) => !v)}
                            >
                                <Palette className="h-3 w-3" />
                            </ToolbarButton>
                            {showColors && (
                                <div
                                    className="sticky-note-color-pop absolute right-0 bottom-8 z-50 flex items-center gap-1.5 p-2 rounded-lg border bg-popover text-popover-foreground shadow-lg"
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
                            className={`h-5 w-5 p-0 transition-colors ${
                                confirmDelete
                                    ? "text-destructive bg-destructive/10"
                                    : "text-foreground/60 hover:text-destructive hover:bg-destructive/10"
                            }`}
                            onClick={handleDelete}
                            aria-label={confirmDelete ? t("stickyNote.deleteConfirm") : t("stickyNote.delete")}
                            title={confirmDelete ? t("stickyNote.deleteConfirm") : t("stickyNote.delete")}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                )}
                </>
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
