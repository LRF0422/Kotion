/**
 * Pure planning helpers for file downloads.
 *
 * Deliberately free of browser globals and application imports so the download
 * rules stay unit-testable in Node (see `download-target.check.ts`).
 */

/** Everything the download flow needs to know about one file. */
export interface DownloadTarget {
    /** File-center record id. Preferred: downloads through the authenticated API. */
    id?: string;
    /** Display name used for the saved file. */
    name?: string;
    /** OSS object key (or absolute URL) used as a fallback source. */
    path?: string;
    /** Size in bytes, used to decide between buffering and streaming. */
    size?: number;
}

/** How the file bytes are fetched. */
export type DownloadStrategy = 'buffer' | 'stream';

/**
 * Files above this size stream straight from storage: buffering them into a
 * Blob keeps the whole payload in memory and can outlive the API timeout.
 */
export const LARGE_FILE_BUFFER_LIMIT = 64 * 1024 * 1024;

/** Pick the download strategy for a known file size (unknown sizes buffer). */
export const chooseDownloadStrategy = (size?: number): DownloadStrategy =>
    typeof size === 'number' && Number.isFinite(size) && size > LARGE_FILE_BUFFER_LIMIT
        ? 'stream'
        : 'buffer';

/** Extension of a file name, including the dot, or '' when there is none. */
export const fileExtensionOf = (fileName: string): string => {
    const trimmed = (fileName ?? '').trim();
    const index = trimmed.lastIndexOf('.');
    return index > 0 && index < trimmed.length - 1 ? trimmed.slice(index) : '';
};

/**
 * Collapse an OSS object key or URL into a plain file name that is safe for the
 * save dialog: directories, query strings and separators are dropped.
 */
export const resolveDownloadName = (nameOrPath?: string, fallback = 'download'): string => {
    const withoutQuery = (nameOrPath ?? '').split(/[?#]/)[0];
    const segment = withoutQuery.split('/').filter(Boolean).pop() ?? '';
    let decoded = segment;
    try {
        decoded = decodeURIComponent(segment);
    } catch {
        // Malformed percent-encoding — keep the raw segment.
    }
    const sanitized = decoded
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/[\\:*?"<>|]/g, '_')
        .replace(/^\.+/, '')
        .trim();
    return sanitized || fallback;
};
