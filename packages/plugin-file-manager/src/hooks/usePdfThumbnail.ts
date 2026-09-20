import { useEffect, useRef, useState, type RefObject } from 'react';
import { useFileService } from '@kn/common';

/**
 * Rendered thumbnails are kept as object URLs for the session so scrolling a
 * folder back and forth doesn't re-request (and the backend doesn't re-render).
 */
const thumbnailCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 200;

const rememberThumbnail = (fileId: string, url: string) => {
    thumbnailCache.set(fileId, url);
    if (thumbnailCache.size <= MAX_CACHE_ENTRIES) return;
    const oldestKey = thumbnailCache.keys().next().value as string | undefined;
    if (oldestKey === undefined) return;
    const oldestUrl = thumbnailCache.get(oldestKey);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
    thumbnailCache.delete(oldestKey);
};

interface ThumbnailEntry {
    fileId: string;
    url: string;
}

export interface PdfThumbnailState {
    /** Attach to the placeholder so rendering starts only once the card is visible. */
    containerRef: RefObject<HTMLDivElement>;
    /** Object URL once ready; empty while loading, unsupported, or on failure. */
    url: string;
}

/**
 * Lazily resolve a PDF's first-page thumbnail. The request only fires when the
 * card scrolls into view, and the resulting object URL is cached per file id.
 * Returns an empty url when the host does not implement getFileThumbnail.
 */
export const usePdfThumbnail = (fileId: string, enabled: boolean): PdfThumbnailState => {
    const fileService = useFileService();
    const containerRef = useRef<HTMLDivElement>(null);
    const [entry, setEntry] = useState<ThumbnailEntry>(() => ({
        fileId,
        url: enabled ? thumbnailCache.get(fileId) ?? '' : '',
    }));
    const [visibleFileId, setVisibleFileId] = useState<string | null>(null);

    const url = entry.fileId === fileId
        ? entry.url
        : (enabled ? thumbnailCache.get(fileId) ?? '' : '');

    useEffect(() => {
        if (!enabled) return;
        const node = containerRef.current;
        if (!node || typeof IntersectionObserver === 'undefined') {
            setVisibleFileId(fileId);
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((candidate) => candidate.isIntersecting)) {
                setVisibleFileId(fileId);
                observer.disconnect();
            }
        }, { rootMargin: '300px 0px' });
        observer.observe(node);
        return () => observer.disconnect();
    }, [enabled, fileId]);

    useEffect(() => {
        if (!enabled || visibleFileId !== fileId || url) return;

        const cached = thumbnailCache.get(fileId);
        if (cached) {
            setEntry({ fileId, url: cached });
            return;
        }

        const load = fileService.getFileThumbnail;
        if (!load) return;

        let disposed = false;
        load.call(fileService, fileId)
            .then((blob) => {
                if (disposed) return;
                const objectUrl = URL.createObjectURL(blob);
                rememberThumbnail(fileId, objectUrl);
                setEntry({ fileId, url: objectUrl });
            })
            .catch(() => {
                // Keep the tinted type icon; thumbnail failures must not break the list.
            });
        return () => {
            disposed = true;
        };
    }, [enabled, visibleFileId, fileId, url, fileService]);

    return { containerRef, url };
};
