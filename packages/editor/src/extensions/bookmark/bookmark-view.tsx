import React, { useState, useCallback, useMemo, useEffect, memo, useRef } from "react";
import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { cn, Button, Skeleton } from "@kn/ui";
import { Bookmark as BookmarkIcon, Edit, Trash2, Loader2, Link2, RefreshCw, CornerDownLeft } from "@kn/icon";

// URL validation helper
const isValidUrl = (string: string): boolean => {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

// Normalize user input into a full URL (prepend https:// for scheme-less input)
const normalizeUrl = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    // Looks like a domain, e.g. "example.com/path"
    if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) return `https://${trimmed}`;
    return trimmed;
};

// Resolve relative URL to absolute URL
const resolveUrl = (baseUrl: string, relativeUrl: string): string => {
    if (!relativeUrl) return '';
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
        return relativeUrl;
    }
    if (relativeUrl.startsWith('//')) {
        return 'https:' + relativeUrl;
    }
    try {
        return new URL(relativeUrl, baseUrl).href;
    } catch {
        return relativeUrl;
    }
};

// Fetch raw HTML with a timeout, returns null on any failure
const fetchHtml = async (fetchUrl: string, timeoutMs = 8000): Promise<string | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(fetchUrl, {
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'text/html',
            },
            signal: controller.signal,
        });
        if (!response.ok) return null;
        return await response.text();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
};

// Parse metadata out of an HTML document
const parseMetadata = (html: string, baseUrl: string): {
    title?: string;
    description?: string;
    favicon?: string;
    image?: string;
} => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract metadata
    const getMetaContent = (selectors: string[]): string | undefined => {
        for (const selector of selectors) {
            const el = doc.querySelector(selector);
            if (el) {
                const content = el.getAttribute('content') || el.getAttribute('href') || el.textContent;
                if (content) return content.trim();
            }
        }
        return undefined;
    };

    const title = getMetaContent([
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'title',
    ]);

    const description = getMetaContent([
        'meta[property="og:description"]',
        'meta[name="twitter:description"]',
        'meta[name="description"]',
    ]);

    let image = getMetaContent([
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]',
    ]);

    let favicon = getMetaContent([
        'link[rel="icon"]',
        'link[rel="shortcut icon"]',
        'link[rel="apple-touch-icon"]',
    ]);

    // Resolve relative URLs
    if (image) image = resolveUrl(baseUrl, image);
    if (favicon) favicon = resolveUrl(baseUrl, favicon);

    return { title, description, image, favicon };
};

// Fetch URL metadata: try direct fetch first, then public CORS proxies
// (most sites block cross-origin fetches, so proxies are the common path)
const fetchUrlMetadata = async (url: string): Promise<{
    title?: string;
    description?: string;
    favicon?: string;
    image?: string;
}> => {
    const sources = [
        // Same-origin dev/server proxy (no CORS restriction); falls through on 404
        `/__bookmark-proxy?url=${encodeURIComponent(url)}`,
        url,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    ];

    for (const source of sources) {
        const html = await fetchHtml(source);
        if (!html) continue;
        const metadata = parseMetadata(html, url);
        // Only accept results that actually contain something useful
        if (metadata.title || metadata.description || metadata.image) {
            return metadata;
        }
    }
    return {};
};

