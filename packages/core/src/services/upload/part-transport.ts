import type { PartUploadTarget } from './upload-api';

export interface UploadedPartResponse {
    etag: string;
    checksum?: string;
}

const NO_PROGRESS_TIMEOUT_MS = 90_000;

export const uploadPart = (
    target: PartUploadTarget,
    blob: Blob,
    signal: AbortSignal,
    onProgress: (loaded: number) => void,
): Promise<UploadedPartResponse> => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let watchdog: number | null = null;
    let settled = false;
    let timedOut = false;

    const cleanup = () => {
        signal.removeEventListener('abort', abort);
        if (watchdog !== null) window.clearTimeout(watchdog);
    };
    const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
    };
    const armWatchdog = () => {
        if (watchdog !== null) window.clearTimeout(watchdog);
        watchdog = window.setTimeout(() => {
            timedOut = true;
            xhr.abort();
        }, NO_PROGRESS_TIMEOUT_MS);
    };
    const abort = () => xhr.abort();

    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
        finish(() => reject(new DOMException('Upload aborted', 'AbortError')));
        return;
    }

    xhr.open(target.method || 'PUT', target.url, true);
    Object.entries(target.headers ?? {}).forEach(([name, value]) => {
        const normalized = name.toLowerCase();
        if (normalized === 'host' || normalized === 'content-length') return;
        xhr.setRequestHeader(name, value);
    });
    xhr.upload.onprogress = (event) => {
        armWatchdog();
        onProgress(Math.min(event.loaded, blob.size));
    };
    xhr.onerror = () => finish(() => reject(new Error('UPLOAD_NETWORK_ERROR')));
    xhr.onabort = () => finish(() => reject(timedOut
        ? new Error('UPLOAD_NO_PROGRESS_TIMEOUT')
        : new DOMException('Upload aborted', 'AbortError')));
    xhr.onload = () => finish(() => {
        if (xhr.status < 200 || xhr.status >= 300) {
            const error = new Error(`UPLOAD_HTTP_${xhr.status}`);
            Object.assign(error, { status: xhr.status });
            reject(error);
            return;
        }
        const etagHeader = target.etagResponseHeader || 'ETag';
        const etag = xhr.getResponseHeader(etagHeader);
        if (!etag) {
            reject(new Error('UPLOAD_ETAG_MISSING'));
            return;
        }
        resolve({
            etag,
            checksum: target.checksumResponseHeader
                ? xhr.getResponseHeader(target.checksumResponseHeader) ?? undefined
                : undefined,
        });
    });

    armWatchdog();
    xhr.send(blob);
});
