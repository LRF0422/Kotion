import type { UploadFileHandle, UploadTask } from '@kn/common';

export interface PersistedUploadTask extends UploadTask {
    handle?: UploadFileHandle;
}

const DB_NAME = 'kn-upload-tasks';
const STORE_NAME = 'tasks';
const DB_VERSION = 1;

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
});

export class UploadTaskStore {
    private dbPromise: Promise<IDBDatabase> | null = null;

    private open(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;
        if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'));
        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('updatedAt', 'updatedAt');
                    store.createIndex('status', 'status');
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('Unable to open upload task database'));
        });
        return this.dbPromise;
    }

    async list(): Promise<PersistedUploadTask[]> {
        const db = await this.open();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const records = await requestResult(transaction.objectStore(STORE_NAME).getAll());
        return records.sort((left, right) => left.createdAt - right.createdAt);
    }

    async put(task: PersistedUploadTask): Promise<void> {
        const db = await this.open();
        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            await requestResult(transaction.objectStore(STORE_NAME).put(task));
        } catch (error) {
            if (!task.handle || !(error instanceof DOMException) || error.name !== 'DataCloneError') throw error;
            const { handle: _handle, ...withoutHandle } = task;
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            await requestResult(transaction.objectStore(STORE_NAME).put(withoutHandle));
        }
    }

    async remove(taskId: string): Promise<void> {
        const db = await this.open();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        await requestResult(transaction.objectStore(STORE_NAME).delete(taskId));
    }
}