const BookmarkViewComponent: React.FC<NodeViewProps> = ({
    editor,
    node,
    updateAttributes,
    deleteNode,
}) => {
    const { url, title, description, favicon, image } = node.attrs;
    const isEditable = editor.isEditable;
    const [isEditing, setIsEditing] = useState(!url && isEditable);
    const [inputValue, setInputValue] = useState(url || '');
    const [inputError, setInputError] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [faviconIndex, setFaviconIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const fetchIdRef = useRef(0);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Fetch metadata for a URL and fill node attributes when done
    const fetchMetadata = useCallback(async (targetUrl: string) => {
        const fetchId = ++fetchIdRef.current;
        setIsFetching(true);
        const metadata = await fetchUrlMetadata(targetUrl);
        // Ignore stale responses (URL changed again meanwhile) and unmounts
        if (!mountedRef.current || fetchId !== fetchIdRef.current) return;
        // Only write fields that were actually fetched, keep existing values otherwise
        const updates: Record<string, string> = {};
        if (metadata.title) updates.title = metadata.title;
        if (metadata.description) updates.description = metadata.description;
        if (metadata.image) updates.image = metadata.image;
        if (metadata.favicon) updates.favicon = metadata.favicon;
        if (Object.keys(updates).length > 0) {
            updateAttributes(updates);
        }
        setImageError(false);
        setFaviconIndex(0);
        setIsFetching(false);
    }, [updateAttributes]);

    // Commit a URL from the inline input: card renders immediately, metadata fills in async
    const commitUrl = useCallback((raw: string) => {
        const normalized = normalizeUrl(raw);
        if (!isValidUrl(normalized)) {
            setInputError(true);
            return false;
        }
        setInputError(false);
        setIsEditing(false);
        const urlChanged = normalized !== url;
        if (urlChanged) {
            // Clear stale metadata from the previous URL
            updateAttributes({ url: normalized, title: '', description: '', image: '', favicon: '' });
        }
        if (urlChanged || !title) {
            fetchMetadata(normalized);
        }
        return true;
    }, [url, title, updateAttributes, fetchMetadata]);

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

    const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        // Keep keystrokes inside the input, away from editor shortcuts
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            commitUrl(inputValue);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEditing();
        }
    }, [inputValue, commitUrl, cancelEditing]);

    // Pasting a valid link commits instantly (Notion-like)
    const handleInputPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData('text/plain');
        if (text && isValidUrl(normalizeUrl(text))) {
            e.preventDefault();
            e.stopPropagation();
            commitUrl(text);
        }
    }, [commitUrl]);

    const handleInputBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        // Ignore focus moves within the bookmark block itself
        if (containerRef.current?.contains(e.relatedTarget as Node)) return;
        if (inputValue.trim() && isValidUrl(normalizeUrl(inputValue))) {
            commitUrl(inputValue);
        } else {
            cancelEditing();
        }
    }, [inputValue, commitUrl, cancelEditing]);

    const handleEdit = useCallback(() => {
        setInputValue(url || '');
        setInputError(false);
        setIsEditing(true);
    }, [url]);

    const handleRefresh = useCallback(() => {
        if (url) fetchMetadata(url);
    }, [url, fetchMetadata]);

    const handleDelete = useCallback(() => {
        deleteNode();
    }, [deleteNode]);

    const handleOpenLink = useCallback(() => {
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }, [url]);

    // Extract domain from URL for display
    const domain = useMemo(() => {
        if (!url) return '';
        try {
            return new URL(url).hostname;
        } catch {
            return '';
        }
    }, [url]);

    // Favicon candidates: fetched favicon → site /favicon.ico → DuckDuckGo icon service
    const faviconCandidates = useMemo(() => {
        const list: string[] = [];
        if (favicon) list.push(favicon);
        if (domain) {
            list.push(`https://${domain}/favicon.ico`);
            list.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
        }
        return list;
    }, [favicon, domain]);

    // Restart the fallback chain when candidates change
    useEffect(() => {
        setFaviconIndex(0);
    }, [faviconCandidates]);

    const faviconUrl = faviconIndex < faviconCandidates.length ? faviconCandidates[faviconIndex] : null;

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
                        <Link2 className="h-4 w-4 flex-shrink-0 text-muted-foreground/70" />
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
                            placeholder="Paste or type a link to create a bookmark…"
                            autoFocus
                            spellCheck={false}
                            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                        />
                        <span className="flex flex-shrink-0 items-center gap-1 text-[11px] text-muted-foreground/50">
                            <CornerDownLeft className="h-3 w-3" />
                            Enter
                        </span>
                    </div>
                    {inputError && (
                        <p className="mt-1 px-1 text-xs text-red-500">
                            Please enter a valid link (http:// or https://)
                        </p>
                    )}
                </div>
            </NodeViewWrapper>
        );
    }

    // Read-only view of a bookmark that never got a URL
    if (!url) {
        return (
            <NodeViewWrapper>
                <div className="my-2 flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground/60">
                    <BookmarkIcon className="h-4 w-4 flex-shrink-0" />
                    <span>Empty bookmark</span>
                </div>
            </NodeViewWrapper>
        );
    }

    const showImage = Boolean(image) && !imageError;

    return (
        <NodeViewWrapper>
            <div
                ref={containerRef}
                className={cn(
                    "group relative my-2 flex cursor-pointer overflow-hidden rounded-md border border-border/60 bg-card transition-colors",
                    "hover:border-border hover:bg-accent/20"
                )}
                onClick={handleOpenLink}
                title={url}
                contentEditable={false}
            >
                {/* Left side - Content */}
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-1 px-4 py-3">
                    {isFetching ? (
                        <div className="space-y-2 py-0.5">
                            <Skeleton className="h-4 w-2/5" />
                            <Skeleton className="h-3 w-4/5" />
                        </div>
                    ) : (
                        <>
                            {/* Title - falls back to domain, then raw URL */}
                            <h3
                                className={cn(
                                    "text-sm font-medium leading-5 line-clamp-1",
                                    title ? "text-foreground" : "text-muted-foreground"
                                )}
                            >
                                {title || domain || url}
                            </h3>

                            {/* Description */}
                            {description && (
                                <p className="text-xs leading-4 text-muted-foreground line-clamp-2">
                                    {description}
                                </p>
                            )}
                        </>
                    )}

                    {/* Footer - favicon + domain */}
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/70">
                        {faviconUrl ? (
                            <img
                                key={faviconUrl}
                                src={faviconUrl}
                                alt=""
                                className="h-3.5 w-3.5 flex-shrink-0 rounded-[2px]"
                                onError={() => setFaviconIndex((i) => i + 1)}
                            />
                        ) : (
                            <BookmarkIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                        )}
                        <span className="truncate">{domain || url}</span>
                    </div>
                </div>

                {/* Right side - Preview image */}
                {isFetching ? (
                    <div className="hidden w-[28%] min-w-[120px] max-w-[180px] flex-shrink-0 border-l border-border/40 sm:block">
                        <Skeleton className="h-full w-full rounded-none" />
                    </div>
                ) : showImage && (
                    <div className="relative hidden w-[28%] min-w-[120px] max-w-[180px] flex-shrink-0 border-l border-border/40 bg-muted sm:block">
                        <img
                            src={image}
                            alt={title || 'Bookmark preview'}
                            className="absolute inset-0 h-full w-full object-cover"
                            loading="lazy"
                            onError={() => setImageError(true)}
                        />
                    </div>
                )}

                {/* Action buttons - shown on hover when editable */}
                {isEditable && (
                    <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-sm border border-border/40 bg-background/95 p-0.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRefresh();
                            }}
                            disabled={isFetching}
                            title="Refresh metadata"
                        >
                            {isFetching ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <RefreshCw className="h-3 w-3" />
                            )}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleEdit();
                            }}
                            title="Edit link"
                        >
                            <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete();
                            }}
                            title="Delete bookmark"
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                )}
            </div>
        </NodeViewWrapper>
    );
};

// Memoized export for better performance
export const BookmarkView = memo(BookmarkViewComponent);
