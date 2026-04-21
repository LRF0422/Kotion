import React, { useState, useCallback, useMemo, useEffect, memo, useRef } from "react";
import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { cn } from "@kn/ui";
import { Button, Input, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@kn/ui";
import { Bookmark as BookmarkIcon, ExternalLink, Edit, Trash2, Loader2 } from "@kn/icon";

// URL validation helper
const isValidUrl = (string: string): boolean => {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
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

// Fetch URL metadata
const fetchUrlMetadata = async (url: string): Promise<{
    title?: string;
    description?: string;
    favicon?: string;
    image?: string;
}> => {
    try {
        // Use a CORS proxy or backend endpoint for fetching metadata
        // For now, we'll try to fetch directly and fallback gracefully
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'text/html',
            },
        });

        if (!response.ok) throw new Error('Failed to fetch');

        const html = await response.text();
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
        if (image) image = resolveUrl(url, image);
        if (favicon) favicon = resolveUrl(url, favicon);

        return { title, description, image, favicon };
    } catch {
        // Return empty object on failure - graceful degradation
        return {};
    }
};

const BookmarkViewComponent: React.FC<NodeViewProps> = ({
    editor,
    node,
    updateAttributes,
    deleteNode,
}) => {
    const { url, title, description, favicon, image } = node.attrs;
    const isEditable = editor.isEditable;
    const [isEditMode, setIsEditMode] = useState(!url);
    const [editUrl, setEditUrl] = useState(url || '');
    const [editTitle, setEditTitle] = useState(title || '');
    const [editDescription, setEditDescription] = useState(description || '');
    const [editImage, setEditImage] = useState(image || '');
    const [editFavicon, setEditFavicon] = useState(favicon || '');
    const [isLoading, setIsLoading] = useState(false);
    const [urlError, setUrlError] = useState<string | null>(null);
    const fetchAbortRef = useRef<AbortController | null>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const lastFetchedUrl = useRef<string>('');

    // Reset edit state when node attrs change
    useEffect(() => {
        if (!isEditMode) {
            setEditUrl(url || '');
            setEditTitle(title || '');
            setEditDescription(description || '');
            setEditImage(image || '');
            setEditFavicon(favicon || '');
        }
    }, [url, title, description, image, favicon, isEditMode]);

    // Auto-fetch metadata when URL changes (with debounce)
    useEffect(() => {
        // Clear previous debounce
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        // Don't fetch if URL hasn't changed or is invalid
        if (!editUrl.trim() || !isValidUrl(editUrl) || editUrl === lastFetchedUrl.current) {
            return;
        }

        // Debounce the fetch
        debounceRef.current = setTimeout(async () => {
            setUrlError(null);
            setIsLoading(true);
            lastFetchedUrl.current = editUrl;

            // Cancel previous fetch
            if (fetchAbortRef.current) {
                fetchAbortRef.current.abort();
            }
            fetchAbortRef.current = new AbortController();

            try {
                const metadata = await fetchUrlMetadata(editUrl);

                // Auto-fill all fetched metadata
                if (metadata.title) {
                    setEditTitle(metadata.title);
                }
                if (metadata.description) {
                    setEditDescription(metadata.description);
                }
                if (metadata.image) {
                    setEditImage(metadata.image);
                }
                if (metadata.favicon) {
                    setEditFavicon(metadata.favicon);
                }
            } catch {
                // Silently handle fetch errors
            } finally {
                setIsLoading(false);
            }
        }, 500); // 500ms debounce

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [editUrl]);

    const handleSave = useCallback(() => {
        if (!editUrl.trim()) {
            setUrlError('URL is required');
            return;
        }

        if (!isValidUrl(editUrl)) {
            setUrlError('Please enter a valid URL');
            return;
        }

        setUrlError(null);
        updateAttributes({
            url: editUrl,
            title: editTitle,
            description: editDescription,
            image: editImage,
            favicon: editFavicon,
        });
        setIsEditMode(false);
    }, [editUrl, editTitle, editDescription, editImage, editFavicon, updateAttributes]);

    const handleCancel = useCallback(() => {
        // Cancel any pending fetch
        if (fetchAbortRef.current) {
            fetchAbortRef.current.abort();
        }
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (!url) {
            deleteNode();
        } else {
            setEditUrl(url);
            setEditTitle(title);
            setEditDescription(description);
            setEditImage(image);
            setEditFavicon(favicon);
            setUrlError(null);
            setIsEditMode(false);
            lastFetchedUrl.current = url;
        }
    }, [url, title, description, image, favicon, deleteNode]);

    const handleEdit = useCallback(() => {
        setIsEditMode(true);
        lastFetchedUrl.current = url || '';
    }, [url]);

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
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return '';
        }
    }, [url]);

    // Get favicon URL
    const faviconUrl = useMemo(() => {
        if (favicon) return favicon;
        if (domain) {
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        }
        return null;
    }, [favicon, domain]);

    if (isEditMode) {
        return (
            <NodeViewWrapper>
                <Dialog open={isEditMode} onOpenChange={(open) => !open && handleCancel()}>
                    <DialogContent className="sm:max-w-[600px]">
                        <DialogHeader>
                            <DialogTitle>Add Bookmark</DialogTitle>
                            <DialogDescription>
                                Paste a URL and metadata will be fetched automatically
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label htmlFor="url" className="text-sm font-medium">
                                    URL <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <Input
                                        id="url"
                                        placeholder="https://example.com"
                                        value={editUrl}
                                        onChange={(e) => {
                                            setEditUrl(e.target.value);
                                            setUrlError(null);
                                        }}
                                        autoFocus
                                        className={cn(
                                            urlError && "border-red-500 focus-visible:ring-red-500",
                                            isLoading && "pr-10"
                                        )}
                                    />
                                    {isLoading && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        </div>
                                    )}
                                </div>
                                {urlError && (
                                    <p className="text-sm text-red-500">{urlError}</p>
                                )}
                                {isLoading && (
                                    <p className="text-xs text-muted-foreground">
                                        Fetching page metadata...
                                    </p>
                                )}
                            </div>

                            {/* Preview of fetched metadata */}
                            {(editTitle || editDescription || editImage) && (
                                <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
                                    {editImage && (
                                        <img
                                            src={editImage}
                                            alt="Preview"
                                            className="w-full h-32 object-cover rounded-md"
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                            }}
                                        />
                                    )}
                                    {editTitle && (
                                        <p className="font-medium text-sm line-clamp-2">{editTitle}</p>
                                    )}
                                    {editDescription && (
                                        <p className="text-xs text-muted-foreground line-clamp-2">{editDescription}</p>
                                    )}
                                </div>
                            )}

                            <details className="group">
                                <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">
                                    Edit details manually
                                </summary>
                                <div className="mt-3 space-y-4">
                                    <div className="space-y-2">
                                        <label htmlFor="title" className="text-sm font-medium">
                                            Title
                                        </label>
                                        <Input
                                            id="title"
                                            placeholder="Bookmark title"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="description" className="text-sm font-medium">
                                            Description
                                        </label>
                                        <Textarea
                                            id="description"
                                            placeholder="Brief description"
                                            value={editDescription}
                                            onChange={(e) => setEditDescription(e.target.value)}
                                            rows={2}
                                        />
                                    </div>
                                </div>
                            </details>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={handleCancel}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={!editUrl.trim() || isLoading}>
                                {isLoading ? 'Loading...' : 'Save'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </NodeViewWrapper>
        );
    }

    return (
        <NodeViewWrapper>
            <div
                className={cn(
                    "group relative my-2 flex overflow-hidden rounded-md border border-border/60 bg-card transition-colors",
                    "hover:bg-accent/20 hover:border-border",
                    isEditable && "cursor-pointer"
                )}
                onClick={handleOpenLink}
                title={url}
            >
                {/* Left side - Content */}
                <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
                    {/* Title */}
                    {title ? (
                        <h3 className="mb-1 text-sm font-medium text-foreground line-clamp-1">
                            {title}
                        </h3>
                    ) : url && (
                        <h3 className="mb-1 text-sm font-medium text-muted-foreground line-clamp-1">
                            {url}
                        </h3>
                    )}

                    {/* Description */}
                    {description && (
                        <p className="mb-2 text-xs text-muted-foreground line-clamp-1">
                            {description}
                        </p>
                    )}

                    {/* URL with favicon */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                        {faviconUrl ? (
                            <img
                                src={faviconUrl}
                                alt=""
                                className="h-3.5 w-3.5 flex-shrink-0 rounded-[2px]"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                        ) : (
                            <BookmarkIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                        )}
                        <span className="truncate">
                            {domain || url}
                        </span>
                    </div>
                </div>

                {/* Right side - Preview image */}
                {image && (
                    <div className="flex-shrink-0 w-[120px] border-l border-border/40 bg-muted">
                        <img
                            src={image}
                            alt={title || 'Bookmark preview'}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                                e.currentTarget.parentElement!.style.display = 'none';
                            }}
                        />
                    </div>
                )}

                {/* Action buttons - shown on hover when editable */}
                {isEditable && (
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-background/90 backdrop-blur-sm rounded-sm shadow-sm p-0.5 border border-border/40">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleOpenLink();
                            }}
                            title="Open link"
                        >
                            <ExternalLink className="h-3 w-3" />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleEdit();
                            }}
                            title="Edit bookmark"
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
