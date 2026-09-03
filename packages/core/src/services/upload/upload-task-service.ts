import {
    getAccessToken,
    getTokenContextState,
    logger,
    type UploadDestination,
    type UploadSource,
    type UploadTask,
    type UploadTaskService,
    type UploadTaskSnapshot,
} from '@kn/common';
import { UploadTaskStore, type PersistedUploadTask } from './upload-task-store';
import { uploadApi, type PartUploadTarget, type UploadCapabilities, type UploadPartRecord } from './upload-api';
import { uploadPart } from './part-transport';

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024;
const MAX_ACTIVE_FILES = 2;
const PARTS_PER_FILE = 2;
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 750;

const terminalStatuses = new Set<UploadTask['status']>(['COMPLETED', 'CANCELLED']);
const resumableStatuses = new Set<UploadTask['status']>([
    'QUEUED', 'CHECKSUMMING', 'UPLOADING', 'WAITING_FOR_NETWORK', 'FINALIZING', 'FAILED',
]);

const createId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const delay = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
    }, ms);
    const abort = () => {
        window.clearTimeout(timer);
        reject(new DOMException('Upload aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
});

const errorCode = (error: unknown): string => error instanceof Error ? error.message : 'UPLOAD_FAILED';

const currentScopeKey = (): string => {
    const token = getAccessToken();
    const contextId = getTokenContextState(token).contextId || 'no-context';
    if (!token) return `${contextId}:anonymous`;
    try {
        const encoded = token.split('.')[1];
        const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as Record<string, unknown>;
        const userId = payload.sub ?? payload.user_id ?? payload.userId ?? 'unknown-user';
        return `${contextId}:${String(userId)}`;
    } catch {
        return `${contextId}:unknown-user`;
    }
};

const sha256 = async (blob: Blob): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const fileFingerprint = async (file: File): Promise<string> => {
    const sampleSize = 64 * 1024;
    const first = await file.slice(0, Math.min(sampleSize, file.size)).arrayBuffer();
    const lastStart = Math.max(0, file.size - sampleSize);
    const last = await file.slice(lastStart, file.size).arrayBuffer();
    const metadata = new TextEncoder().encode(`${file.name}\0${file.size}\0${file.lastModified}\0${file.type}`);
    const combined = new Uint8Array(metadata.length + first.byteLength + last.byteLength);
    combined.set(metadata, 0);
    combined.set(new Uint8Array(first), metadata.length);
    combined.set(new Uint8Array(last), metadata.length + first.byteLength);
    const digest = await crypto.subtle.digest('SHA-256', combined);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export class UploadTaskServiceImpl implements UploadTaskService {
    private readonly store = new UploadTaskStore();
    private readonly tasks = new Map<string, PersistedUploadTask>();
    private readonly sources = new Map<string, File>();
    private readonly listeners = new Set<() => void>();
    private readonly activeTasks = new Set<string>();
    private readonly activeControllers = new Map<string, Set<AbortController>>();
    private readonly verifyUploadedParts = new Set<string>();
    private readonly completionWaiters = new Map<string, Array<{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }>>();
    private capabilities: UploadCapabilities | null = null;
    private snapshot: UploadTaskSnapshot = {
        tasks: [], totalBytes: 0, uploadedBytes: 0, progress: 0,
        activeCount: 0, completedCount: 0, failedCount: 0, initialized: false,
    };
    private initialized = false;
    private pumpScheduled = false;

    async initialize(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;
        try {
            const persisted = await this.store.list().catch(() => []);
            const scopeKey = currentScopeKey();
            for (const record of persisted) {
                if (record.scopeKey !== scopeKey) continue;
                const task = await this.restoreSource(record);
                this.tasks.set(task.id, task);
            }
        } catch (error) {
            logger.error('Failed to initialize upload tasks', error);
        } finally {
            this.rebuildSnapshot(true);
            this.schedulePump();
        }
    }

    async enqueue(sources: UploadSource[], destination: UploadDestination): Promise<string[]> {
        await this.initialize();
        let capabilityError: unknown;
        if (!this.capabilities) {
            try {
                this.capabilities = await uploadApi.capabilities();
            } catch (error) {
                capabilityError = error;
                logger.warn('Resumable upload capabilities are unavailable', error);
            }
        }
        const batchId = createId();
        const now = Date.now();
        const ids: string[] = [];
        for (const source of sources) {
            const id = createId();
            ids.push(id);
            this.sources.set(id, source.file);
            const maxFileSize = this.capabilities?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE;
            const invalidSize = source.file.size <= 0 || source.file.size > maxFileSize;
            const unavailable = !!capabilityError || this.capabilities?.resumableEnabled === false;
            const sourceFingerprint = invalidSize || unavailable ? undefined : await fileFingerprint(source.file);
            const task: PersistedUploadTask = {
                id,
                batchId,
                clientUploadId: id,
                scopeKey: currentScopeKey(),
                name: source.file.name,
                size: source.file.size,
                contentType: source.file.type || 'application/octet-stream',
                lastModified: source.file.lastModified,
                sourceFingerprint,
                destination,
                status: invalidSize || unavailable ? 'FAILED' : 'QUEUED',
                uploadedBytes: 0,
                confirmedBytes: 0,
                progress: 0,
                completedParts: 0,
                retryCount: 0,
                retryable: !invalidSize,
                errorCode: invalidSize ? 'FILE_TOO_LARGE' : unavailable ? 'RESUMABLE_UPLOAD_UNAVAILABLE' : undefined,
                errorMessage: invalidSize
                    ? `File exceeds the ${maxFileSize} byte limit`
                    : unavailable ? 'Resumable upload is unavailable on this server' : undefined,
                createdAt: now,
                updatedAt: now,
                handle: source.handle,
            };
            this.tasks.set(id, task);
            try {
                await this.persist(task, true);
            } catch (error) {
                this.tasks.delete(id);
                this.sources.delete(id);
                throw error;
            }
        }
        this.rebuildSnapshot();
        this.schedulePump();
        return ids;
    }

    getSnapshot(): UploadTaskSnapshot {
        return this.snapshot;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    pause(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task || terminalStatuses.has(task.status)) return;
        this.updateTask(taskId, { status: 'PAUSED', errorCode: undefined, errorMessage: undefined });
        this.abortActiveParts(taskId);
    }

    async resume(taskId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task || terminalStatuses.has(task.status)) return;
        if (!this.sources.has(taskId)) {
            const restored = await this.restoreSource(task, true);
            this.tasks.set(taskId, restored);
            if (!this.sources.has(taskId)) {
                this.rebuildSnapshot();
                return;
            }
        }
        this.updateTask(taskId, { status: 'QUEUED', retryable: true, errorCode: undefined, errorMessage: undefined });
        this.schedulePump();
    }

    async cancel(taskId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task || terminalStatuses.has(task.status) || task.status === 'FINALIZING') return;
        this.updateTask(taskId, { status: 'CANCELLING' });
        this.abortActiveParts(taskId);
        try {
            if (task.sessionId) await uploadApi.abort(task.sessionId);
            this.updateTask(taskId, { status: 'CANCELLED', retryable: false });
            this.sources.delete(taskId);
            this.rejectWaiters(taskId, new Error('UPLOAD_CANCELLED'));
        } catch (error) {
            this.updateTask(taskId, {
                status: 'CANCELLING',
                errorCode: errorCode(error),
                errorMessage: error instanceof Error ? error.message : String(error),
                retryable: true,
            });
            this.rejectWaiters(taskId, error);
            if (navigator.onLine) window.setTimeout(() => { void this.cancel(taskId); }, 5000);
        }
    }

    async retry(taskId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task || !task.retryable) return;
        await this.resume(taskId);
    }

    async reselect(taskId: string, source: UploadSource): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) return;
        if (source.file.size !== task.size || source.file.name !== task.name) {
            throw new Error('UPLOAD_SOURCE_MISMATCH');
        }
        const fingerprint = await fileFingerprint(source.file);
        if (task.sourceFingerprint && fingerprint !== task.sourceFingerprint) {
            throw new Error('UPLOAD_SOURCE_MISMATCH');
        }
        this.sources.set(taskId, source.file);
        this.verifyUploadedParts.add(taskId);
        this.updateTask(taskId, {
            handle: source.handle,
            lastModified: source.file.lastModified,
            sourceFingerprint: task.sourceFingerprint || fingerprint,
            status: 'QUEUED',
        });
        this.schedulePump();
    }

    clear(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task || (!terminalStatuses.has(task.status) && !(task.status === 'FAILED' && !task.retryable))) return;
        this.tasks.delete(taskId);
        this.sources.delete(taskId);
        void this.store.remove(taskId).catch((error) => logger.warn('Failed to clear upload task', error));
        this.rebuildSnapshot();
    }

    clearTerminal(): void {
        const taskIds = [...this.tasks.values()]
            .filter((task) => terminalStatuses.has(task.status) || (task.status === 'FAILED' && !task.retryable))
            .map((task) => task.id);
        if (taskIds.length === 0) return;

        for (const taskId of taskIds) {
            this.tasks.delete(taskId);
            this.sources.delete(taskId);
            void this.store.remove(taskId).catch((error) => logger.warn('Failed to clear upload task', error));
        }
        this.rebuildSnapshot();
    }

    waitForCompletion(taskId: string): Promise<unknown> {
        const task = this.tasks.get(taskId);
        if (!task) return Promise.reject(new Error('UPLOAD_TASK_NOT_FOUND'));
        if (task.status === 'COMPLETED') return Promise.resolve(task.result);
        if (task.status === 'CANCELLED' || task.status === 'FAILED') {
            return Promise.reject(new Error(task.errorCode || task.status));
        }
        return new Promise((resolve, reject) => {
            const waiters = this.completionWaiters.get(taskId) ?? [];
            waiters.push({ resolve, reject });
            this.completionWaiters.set(taskId, waiters);
        });
    }

    private async restoreSource(task: PersistedUploadTask, requestPermission = false): Promise<PersistedUploadTask> {
        if (terminalStatuses.has(task.status) || task.status === 'CANCELLING'
                || (task.status === 'FAILED' && !task.retryable)) return task;
        if (!task.handle) return { ...task, status: 'NEEDS_RESELECT', uploadedBytes: task.confirmedBytes };
        try {
            let permission = task.handle.queryPermission ? await task.handle.queryPermission({ mode: 'read' }) : 'prompt';
            if (permission !== 'granted' && requestPermission && task.handle.requestPermission) {
                permission = await task.handle.requestPermission({ mode: 'read' });
            }
            if (permission !== 'granted') return { ...task, status: 'NEEDS_PERMISSION', uploadedBytes: task.confirmedBytes };
            const file = await task.handle.getFile();
            if (file.name !== task.name || file.size !== task.size) {
                return { ...task, status: 'NEEDS_RESELECT', errorCode: 'UPLOAD_SOURCE_MISMATCH' };
            }
            if (task.sourceFingerprint && await fileFingerprint(file) !== task.sourceFingerprint) {
                return { ...task, status: 'NEEDS_RESELECT', errorCode: 'UPLOAD_SOURCE_MISMATCH' };
            }
            this.sources.set(task.id, file);
            if (task.sessionId) this.verifyUploadedParts.add(task.id);
            return { ...task, status: resumableStatuses.has(task.status) ? 'QUEUED' : task.status };
        } catch {
            return { ...task, status: 'NEEDS_RESELECT' };
        }
    }

    private schedulePump(): void {
        if (this.pumpScheduled) return;
        this.pumpScheduled = true;
        queueMicrotask(() => {
            this.pumpScheduled = false;
            void this.pump();
        });
    }

    private async pump(): Promise<void> {
        if (!this.initialized || !navigator.onLine) return;
        const available = Math.max(0, MAX_ACTIVE_FILES - this.activeTasks.size);
        if (available === 0) return;
        const queued = [...this.tasks.values()]
            .filter((task) => task.status === 'QUEUED' && this.sources.has(task.id))
            .slice(0, available);
        for (const task of queued) {
            this.activeTasks.add(task.id);
            void this.runTaskWithLock(task.id).then((acquired) => {
                this.activeTasks.delete(task.id);
                if (acquired) this.schedulePump();
                else window.setTimeout(() => this.schedulePump(), 1000);
            });
        }
    }

    private async runTaskWithLock(taskId: string): Promise<boolean> {
        if (!navigator.locks) {
            await this.runTask(taskId);
            return true;
        }
        return navigator.locks.request(`kn-upload-task:${taskId}`, { ifAvailable: true }, async (lock) => {
            if (!lock) return false;
            await this.runTask(taskId);
            return true;
        });
    }

    private async runTask(taskId: string): Promise<void> {
        const source = this.sources.get(taskId);
        let task = this.tasks.get(taskId);
        if (!source || !task || task.status !== 'QUEUED') return;
        try {
            if (!this.capabilities) this.capabilities = await uploadApi.capabilities();
            let session = task.sessionId ? await uploadApi.reconcile(task.sessionId) : null;
            if (!session) {
                session = await uploadApi.createSession({
                    clientUploadId: task.clientUploadId || task.id,
                    originalName: task.name,
                    sizeBytes: task.size,
                    contentType: task.contentType,
                    lastModified: task.lastModified,
                    parentId: task.destination.parentId,
                    repositoryKey: task.destination.repositoryKey,
                });
            }
            const latest = this.tasks.get(taskId);
            if (!latest) return;
            if (latest.status === 'CANCELLED' || latest.status === 'CANCELLING') {
                await uploadApi.abort(session.sessionId).catch(() => undefined);
                this.updateTask(taskId, { status: 'CANCELLED', sessionId: session.sessionId, retryable: false });
                return;
            }
            if (latest.status === 'PAUSED') {
                this.updateTask(taskId, { sessionId: session.sessionId });
                return;
            }
            if (latest.status !== 'QUEUED' && latest.status !== 'UPLOADING') return;
            if (session.status === 'ABORTED') {
                this.updateTask(taskId, { status: 'CANCELLED', retryable: false });
                this.rejectWaiters(taskId, new Error('UPLOAD_CANCELLED'));
                return;
            }
            if (session.status === 'EXPIRED') {
                this.updateTask(taskId, {
                    clientUploadId: createId(),
                    sessionId: undefined,
                    status: 'FAILED',
                    retryable: true,
                    errorCode: 'UPLOAD_SESSION_EXPIRED',
                    errorMessage: 'The upload session expired. Retry to start a new session.',
                });
                this.rejectWaiters(taskId, new Error('UPLOAD_SESSION_EXPIRED'));
                return;
            }
            if (session.status === 'COMPLETED') {
                this.updateTask(taskId, {
                    status: 'COMPLETED', confirmedBytes: task.size, uploadedBytes: task.size,
                    completedParts: session.partCount, progress: 100, retryable: false,
                    result: session.completedFile ?? session,
                });
                this.resolveWaiters(taskId, session.completedFile ?? session);
                return;
            }
            if (session.status === 'FAILED' && !session.retryable) {
                this.updateTask(taskId, {
                    status: 'FAILED', retryable: false,
                    errorCode: session.failureCode || 'UPLOAD_FAILED',
                    errorMessage: session.failureMessage,
                });
                this.rejectWaiters(taskId, new Error(session.failureCode || 'UPLOAD_FAILED'));
                return;
            }

            const completed = new Map((session.uploadedParts ?? []).map((part) => [part.partNumber, part]));
            if (this.verifyUploadedParts.has(taskId)) {
                this.updateTask(taskId, { status: 'CHECKSUMMING' });
                for (const part of completed.values()) {
                    if (this.tasks.get(taskId)?.status !== 'CHECKSUMMING') return;
                    if (!part.checksum || part.checksumAlgorithm !== 'SHA-256') continue;
                    const start = (part.partNumber - 1) * session.partSizeBytes;
                    const localChecksum = await sha256(source.slice(start, Math.min(source.size, start + part.sizeBytes)));
                    if (localChecksum !== part.checksum) {
                        this.updateTask(taskId, {
                            status: 'NEEDS_RESELECT',
                            retryable: true,
                            errorCode: 'UPLOAD_SOURCE_MISMATCH',
                            errorMessage: 'The selected file no longer matches the uploaded parts.',
                        });
                        this.rejectWaiters(taskId, new Error('UPLOAD_SOURCE_MISMATCH'));
                        return;
                    }
                }
                if (this.tasks.get(taskId)?.status !== 'CHECKSUMMING') return;
                this.verifyUploadedParts.delete(taskId);
            }
            this.updateTask(taskId, {
                sessionId: session.sessionId,
                partSize: session.partSizeBytes,
                partCount: session.partCount,
                confirmedBytes: session.confirmedBytes ?? [...completed.values()].reduce((sum, part) => sum + part.sizeBytes, 0),
                completedParts: completed.size,
                status: 'UPLOADING',
            });

            const missing: number[] = [];
            for (let partNumber = 1; partNumber <= session.partCount; partNumber += 1) {
                if (!completed.has(partNumber)) missing.push(partNumber);
            }
            const parallelParts = Math.max(1, Math.min(PARTS_PER_FILE, session.maxParallelParts || 1));
            for (let index = 0; index < missing.length; index += parallelParts) {
                if (this.tasks.get(taskId)?.status !== 'UPLOADING') return;
                const group = missing.slice(index, index + parallelParts);
                try {
                    const uploaded = await Promise.all(group.map((partNumber) => this.uploadOnePart(
                        taskId, source, session!, partNumber,
                    )));
                    uploaded.forEach((part) => completed.set(part.partNumber, part));
                } catch (error) {
                    this.abortActiveParts(taskId);
                    throw error;
                }
            }

            if (this.tasks.get(taskId)?.status !== 'UPLOADING') return;
            this.updateTask(taskId, { status: 'FINALIZING', uploadedBytes: task.size, progress: 100 });
            const result = await uploadApi.complete(session.sessionId);
            this.updateTask(taskId, {
                status: 'COMPLETED',
                confirmedBytes: task.size,
                uploadedBytes: task.size,
                completedParts: session.partCount,
                progress: 100,
                retryable: false,
                result: result.completedFile ?? result,
            });
            this.sources.delete(taskId);
            this.resolveWaiters(taskId, result.completedFile ?? result);
        } catch (error) {
            const current = this.tasks.get(taskId);
            if (!current || current.status === 'PAUSED' || current.status === 'CANCELLING' || current.status === 'CANCELLED') return;
            const offline = typeof navigator !== 'undefined' && !navigator.onLine;
            const responseStatus = (error as { status?: number; response?: { status?: number } })?.status
                ?? (error as { response?: { status?: number } })?.response?.status;
            const message = error instanceof Error ? error.message : String(error);
            const deadSession = responseStatus === 404 || responseStatus === 410
                || /upload session (has expired|not found|is not active)/i.test(message);
            this.updateTask(taskId, {
                clientUploadId: deadSession ? createId() : current.clientUploadId,
                sessionId: deadSession ? undefined : current.sessionId,
                status: offline ? 'WAITING_FOR_NETWORK' : 'FAILED',
                errorCode: deadSession ? 'UPLOAD_SESSION_EXPIRED' : errorCode(error),
                errorMessage: error instanceof Error ? error.message : String(error),
                retryable: true,
                retryCount: current.retryCount + 1,
                uploadedBytes: current.confirmedBytes,
            });
            if (!offline) this.rejectWaiters(taskId, error);
        }
    }

    private async uploadOnePart(
        taskId: string,
        file: File,
        session: { sessionId: string; partSizeBytes: number; partCount: number },
        partNumber: number,
    ): Promise<UploadPartRecord> {
        const start = (partNumber - 1) * session.partSizeBytes;
        const end = Math.min(file.size, start + session.partSizeBytes);
        const blob = file.slice(start, end);
        const checksum = await sha256(blob);
        const controller = new AbortController();
        this.addController(taskId, controller);
        try {
            let response: Awaited<ReturnType<typeof uploadPart>> | null = null;
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
                if (this.tasks.get(taskId)?.status !== 'UPLOADING') {
                    throw new DOMException('Upload interrupted', 'AbortError');
                }
                try {
                    const [target] = await uploadApi.signParts(session.sessionId, [{ partNumber }]);
                    if (!target) throw new Error('UPLOAD_TARGET_MISSING');
                    response = await uploadPart(target as PartUploadTarget, blob, controller.signal, (loaded) => {
                        this.updateTransientProgress(taskId, partNumber, loaded);
                    });
                    break;
                } catch (error) {
                    if (error instanceof DOMException && error.name === 'AbortError') throw error;
                    if (attempt >= MAX_RETRIES || !this.isRetryablePartError(error)) throw error;
                    await delay(RETRY_BASE_MS * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5), controller.signal);
                }
            }
            if (!response) throw new Error('UPLOAD_RETRY_EXHAUSTED');

            const record: UploadPartRecord = {
                partNumber,
                sizeBytes: blob.size,
                etag: response.etag,
                providerChecksum: response.checksum,
                checksumAlgorithm: 'SHA-256',
                checksum,
            };
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
                try {
                    await uploadApi.acknowledgePart(session.sessionId, record);
                    this.confirmPart(taskId, partNumber, blob.size);
                    return record;
                } catch (error) {
                    if (attempt >= MAX_RETRIES || !this.isRetryablePartError(error)) throw error;
                    await delay(RETRY_BASE_MS * 2 ** (attempt - 1), controller.signal);
                }
            }
            throw new Error('UPLOAD_ACK_RETRY_EXHAUSTED');
        } finally {
            this.removeController(taskId, controller);
            this.updateTransientProgress(taskId, partNumber, 0);
        }
    }

    private isRetryablePartError(error: unknown): boolean {
        const status = (error as { status?: number })?.status;
        return status === undefined || status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
    }

    private transientProgress = new Map<string, Map<number, number>>();
    private lastProgressPublish = new Map<string, number>();

    private updateTransientProgress(taskId: string, partNumber: number, loaded: number): void {
        const task = this.tasks.get(taskId);
        if (!task) return;
        const parts = this.transientProgress.get(taskId) ?? new Map<number, number>();
        if (loaded > 0) parts.set(partNumber, loaded);
        else parts.delete(partNumber);
        this.transientProgress.set(taskId, parts);
        const now = performance.now();
        const lastPublish = this.lastProgressPublish.get(taskId) ?? 0;
        if (loaded > 0 && now - lastPublish < 100) return;
        this.lastProgressPublish.set(taskId, now);
        const transientBytes = [...parts.values()].reduce((sum, value) => sum + value, 0);
        const uploadedBytes = Math.min(task.size, task.confirmedBytes + transientBytes);
        this.updateTask(taskId, {
            uploadedBytes,
            progress: task.size > 0 ? Math.round(uploadedBytes / task.size * 10_000) / 100 : 0,
        }, false);
    }

    private confirmPart(taskId: string, partNumber: number, size: number): void {
        const task = this.tasks.get(taskId);
        if (!task) return;
        const transient = this.transientProgress.get(taskId);
        transient?.delete(partNumber);
        const transientBytes = transient ? [...transient.values()].reduce((sum, value) => sum + value, 0) : 0;
        const confirmedBytes = Math.min(task.size, task.confirmedBytes + size);
        const uploadedBytes = Math.min(task.size, confirmedBytes + transientBytes);
        this.updateTask(taskId, {
            confirmedBytes,
            uploadedBytes,
            completedParts: task.completedParts + 1,
            progress: task.size > 0 ? Math.round(uploadedBytes / task.size * 10_000) / 100 : 100,
        });
    }

    private addController(taskId: string, controller: AbortController): void {
        const controllers = this.activeControllers.get(taskId) ?? new Set<AbortController>();
        controllers.add(controller);
        this.activeControllers.set(taskId, controllers);
    }

    private removeController(taskId: string, controller: AbortController): void {
        const controllers = this.activeControllers.get(taskId);
        controllers?.delete(controller);
        if (controllers?.size === 0) this.activeControllers.delete(taskId);
    }

    private abortActiveParts(taskId: string): void {
        this.activeControllers.get(taskId)?.forEach((controller) => controller.abort());
        this.activeControllers.delete(taskId);
        this.transientProgress.delete(taskId);
        const task = this.tasks.get(taskId);
        if (task) {
            this.updateTask(taskId, {
                uploadedBytes: task.confirmedBytes,
                progress: task.size > 0 ? Math.round(task.confirmedBytes / task.size * 10_000) / 100 : 0,
            });
        }
    }

    private updateTask(taskId: string, patch: Partial<PersistedUploadTask>, persist = true): void {
        const current = this.tasks.get(taskId);
        if (!current) return;
        const next = { ...current, ...patch, updatedAt: Date.now() };
        this.tasks.set(taskId, next);
        if (persist) void this.persist(next);
        this.rebuildSnapshot();
    }

    private async persist(task: PersistedUploadTask, strict = false): Promise<void> {
        try {
            await this.store.put(task);
        } catch (error) {
            logger.warn('Failed to persist upload task', { taskId: task.id, error });
            if (strict) throw error;
        }
    }

    private rebuildSnapshot(initialized = this.snapshot.initialized): void {
        const tasks = [...this.tasks.values()].sort((left, right) => left.createdAt - right.createdAt);
        const measurable = tasks.filter((task) => task.status !== 'CANCELLED');
        const totalBytes = measurable.reduce((sum, task) => sum + task.size, 0);
        const uploadedBytes = measurable.reduce((sum, task) => sum + Math.min(task.uploadedBytes, task.size), 0);
        this.snapshot = {
            tasks,
            totalBytes,
            uploadedBytes,
            progress: totalBytes > 0 ? Math.round(uploadedBytes / totalBytes * 10_000) / 100 : 0,
            activeCount: tasks.filter((task) => ['CHECKSUMMING', 'UPLOADING', 'FINALIZING', 'CANCELLING'].includes(task.status)).length,
            completedCount: tasks.filter((task) => task.status === 'COMPLETED').length,
            failedCount: tasks.filter((task) => task.status === 'FAILED').length,
            initialized,
        };
        this.listeners.forEach((listener) => listener());
    }

    private resolveWaiters(taskId: string, value: unknown): void {
        this.completionWaiters.get(taskId)?.forEach((waiter) => waiter.resolve(value));
        this.completionWaiters.delete(taskId);
    }

    private rejectWaiters(taskId: string, reason: unknown): void {
        this.completionWaiters.get(taskId)?.forEach((waiter) => waiter.reject(reason));
        this.completionWaiters.delete(taskId);
    }
}

export const uploadTaskService = new UploadTaskServiceImpl();
