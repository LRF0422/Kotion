import {
    API_BASE_URL,
    authorizedFetch,
    logger,
    type FileDownloadOutcome,
    type FileDownloadProgress,
    type FileService,
} from '@kn/common';
import { APIS } from '../api';
import {
    chooseDownloadStrategy,
    fileExtensionOf,
    resolveDownloadName,
    type DownloadTarget,
} from './download-target';

/**
 * Downloading must never navigate the app to raw storage bytes: the OSS
 * `/oss/endpoint/download` endpoint returns the object without a
 * `Content-Disposition` header, so opening its URL in a tab renders the
 * payload as garbled text instead of saving it.
 *
 * The primary strategy therefore asks for the destination **first** — while the
 * click's user activation is still valid, otherwise Chrome refuses to open the
 * save dialog — and then streams the response straight into the chosen file.
 * That keeps the dialog, shows progress, and never buffers the payload (so a
 * large file can no longer hit the API request timeout). Browsers without the
 * File System Access API fall back to a signed `attachment` URL, and only as a
 * last resort to buffering the bytes and saving through an anchor.
 */

export interface DownloadOptions {
    /** Called as bytes arrive (throttled to whole percentages when the size is known). */
    onProgress?: (progress: FileDownloadProgress) => void;
}

export type DownloadOutcome = FileDownloadOutcome;

/** Minimal typing for the Chromium save picker (absent from lib.dom). */
interface FileWritableStream extends WritableStream<Uint8Array> {
    write: (data: Blob | BufferSource | string) => Promise<void>;
    close: () => Promise<void>;
    abort: (reason?: unknown) => Promise<void>;
}

interface SaveFileHandle {
    createWritable: () => Promise<FileWritableStream>;
}

type SaveFilePicker = (options: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<SaveFileHandle>;

const isAbortError = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';

/** Resolve the Chromium save picker, if this browser/environment has one. */
const getSaveFilePicker = (): SaveFilePicker | undefined => {
    if (typeof window === 'undefined') return undefined;
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
    // Detached File System Access methods throw "Illegal invocation".
    return typeof picker === 'function' ? picker.bind(window) : undefined;
};

/** Extract the API error message from a `{ code, msg }` envelope, if it is one. */
const readJsonErrorMessage = (text: string): string | null => {
    try {
        const parsed = JSON.parse(text) as { code?: unknown; msg?: unknown; message?: unknown };
        const code = typeof parsed?.code === 'number' ? parsed.code : undefined;
        const message = typeof parsed?.msg === 'string' ? parsed.msg : parsed?.message;
        // A real JSON file that merely carries a `code` field must still save.
        if (code !== undefined && code >= 400 && typeof message === 'string' && message) return message;
    } catch {
        // Not JSON after all.
    }
    return null;
};

/**
 * Reject a response that is really a small JSON error envelope. Larger bodies
 * and non-JSON content types are passed through untouched.
 */
const sanitizeResponse = async (response: Response): Promise<Response> => {
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes('json')) return response;
    const length = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(length) && length > 64 * 1024) return response;

    const text = await response.text();
    const message = readJsonErrorMessage(text);
    if (message) throw new Error(message);
    return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
    });
};

/**
 * Open the file bytes as a stream: the authenticated file-center API first
 * (same paths as `FileService.getFileBlob`, but with no request timeout and no
 * buffering), then the raw storage URL.
 */
const openDownloadResponse = async (fileService: FileService, target: DownloadTarget): Promise<Response> => {
    const sources: Array<() => Promise<Response>> = [];

    if (target.id) {
        const path = APIS.DOWNLOAD_FILE.url.replace(':fileId', encodeURIComponent(target.id));
        sources.push(() => authorizedFetch(`${API_BASE_URL}${path}`));
    }
    if (target.path) {
        const url = fileService.getDownloadUrl(target.path);
        sources.push(() => fetch(url, { credentials: 'omit' }));
    }

    let lastError: unknown;
    let serverError: unknown;
    for (const open of sources) {
        try {
            const response = await open();
            if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);
            try {
                return await sanitizeResponse(response);
            } catch (error) {
                // A JSON envelope carries the API's own message — keep it over raw network errors.
                serverError = error;
                throw error;
            }
        } catch (error) {
            lastError = error;
        }
    }
    throw serverError ?? lastError ?? new Error('Download failed');
};

/** Throttle progress to whole percentages (or ~1MB steps when the size is unknown). */
const createProgressReporter = (onProgress?: (progress: FileDownloadProgress) => void) => {
    let lastPercent = -1;
    let lastLoaded = 0;
    return (loaded: number, total?: number) => {
        if (!onProgress) return;
        if (total && total > 0) {
            const percent = Math.min(100, Math.floor((loaded / total) * 100));
            if (percent === lastPercent) return;
            lastPercent = percent;
        } else if (loaded - lastLoaded < 1024 * 1024) {
            return;
        }
        lastLoaded = loaded;
        onProgress({ loaded, total });
    };
};

const resolveTotal = (response: Response, size?: number): number | undefined => {
    const header = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(header) && header > 0) return header;
    return size && size > 0 ? size : undefined;
};

