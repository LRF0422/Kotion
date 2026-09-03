import {
    FileService,
    UploadedFile,
    UploadOptions,
    FileSelectorOptions,
    SelectedFile,
    getAccessToken,
    logger,
    resolveOptionalService,
} from "@kn/common";
import { request, useApi, APIS as CORE_APIS } from "@kn/common";
import { fileOpen } from "browser-fs-access";
import { APIS } from "../api";
import { showFileSelector } from "../editor-extensions/utils/showFileSelector";

/**
 * FileService implementation provided by FileManager plugin
 * This implementation includes full file management capabilities
 */
export class FileServiceImpl implements FileService {
    private downloadBaseUrl: string;

    constructor(config?: { downloadBaseUrl?: string }) {
        this.downloadBaseUrl = config?.downloadBaseUrl ||
            "https://kotion.top:888/api/knowledge-resource/oss/endpoint/download?fileName=";
    }

    /**
     * Open file picker and upload selected file
     */
    async upload(options?: UploadOptions): Promise<UploadedFile> {
        const blob = await fileOpen({
            mimeTypes: options?.mimeTypes || ["*/*"],
            multiple: false,
        });
        return this.uploadFile(blob as File, options);
    }

    /**
     * Open the OS file picker and return selected File objects (no upload)
     */
    async pickFiles(options?: UploadOptions): Promise<File[]> {
        const blobs = await fileOpen({
            mimeTypes: options?.mimeTypes || ["*/*"],
            multiple: options?.multiple ?? true,
        });
        const arr = Array.isArray(blobs) ? blobs : [blobs];
        return arr as File[];
    }

    /**
     * Upload a single file to OSS (raw upload, returns uploaded file metadata).
     * Note: this does NOT create a file-center record — use uploadToFileCenter for that.
     */
    async uploadFile(file: File, options?: Omit<UploadOptions, 'mimeTypes' | 'multiple'>): Promise<UploadedFile> {
        // Use core's OSS upload API for basic file upload
        const res = await useApi(CORE_APIS.UPLOAD_FILE, null, {
            file: file
        }, { 'Content-Type': 'multipart/form-data' });

        return {
            name: res.data.name,
            originalName: res.data.originalName,
            path: res.data.path,
            size: file.size,
            type: file.type,
        };
    }

    /**
     * Upload multiple files
     */
    async uploadFiles(files: File[], options?: Omit<UploadOptions, 'mimeTypes' | 'multiple'>): Promise<UploadedFile[]> {
        return Promise.all(files.map(file => this.uploadFile(file, options)));
    }

    /**
     * Get download URL for a file
     */
    getDownloadUrl(fileName: string): string {
        if (!fileName) {
            return '';
        }
        if (fileName.startsWith('http://') || fileName.startsWith('https://')) {
            return fileName;
        }
        return this.downloadBaseUrl + fileName + '&Authorization=' + getAccessToken();
    }

    /**
     * Download a file-center record as an authenticated Blob.
     * Media elements cannot attach Authorization headers themselves, so callers
     * can create an object URL from this Blob for reliable playback after reload.
     */
    async getFileBlob(fileId: string): Promise<Blob> {
        const blob = await request({
            url: `/knowledge-file-center/file/${encodeURIComponent(fileId)}/download`,
            method: 'GET',
            responseType: 'blob',
        }) as unknown as Blob;
        return blob;
    }

    /**
     * Download a file (opens in new tab)
     */
    async download(fileName: string): Promise<void> {
        const url = this.getDownloadUrl(fileName);
        window.open(url, '_blank');
    }

    /**
     * Delete a file by ID
     */
    async deleteFile(fileId: string): Promise<void> {
        await useApi(APIS.DELETE_FILE, { fileId }, null);
    }

    /**
     * Create a folder in the file center
     */
    async createFolder(name: string, parentId?: string, repositoryKey?: string): Promise<any> {
        const res = await useApi(APIS.CREATE_FILE, null, {
            name,
            parentId: parentId || '',
            type: 'FOLDER',
            repositoryKey,
        });
        return res.data;
    }

    /**
     * Rename a file or folder
     */
    async renameFile(fileId: string, newName: string): Promise<void> {
        await useApi(APIS.RENAME_FILE, { fileId }, { newName });
    }

    /**
     * Move a file to another folder
     */
    async moveFile(fileId: string, targetFolderId: string): Promise<void> {
        await useApi(APIS.MOVE_FILE, null, {
            sourceId: fileId,
            targetId: targetFolderId,
        });
    }

    /**
     * Open file selector dialog to select files from file manager
     */
    async openFileSelector(options?: FileSelectorOptions, editor?: any): Promise<SelectedFile[] | null> {
        if (!editor) {
            logger.warn('Editor is required for file selector');
            return null;
        }

        const selectedFiles = await showFileSelector(editor, options);

        // Add download URLs to selected files
        if (selectedFiles) {
            return selectedFiles.map(file => ({
                ...file,
                url: file.path ? this.getDownloadUrl(file.path) : undefined,
            }));
        }

        return null;
    }

    /**
     * Upload file to file center in a single step.
     * Backend /file/upload handles OSS upload + DB record creation together.
     */
    async uploadToFileCenter(
        file: File,
        parentId?: string,
        repositoryKey?: string,
        options?: Omit<UploadOptions, 'mimeTypes' | 'multiple'>,
    ): Promise<any> {
        const uploadTasks = resolveOptionalService('uploadTaskService');
        if (uploadTasks && !options?.forceLegacy) {
            const [taskId] = await uploadTasks.enqueue([{ file }], {
                parentId: parentId || '0',
                repositoryKey,
            });
            const unsubscribe = options?.onProgress
                ? uploadTasks.subscribe(() => {
                    const task = uploadTasks.getSnapshot().tasks.find((candidate) => candidate.id === taskId);
                    if (task) options.onProgress?.(task.progress);
                })
                : undefined;
            let rejectAbort: ((reason: unknown) => void) | undefined;
            const abortPromise = options?.signal
                ? new Promise<never>((_, reject) => { rejectAbort = reject; })
                : undefined;
            const abort = () => {
                void uploadTasks.cancel(taskId);
                rejectAbort?.(new DOMException('Upload aborted', 'AbortError'));
            };
            options?.signal?.addEventListener('abort', abort, { once: true });
            try {
                if (options?.signal?.aborted) abort();
                const completion = uploadTasks.waitForCompletion(taskId);
                return await (abortPromise ? Promise.race([completion, abortPromise]) : completion);
            } finally {
                unsubscribe?.();
                options?.signal?.removeEventListener('abort', abort);
            }
        }

        const formData = new FormData();
        formData.append('file', file);
        if (parentId) formData.append('parentId', parentId);
        if (repositoryKey) formData.append('repositoryKey', repositoryKey);
        const res = await useApi(APIS.UPLOAD_FILE, null, formData, {
            'Content-Type': 'multipart/form-data',
        });
        return res.data;
    }
}

// Singleton instance
let fileServiceInstance: FileServiceImpl | null = null;

/**
 * Get the FileService singleton instance
 */
export const getFileService = (config?: { downloadBaseUrl?: string }): FileService => {
    if (!fileServiceInstance) {
        fileServiceInstance = new FileServiceImpl(config);
    }
    return fileServiceInstance;
};

/**
 * Reset the FileService instance (useful for testing)
 */
export const resetFileService = (): void => {
    fileServiceInstance = null;
};
