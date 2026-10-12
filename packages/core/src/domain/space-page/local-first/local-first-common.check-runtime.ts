/**
 * Runtime stand-in for the `@kn/common` slice the local-first check needs.
 *
 * The real package entry point pulls in React, i18n and the HTTP layer, so the
 * check compiles against a stub (exactly like `check:space-page` does). Every
 * function below mirrors the real implementation in
 * `packages/common/src/domain/space-page/local-store.ts` and
 * `.../change-stream.ts`; the desktop-side store check covers the SQL half of
 * the same contract.
 */

export type LocalStoreErrorCode = string;

export class LocalStoreError extends Error {
    readonly code: LocalStoreErrorCode;

    constructor(code: LocalStoreErrorCode, message: string) {
        super(message);
        this.name = "LocalStoreError";
        this.code = code;
    }
}

export const createSpacePageChangeStream = (): {
    emit: (type: string, payload: unknown, options?: object) => void;
    publish: (change: unknown) => void;
    subscribe: {
        (type: string, listener: (change: unknown) => void): () => void;
        (listener: (change: unknown) => void): () => void;
    };
} => {
    const all = new Set<(change: any) => void>();
    const typed = new Map<string, Set<(change: any) => void>>();
    const publish = (change: any): void => {
        const normalized = { ...change, timestamp: change.timestamp ?? Date.now() };
        all.forEach((listener) => listener(normalized));
        typed.get(change.type)?.forEach((listener) => listener(normalized));
    };
    const subscribe: any = (typeOrListener: any, listener?: any) => {
        if (typeof typeOrListener === "function") {
            all.add(typeOrListener);
            return () => all.delete(typeOrListener);
        }
        const listeners = typed.get(typeOrListener) ?? new Set();
        listeners.add(listener);
        typed.set(typeOrListener, listeners);
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) typed.delete(typeOrListener);
        };
    };
    return {
        emit: (type: string, payload: unknown, options?: object) => publish({ type, payload, ...options }),
        publish,
        subscribe,
    };
};

/** Mirrors `toLocalDocumentRecord`. */
export const toLocalDocumentRecord = (
    pageId: string,
    document: { doc?: unknown; content?: unknown; rev?: unknown; metadata?: unknown },
    meta: Record<string, unknown> = {},
): Record<string, unknown> => ({
    pageId,
    ...(document.doc === undefined ? {} : { doc: document.doc }),
    ...(document.content === undefined ? {} : { content: document.content }),
    rev: document.rev ?? null,
    ...(document.metadata ? { metadata: document.metadata } : {}),
    ...meta,
});

/** Mirrors `fromLocalDocumentRecord`. */
export const fromLocalDocumentRecord = (record: Record<string, unknown>): Record<string, unknown> => ({
    pageId: record.pageId,
    doc: record.doc ?? record.content ?? null,
    ...(record.content === undefined ? {} : { content: record.content }),
    rev: record.rev ?? null,
    ...(record.metadata ? { metadata: record.metadata } : {}),
});

/** The sync engine only starts when there is a session; the check controls it. */
export const getAccessToken = (): string | null => "check-token";