/** Read a whole response into memory, reporting byte progress. */
const readResponseBlob = async (
    response: Response,
    onProgress?: (progress: FileDownloadProgress) => void,
): Promise<Blob> => {
    if (!response.body) return response.blob();

    const total = resolveTotal(response);
    const report = createProgressReporter(onProgress);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        loaded += value.byteLength;
        report(loaded, total);
    }
    return new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') ?? '' });
};

/** Stream a response into an already-chosen file, aborting it if the transfer fails. */
const streamResponseToHandle = async (
    response: Response,
    handle: SaveFileHandle,
    total: number | undefined,
    onProgress?: (progress: FileDownloadProgress) => void,
): Promise<void> => {
    const writable = await handle.createWritable();
    const report = createProgressReporter(onProgress);
    try {
        if (!response.body) {
            await writable.write(await response.blob());
            await writable.close();
            return;
        }
        if (typeof TransformStream === 'undefined') {
            await writable.write(await readResponseBlob(response, onProgress));
            await writable.close();
            return;
        }
        // `pipeTo` closes the destination, so no explicit close() here.
        let loaded = 0;
        const counter = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                loaded += chunk.byteLength;
                report(loaded, total);
                controller.enqueue(chunk);
            },
        });
        await response.body.pipeThrough(counter).pipeTo(writable);
    } catch (error) {
        // Discard the partial file instead of leaving it on disk.
        await writable.abort(error).catch(() => undefined);
        throw error;
    }
};

/** Save a Blob through an anchor click; used when no save picker is available. */
const saveBlobAsFile = async (blob: Blob, fileName: string): Promise<void> => {
    const objectUrl = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    }
};

/**
 * Short-lived storage URL that already carries an `attachment` disposition, so
 * the browser downloads it instead of rendering raw bytes in a tab.
 */
const resolveStreamUrl = async (fileService: FileService, target: DownloadTarget): Promise<string> => {
    if (!target.id || !fileService.getFileAccessUrls) return '';
    try {
        const access = await fileService.getFileAccessUrls(target.id);
        return access?.downloadUrl || '';
    } catch (error) {
        logger.warn('[file-manager] signed download URL unavailable', error);
        return '';
    }
};

/**
 * Hand the transfer to the browser through a URL that carries an `attachment`
 * disposition. Returns false when the popup was blocked (programmatic
 * downloads have no user gesture), so callers can fall back to buffering.
 */
const openAttachmentUrl = (url: string): boolean => {
    const opened = window.open(url, '_blank');
    if (!opened) return false;
    try {
        // Legacy `noopener`: `window.open(..., 'noopener')` would return null and
        // hide a blocked popup.
        opened.opener = null;
    } catch {
        // Cross-origin target — nothing to sever.
    }
    return true;
};

/** Browsers without a save picker: hand large transfers to the browser, buffer the rest. */
const fallbackDownload = async (
    fileService: FileService,
    target: DownloadTarget,
    fileName: string,
    options: DownloadOptions,
): Promise<DownloadOutcome> => {
    if (chooseDownloadStrategy(target.size) === 'stream') {
        const streamUrl = await resolveStreamUrl(fileService, target);
        if (streamUrl && openAttachmentUrl(streamUrl)) return 'handed-off';
    }

    try {
        const response = await openDownloadResponse(fileService, target);
        const blob = await readResponseBlob(response, options.onProgress);
        await saveBlobAsFile(blob, fileName);
        return 'saved';
    } catch (error) {
        const streamUrl = await resolveStreamUrl(fileService, target);
        if (!streamUrl || !openAttachmentUrl(streamUrl)) throw error;
        return 'handed-off';
    }
};

/**
 * Download one file without ever showing raw storage bytes in a tab.
 * Throws when no source could be read, so callers can surface a toast.
 */
export const downloadTarget = async (
    fileService: FileService,
    target: DownloadTarget,
    options: DownloadOptions = {},
): Promise<DownloadOutcome> => {
    const fileName = resolveDownloadName(target.name || target.path);

    const picker = getSaveFilePicker();
    if (picker) {
        let handle: SaveFileHandle | null = null;
        const extension = fileExtensionOf(fileName);
        try {
            // Must run before any other await: a network round trip would spend the
            // click's user activation and Chrome would refuse to open the dialog.
            handle = await picker({
                suggestedName: fileName,
                ...(extension
                    ? { types: [{ description: 'File', accept: { 'application/octet-stream': [extension] } }] }
                    : {}),
            });
        } catch (error) {
            if (isAbortError(error)) return 'cancelled';
            logger.warn('[file-manager] save picker unavailable, falling back', error);
        }

        if (handle) {
            let response: Response;
            try {
                response = await openDownloadResponse(fileService, target);
            } catch (error) {
                logger.warn('[file-manager] download source unavailable, falling back', error);
                return await fallbackDownload(fileService, target, fileName, options);
            }
            // A failed transfer aborts the chosen file and surfaces the error
            // instead of silently saving the same bytes somewhere else.
            await streamResponseToHandle(
                response,
                handle,
                resolveTotal(response, target.size),
                options.onProgress,
            );
            return 'saved';
        }
    }

    return await fallbackDownload(fileService, target, fileName, options);
};
