import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, Editor as InnerEditor, useEditorExtension } from "@kn/editor";
import type { AnyExtension } from "@kn/editor";
import { Button, Popover, PopoverContent, PopoverTrigger, useTheme } from "@kn/ui";
import { Trash2, Palette, Bold, Italic, List, ListOrdered, Code } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { findStickyNoteColor, STICKY_NOTE_COLORS } from "../constants";

/**
 * Extensions from the parent editor kept alive inside the in-card mini editor.
 * Whitelist (rather than blocklist) so we don't inherit slash menus, bubble
 * menus, drag handles, floating UIs, unique-id trackers, etc. inside a tiny
 * annotation surface — those all misbehave when nested and add heavy plugin
 * state we don't need.
 */
const INNER_EDITOR_ALLOWED = new Set<string>([
    "doc",
    "paragraph",
    "text",
    "undoRedo",
    "history",
    "bold",
    "italic",
    "code",
    "strike",
    "bulletList",
    "orderedList",
    "listItem",
    "hardBreak",
]);

const VIEWPORT_MARGIN = 16;

/**
 * Compute the max height available for a card's (scrollable) body WITHOUT
 * moving the card. `useMarginCards` already lays the cards out top-to-bottom
 * in anchor order with overlap resolved; re-clamping a bottom card upward
 * here (the comment plugin's behavior for its single ACTIVE card) made
 * always-expanded sticky notes jump ~560px up and land on top of the cards
 * above them — the panel looked shuffled. So the top is only floored to the
 * viewport margin; a card near the bottom edge keeps its slot and just gets
 * a smaller body, running off-screen until scrolling brings it up.
 */
function placeVertically(top: number, hardCap = 560): { top: number; maxHeight: number } {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const maxAllowed = Math.min(hardCap, vh - VIEWPORT_MARGIN * 2);
    const t = Math.max(VIEWPORT_MARGIN, top);
    const available = vh - t - VIEWPORT_MARGIN;
    // Floor keeps a usable body (see the 80px body floor at the call site).
    return { top: t, maxHeight: Math.min(Math.max(available, 128), maxAllowed) };
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
    /** Whether this card's highlight is the active (clicked / newly-created) one. */
    isActive?: boolean;
    /** Whether this card's highlight is being hovered. */
    isHovered?: boolean;
    /** Called when the card starts/stops being hovered (noteId or null). */
    onHoverChange?: (noteId: string | null) => void;
    /**
     * "margin" (default): fixed-positioned card in the editor's left margin (desktop).
     * "sheet": plain block that fills its container (mobile bottom sheet) — no
     * fixed positioning.
     */
    variant?: "margin" | "sheet";
}

