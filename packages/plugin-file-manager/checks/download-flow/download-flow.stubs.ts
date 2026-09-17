/**
 * Minimal compile-time stub of `@kn/common`.
 *
 * The real barrel is browser-only (React, i18n, `import.meta`), so the check
 * tsconfig maps the specifier here and the preload swaps in a runtime module.
 * Only the members the download flow consumes are declared.
 */
export const logger = {
    debug: (...args: unknown[]) => console.debug('[DEBUG]', ...args),
    info: (...args: unknown[]) => console.info('[INFO]', ...args),
    warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
    error: (...args: unknown[]) => console.error('[ERROR]', ...args),
};

export const API_BASE_URL = '/api';

export const authorizedFetch = async (url: string, init?: RequestInit): Promise<Response> =>
    fetch(url, init);

export interface FileAccessUrls {
    previewUrl: string;
    downloadUrl: string;
    expiresAt: string;
}

export interface FileDownloadProgress {
    loaded: number;
    total?: number;
}

export type FileDownloadOutcome = 'saved' | 'cancelled' | 'handed-off';

/** Shape used by `src/api/index.ts` (only its URL strings are consumed). */
export interface API {
    name?: string;
    url: string;
    method: 'POST' | 'GET' | 'DELETE' | 'PUT' | 'PATCH';
}

/** Only the members the download flow consumes. */
export interface FileService {
    getDownloadUrl: (fileName: string) => string;
    getFileBlob?: (fileId: string) => Promise<Blob>;
    getFileAccessUrls?: (fileId: string) => Promise<FileAccessUrls>;
}
