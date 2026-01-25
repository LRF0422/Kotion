import { FileService, UploadedFile, UploadOptions } from "@kn/common";
import { useApi, APIS as CORE_APIS } from "@kn/core";
import { fileOpen } from "browser-fs-access";
import { APIS } from "../api";

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
            mimeTypes: options?.mimeTypes || ["**/*"],
            multiple: false,
        });
        return this.uploadFile(blob as File, options);
    }

    /**
     * Upload a single file to the server
     */
    async uploadFile(file: File, options?: Omit<UploadOptions, 'mimeTypes' | 'multiple'>): Promise<UploadedFile> {
        // Use core's UPLOAD_FILE API for basic file upload
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
        if (fileName.startsWith('http://') || fileName.startsWith('https://')) {
            return fileName;
        }
        return this.downloadBaseUrl + fileName;
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
        await useApi(APIS.DELETE_FILE, { id: fileId }, null);
    }

    /**
     * Create a folder in the file center
     */
    async createFolder(name: string, parentId?: string, repositoryKey?: string): Promise<any> {
        const res = await useApi(APIS.CREATE_FOLDER, null, {
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
        await useApi(APIS.RENAME_FILE, null, {
            id: fileId,
            name: newName,
        });
    }

    /**
     * Move a file to another folder
     */
    async moveFile(fileId: string, targetFolderId: string): Promise<void> {
        // TODO: Implement move file API when available
        console.warn('moveFile API not implemented yet');
    }

    /**
     * Upload file to file center (with folder management)
     */
    async uploadToFileCenter(file: File, parentId?: string, repositoryKey?: string): Promise<any> {
        // First upload the file
        const uploadResult = await this.uploadFile(file);

        // Then create a file record in file center
        const res = await useApi(APIS.CREATE_FOLDER, null, {
            name: uploadResult.originalName,
            parentId: parentId || '',
            type: 'FILE',
            repositoryKey,
            path: uploadResult.name,
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