/**
 * Always-visible margin sticky note. Hosts a tiny rich-text editor (whitelisted
 * extensions from the parent) so the user can format content
 * (bold/italic/lists/code). Cards render at full height regardless of hover;
 * `isActive` is used only to auto-focus the mini editor on creation.
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
    variant = "margin",
}) => {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const { t } = useTranslation();
    const palette = findStickyNoteColor(color);
    const tone = isDark ? palette.dark : palette.light;

    const [showColors, setShowColors] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

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

    // Latest external values, kept in refs so the editor can stay mounted while
    // debounced saves always use current callbacks and comparison content.
    const contentRef = useRef(content);
    contentRef.current = content;
    const onContentChangeRef = useRef(onContentChange);
    onContentChangeRef.current = onContentChange;

    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingEditorRef = useRef<InnerEditor | null>(null);
    const flushPendingContent = useCallback(() => {
        const pendingEditor = pendingEditorRef.current;
        pendingEditorRef.current = null;
        if (!pendingEditor) return;

        const pendingContent = pendingEditor.getHTML();
        if (pendingContent !== contentRef.current) {
            onContentChangeRef.current(pendingContent);
        }
    }, []);

    // Reuse a curated subset of the parent editor's extensions so formatting
    // works but the small note isn't infected with slash / bubble / floating
    // UIs. The parent list already excludes stickyNote itself.
    const [parentExtensions] = useEditorExtension("stickyNote");
    const innerExtensions = useMemo(
        () =>
            (parentExtensions as AnyExtension[]).filter((e) =>
                INNER_EDITOR_ALLOWED.has(e.name)
            ),
        [parentExtensions]
    );

    const innerEditor = useEditor(
        {
            editable: isEditable,
            extensions: innerExtensions,
            content: content || "",
            onUpdate: ({ editor }) => {
                pendingEditorRef.current = editor;
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                saveTimerRef.current = setTimeout(() => {
                    saveTimerRef.current = null;
                    flushPendingContent();
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
            saveTimerRef.current = null;
            flushPendingContent();
        };
    }, [flushPendingContent]);

    // Auto-focus the mini editor once per "activation" (newly created note or
    // clicked highlight). We track the last focused noteId in a ref so the
    // effect doesn't repeatedly steal focus while the card is active.
    const lastFocusedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!innerEditor || innerEditor.isDestroyed) return;
        if (!isActive || !isEditable) return;
        if (lastFocusedRef.current === noteId) return;
        lastFocusedRef.current = noteId;
        // Wait a tick so the card is mounted and the parent has finished its
        // own focus dance after the mark was added.
        const timer = setTimeout(() => {
            if (!innerEditor.isDestroyed) innerEditor.commands.focus("end");
        }, 0);
        return () => clearTimeout(timer);
    }, [isActive, isEditable, innerEditor, noteId]);

    // Reset the focus latch once the card stops being active so a future
    // re-activation can steal focus again.
    useEffect(() => {
        if (!isActive) lastFocusedRef.current = null;
    }, [isActive]);

    const isEmpty = innerEditor ? innerEditor.isEmpty : !content;

    const triggerCmd = useCallback(
        (fn: (e: InnerEditor) => void) => {
            if (!innerEditor) return;
            fn(innerEditor);
        },
        [innerEditor]
    );

    const handleDeleteClick = useCallback(() => {
        // Empty note: no content to lose, just delete.
        if (isEmpty) {
            onDelete();
            return;
        }
        // Otherwise open an explicit confirmation popover.
        setConfirmOpen(true);
    }, [isEmpty, onDelete]);

    // Viewport clamping for the margin variant so cards near the bottom
    // don't extend off-screen.
    const placed = variant === "margin" ? placeVertically(top) : null;

    return (
        <div
            ref={variant === "sheet" ? undefined : registerRef}
            className={
                variant === "sheet"
                    ? "group/card w-full"
                    : `fixed ${showColors ? "z-50" : "z-40"} sticky-note-card-enter group/card${isActive ? " is-active" : ""}${isHovered ? " is-hovered" : ""}`
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
                    backgroundColor: tone.bg,
                    borderColor: tone.border,
                }}
            >
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

                {/* Footer toolbar — always visible when editable */}
                {isEditable && (
                    <div
                        className="sticky-note-card-toolbar flex items-center gap-0.5 px-2 py-1.5"
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
                                <div className={`sticky-note-color-pop${variant === "sheet" ? " sticky-note-color-pop--sheet" : ""}`}>
                                    {STICKY_NOTE_COLORS.map((item) => {
                                        const itemTone = isDark ? item.dark : item.light;
                                        const selected = item.name === palette.name;
                                        return (
                                            <button
                                                key={item.name}
                                                type="button"
                                                className="sticky-note-color-swatch"
                                                data-selected={selected ? "true" : undefined}
                                                style={{
                                                    "--sticky-note-swatch-bg": itemTone.bg,
                                                    "--sticky-note-swatch-border": itemTone.border,
                                                } as React.CSSProperties}
                                                aria-label={item.label}
                                                aria-pressed={selected}
                                                onClick={() => onColorChange(item.name)}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Delete: empty note → one click deletes; non-empty → confirm. */}
                        <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 w-5 p-0 text-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    onClick={handleDeleteClick}
                                    aria-label={t("stickyNote.delete")}
                                    title={t("stickyNote.delete")}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                side="top"
                                align="end"
                                className="w-56 p-3"
                                onOpenAutoFocus={(e) => e.preventDefault()}
                            >
                                <p className="text-sm text-foreground mb-3">
                                    {t("stickyNote.deleteConfirm")}
                                </p>
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => setConfirmOpen(false)}
                                    >
                                        {t("stickyNote.cancel")}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => {
                                            setConfirmOpen(false);
                                            onDelete();
                                        }}
                                    >
                                        {t("stickyNote.delete")}
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
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
        // Keep the mini editor focused when clicking a toolbar button — without
        // this the button steals focus on mousedown and `chain().focus()` in
        // the handler runs against the wrong (parent) editor.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={`h-5 w-5 inline-flex items-center justify-center rounded-[4px] text-foreground/60 hover:text-foreground hover:bg-black/[0.08] dark:hover:bg-white/10 transition-colors ${active ? "bg-black/10 dark:bg-white/15 text-foreground" : ""
            }`}
    >
        {children}
    </button>
);
