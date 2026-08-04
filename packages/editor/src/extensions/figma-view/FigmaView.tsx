import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { cn, Button, useResolvedTheme } from "@kn/ui";
import {
    AlertCircle,
    CornerDownLeft,
    Edit,
    ExternalLink,
    FigmaIcon,
    Loader2,
    RefreshCw,
    Trash2,
} from "@kn/icon";

const DEFAULT_HEIGHT = 480;
const MIN_HEIGHT = 280;
const MAX_HEIGHT = 1200;

// URL validation helper
const isValidUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
};

// Only figma.com links can be rendered through the Figma live embed kit
const isFigmaUrl = (value: string): boolean => {
    try {
        const hostname = new URL(value).hostname;
        return hostname === "figma.com" || hostname.endsWith(".figma.com");
    } catch {
        return false;
    }
};

// Normalize user input into a full URL (prepend https:// for scheme-less input)
const normalizeUrl = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) return `https://${trimmed}`;
    return trimmed;
};

const clampHeight = (value: number): number =>
    Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(value)));

const FigmaViewComponentImpl: React.FC<NodeViewProps> = ({
    editor,
    node,
    updateAttributes,
    deleteNode,
}) => {
    const { url, height } = node.attrs;
    const isEditable = editor.isEditable;
    const resolvedTheme = useResolvedTheme();

    const [isEditing, setIsEditing] = useState(!url && isEditable);
    const [inputValue, setInputValue] = useState<string>(url || "");
    const [inputError, setInputError] = useState(false);
    const [isLoading, setIsLoading] = useState(Boolean(url));
    const [loadError, setLoadError] = useState(false);
    // Remounting the iframe is the only cross-origin-safe way to reload it
    const [reloadKey, setReloadKey] = useState(0);
    const [dragHeight, setDragHeight] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const storedHeight = Number(height) > 0 ? Number(height) : DEFAULT_HEIGHT;
    const frameHeight = dragHeight ?? storedHeight;
    const isResizing = dragHeight !== null;

    // Show the loading overlay again when the embedded file changes
    useEffect(() => {
        if (url) {
            setIsLoading(true);
            setLoadError(false);
        }
    }, [url]);

    // Commit a URL from the inline input: the embed renders immediately
    const commitUrl = useCallback(
        (raw: string) => {
            const normalized = normalizeUrl(raw);
            if (!isValidUrl(normalized) || !isFigmaUrl(normalized)) {
                setInputError(true);
                return false;
            }
            setInputError(false);
            setIsEditing(false);
            if (normalized !== url) {
                updateAttributes({ url: normalized });
            }
            return true;
        },
        [url, updateAttributes]
    );

    // Leave the inline input without committing
    const cancelEditing = useCallback(() => {
        if (!url) {
            deleteNode();
        } else {
            setInputValue(url);
            setInputError(false);
            setIsEditing(false);
        }
    }, [url, deleteNode]);

    const handleInputKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            // Keep keystrokes inside the input, away from editor shortcuts
            e.stopPropagation();
            if (e.key === "Enter") {
                e.preventDefault();
                commitUrl(inputValue);
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEditing();
            }
        },
        [inputValue, commitUrl, cancelEditing]
    );

    // Pasting a valid Figma link commits instantly (Notion-like)
    const handleInputPaste = useCallback(
        (e: React.ClipboardEvent<HTMLInputElement>) => {
            const text = e.clipboardData.getData("text/plain");
            const normalized = normalizeUrl(text);
            if (text && isValidUrl(normalized) && isFigmaUrl(normalized)) {
                e.preventDefault();
                e.stopPropagation();
                commitUrl(text);
            }
        },
        [commitUrl]
    );

    const handleInputBlur = useCallback(
        (e: React.FocusEvent<HTMLInputElement>) => {
            // Ignore focus moves within the figma block itself
            if (containerRef.current?.contains(e.relatedTarget as Node)) return;
            const normalized = normalizeUrl(inputValue);
            if (normalized && isValidUrl(normalized) && isFigmaUrl(normalized)) {
                commitUrl(inputValue);
            } else {
                cancelEditing();
            }
        },
        [inputValue, commitUrl, cancelEditing]
    );

    const handleEdit = useCallback(() => {
        setInputValue(url || "");
        setInputError(false);
        setIsEditing(true);
    }, [url]);

    const handleReload = useCallback(() => {
        setIsLoading(true);
        setLoadError(false);
        setReloadKey((key) => key + 1);
    }, []);

    const handleOpenOriginal = useCallback(() => {
        if (url) {
            window.open(url, "_blank", "noopener,noreferrer");
        }
    }, [url]);

    // Vertical resize: track the drag locally, persist once on release
    const startResize = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!isEditable) return;
            e.preventDefault();
            e.stopPropagation();
            const startY = e.clientY;
            const startHeight = storedHeight;
            setDragHeight(startHeight);

            const onMove = (ev: PointerEvent) => {
                setDragHeight(clampHeight(startHeight + ev.clientY - startY));
            };
            const onUp = (ev: PointerEvent) => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                updateAttributes({
                    height: clampHeight(startHeight + ev.clientY - startY),
                });
                setDragHeight(null);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
        },
        [isEditable, storedHeight, updateAttributes]
    );

    const embedSrc = useMemo(() => {
        if (!url) return "";
        const joiner = url.includes("?") ? "&" : "?";
        return `https://www.figma.com/embed?embed_host=knowledge&url=${encodeURIComponent(
            `${url}${joiner}theme=${resolvedTheme}`
        )}`;
    }, [url, resolvedTheme]);

    // Inline URL input (create / edit)
    if (isEditing) {
        return (
            <NodeViewWrapper>
                <div ref={containerRef} className="my-2" contentEditable={false}>
                    <div
                        className={cn(
                            "flex items-center gap-2.5 rounded-md border bg-muted/40 px-3 py-2 transition-colors",
                            inputError
                                ? "border-red-400/70"
                                : "border-border/60 focus-within:border-border focus-within:bg-muted/60"
                        )}
                    >
                        <FigmaIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground/70" />
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => {
                                setInputValue(e.target.value);
                                setInputError(false);
                            }}
                            onKeyDown={handleInputKeyDown}
                            onPaste={handleInputPaste}
                            onBlur={handleInputBlur}
                            placeholder="Paste a Figma link to embed…"
                            autoFocus
                            spellCheck={false}
                            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                        />
                        <span className="flex flex-shrink-0 items-center gap-1 text-[11px] text-muted-foreground/50">
                            <CornerDownLeft className="h-3 w-3" />
                            Enter
                        </span>
                    </div>
                    {inputError ? (
                        <p className="mt-1 px-1 text-xs text-red-500">
                            Please enter a valid Figma link (https://www.figma.com/…)
                        </p>
                    ) : (
                        <p className="mt-1 px-1 text-xs text-muted-foreground/50">
                            Works with file, prototype, board and slides links.
                        </p>
                    )}
                </div>
            </NodeViewWrapper>
        );
    }

    // Read-only view of an embed that never got a URL
    if (!url) {
        return (
            <NodeViewWrapper>
                <div className="my-2 flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground/60">
                    <FigmaIcon className="h-4 w-4 flex-shrink-0" />
                    <span>Empty Figma embed</span>
                </div>
            </NodeViewWrapper>
        );
    }

    return (
        <NodeViewWrapper>
            <div
                ref={containerRef}
                className={cn(
                    "group relative my-2 overflow-hidden rounded-md border border-border/60 bg-card transition-colors",
                    "hover:border-border",
                    isResizing && "select-none"
                )}
                contentEditable={false}
            >
                <div className="relative w-full" style={{ height: frameHeight }}>
                    {isLoading && !loadError && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted/40">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
                            <span className="text-xs text-muted-foreground">Loading Figma…</span>
                        </div>
                    )}
                    {loadError && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted/40 px-4 text-center">
                            <AlertCircle className="h-5 w-5 text-destructive/80" />
                            <p className="text-sm text-muted-foreground">
                                Failed to load the Figma file
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={handleReload}>
                                    Retry
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleOpenOriginal}>
                                    Open in Figma
                                </Button>
                            </div>
                        </div>
                    )}
                    <iframe
                        key={reloadKey}
                        src={embedSrc}
                        title="Figma embed"
                        allowFullScreen
                        className={cn("h-full w-full border-0", isResizing && "pointer-events-none")}
                        onLoad={() => {
                            setIsLoading(false);
                            setLoadError(false);
                        }}
                        onError={() => {
                            setIsLoading(false);
                            setLoadError(true);
                        }}
                    />
                </div>

                {/* Action buttons - shown on hover when editable; pointer events are
                    tied to visibility so the hidden pill never blocks the iframe */}
                {isEditable && (
                    <div className="pointer-events-none absolute right-1.5 top-1.5 z-20 flex items-center gap-0.5 rounded-sm border border-border/40 bg-background/95 p-0.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={handleOpenOriginal}
                            title="Open in Figma"
                        >
                            <ExternalLink className="h-3 w-3" />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={handleReload}
                            disabled={isLoading}
                            title="Reload"
                        >
                            {isLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <RefreshCw className="h-3 w-3" />
                            )}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={handleEdit}
                            title="Edit link"
                        >
                            <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                            onClick={deleteNode}
                            title="Delete embed"
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                )}

                {/* Bottom resize grip - drag to adjust the embed height */}
                {isEditable && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-3 items-center justify-center">
                        <div
                            onPointerDown={startResize}
                            className={cn(
                                "flex h-full w-12 cursor-row-resize items-center justify-center transition-opacity",
                                isResizing
                                    ? "pointer-events-auto opacity-100"
                                    : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
                            )}
                            title="Drag to resize"
                        >
                            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
                        </div>
                    </div>
                )}
            </div>
        </NodeViewWrapper>
    );
};

// Memoized export for better performance
export const FigmaViewComponent = memo(FigmaViewComponentImpl);
