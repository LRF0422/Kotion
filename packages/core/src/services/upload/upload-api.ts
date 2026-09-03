import { request } from '@kn/common';

const BASE_URL = '/knowledge-file-center/file';

interface ApiEnvelope<T> {
    code?: number;
    msg?: string;
    data: T;
}

interface ControlRequest {
    url: string;
    method: 'GET' | 'POST' | 'PUT';
    data?: unknown;
}

interface BackendUploadCapabilities {
    provider: string;
    maxFileSizeBytes: number;
    defaultPartSizeBytes: number;
    maxParallelParts: number;
    targetExpirySeconds: number;
}

interface BackendUploadPart {
    partNumber: number;
    sizeBytes: number;
    status: string;
    etag?: string;
    providerChecksum?: string;
    checksumAlgorithm?: string;
    checksum?: string;
}

interface BackendUploadSession {
    id: number | string;
    status: string;
    partSize: number;
    partCount: number;
    confirmedBytes: number;
    retryable: boolean;
    failureCode?: string;
    failureMessage?: string;
    expiresAt?: string;
    parts?: BackendUploadPart[];
    completedFile?: unknown;
}

export interface UploadCapabilities {
    maxFileSizeBytes: number;
    recommendedPartSizeBytes: number;
    maxParallelParts: number;
    signedTargetTtlSeconds: number;
    resumableEnabled: boolean;
    legacyUploadLimitBytes: number;
    provider: string;
}

export interface UploadPartRecord {
    partNumber: number;
    sizeBytes: number;
    etag?: string;
    providerChecksum?: string;
    checksumAlgorithm?: string;
    checksum?: string;
}

export interface UploadSessionRecord {
    sessionId: string;
    status: string;
    partSizeBytes: number;
    partCount: number;
    maxParallelParts: number;
    confirmedBytes: number;
    uploadedParts: UploadPartRecord[];
    retryable: boolean;
    failureCode?: string;
    failureMessage?: string;
    expiresAt?: string;
    completedFile?: unknown;
}

export interface PartUploadTarget {
    partNumber: number;
    method: string;
    url: string;
    headers?: Record<string, string>;
    expiresAt?: string;
    etagResponseHeader?: string;
    checksumResponseHeader?: string;
}

const data = async <T>({ url, method, data: body }: ControlRequest): Promise<T> => {
    const envelope = await request({ url, method, data: body }) as unknown as ApiEnvelope<T>;
    return envelope.data;
};

let maxParallelParts = 4;

const normalizeSession = (session: BackendUploadSession): UploadSessionRecord => ({
    sessionId: String(session.id),
    status: session.status,
    partSizeBytes: Number(session.partSize),
    partCount: Number(session.partCount),
    maxParallelParts,
    confirmedBytes: Number(session.confirmedBytes),
    uploadedParts: (session.parts ?? [])
        .filter((part) => part.status === 'COMPLETED')
        .map((part) => ({
            partNumber: Number(part.partNumber),
            sizeBytes: Number(part.sizeBytes),
            etag: part.etag,
            providerChecksum: part.providerChecksum,
            checksumAlgorithm: part.checksumAlgorithm,
            checksum: part.checksum,
        })),
    retryable: session.retryable,
    failureCode: session.failureCode,
    failureMessage: session.failureMessage,
    expiresAt: session.expiresAt,
    completedFile: session.completedFile,
});

export const uploadApi = {
    capabilities: async (): Promise<UploadCapabilities> => {
        const capabilities = await data<BackendUploadCapabilities>({
            url: `${BASE_URL}/upload-capabilities`,
            method: 'GET',
        });
        maxParallelParts = Number(capabilities.maxParallelParts);
        return {
            maxFileSizeBytes: Number(capabilities.maxFileSizeBytes),
            recommendedPartSizeBytes: Number(capabilities.defaultPartSizeBytes),
            maxParallelParts,
            signedTargetTtlSeconds: Number(capabilities.targetExpirySeconds),
            resumableEnabled: true,
            legacyUploadLimitBytes: 64 * 1024 * 1024,
            provider: capabilities.provider,
        };
    },

    createSession: async (payload: {
        clientUploadId: string;
        originalName: string;
        sizeBytes: number;
        contentType: string;
        lastModified: number;
        parentId: string;
        repositoryKey?: string;
    }): Promise<UploadSessionRecord> => normalizeSession(await data<BackendUploadSession>({
        url: `${BASE_URL}/upload-sessions`,
        method: 'POST',
        data: {
            clientUuid: payload.clientUploadId,
            originalName: payload.originalName,
            expectedSize: payload.sizeBytes,
            contentType: payload.contentType,
            parentId: payload.parentId,
            repositoryKey: payload.repositoryKey,
        },
    })),

    getSession: async (sessionId: string): Promise<UploadSessionRecord> => normalizeSession(await data<BackendUploadSession>({
        url: `${BASE_URL}/upload-sessions/${encodeURIComponent(sessionId)}`,
        method: 'GET',
    })),

    listActiveSessions: async (): Promise<UploadSessionRecord[]> => (await data<BackendUploadSession[]>({
        url: `${BASE_URL}/upload-sessions`,
        method: 'GET',
    })).map(normalizeSession),

    signParts: async (sessionId: string, parts: Array<{ partNumber: number }>): Promise<PartUploadTarget[]> =>
        (await data<PartUploadTarget[]>({
            url: `${BASE_URL}/upload-sessions/${encodeURIComponent(sessionId)}/parts/sign`,
            method: 'POST',
            data: { partNumbers: parts.map((part) => part.partNumber) },
        })).map((target) => ({ ...target, partNumber: Number(target.partNumber) })),

    acknowledgePart: (sessionId: string, part: UploadPartRecord): Promise<BackendUploadPart> => data({
        url: `${BASE_URL}/upload-sessions/${encodeURIComponent(sessionId)}/parts/${part.partNumber}`,
        method: 'PUT',
        data: {
            sizeBytes: part.sizeBytes,
            etag: part.etag,
            providerChecksum: part.providerChecksum,
            checksumAlgorithm: part.checksumAlgorithm,
            checksum: part.checksum,
        },
    }),

    reconcile: async (sessionId: string): Promise<UploadSessionRecord> => normalizeSession(await data<BackendUploadSession>({
        url: `${BASE_URL}/upload-sessions/${encodeURIComponent(sessionId)}/reconcile`,
        method: 'POST',
    })),

    complete: async (sessionId: string): Promise<UploadSessionRecord> => normalizeSession(await data<BackendUploadSession>({
        url: `${BASE_URL}/upload-sessions/${encodeURIComponent(sessionId)}/complete`,
        method: 'POST',
        data: {},
    })),

    abort: async (sessionId: string): Promise<UploadSessionRecord> => normalizeSession(await data<BackendUploadSession>({
        url: `${BASE_URL}/upload-sessions/${encodeURIComponent(sessionId)}/abort`,
        method: 'POST',
        data: {},
    })),
};
