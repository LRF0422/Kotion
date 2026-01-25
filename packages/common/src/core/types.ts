export type KeysWithTypeOf<T, Type> = { [P in keyof T]: T[P] extends Type ? P : never }[keyof T];
export type ValuesOf<T> = T[keyof T];

/**
 * Uploaded file information
 */
export interface UploadedFile {
    /** Server-side file name (usually UUID) */
    name: string;
    /** Original file name */
    originalName: string;
    /** File path on server */
    path?: string;
    /** File size in bytes */
    size?: number;
    /** MIME type */
    type?: string;
}

/**
 * Options for file upload
 */
export interface UploadOptions {
    /** Allowed MIME types for file picker */
    mimeTypes?: string[];
    /** Allow multiple file selection */
    multiple?: boolean;
    /** Progress callback */
    onProgress?: (progress: number) => void;
}

/**
 * FileService interface - centralized file operations for the entire application
 * All plugins must use this interface for file operations instead of direct API calls
 */
export interface FileService {
    upload: (options?: UploadOptions) => Promise<UploadedFile>;
    uploadFile: (file: File, options?: Omit<UploadOptions, 'mimeTypes' | 'multiple'>) => Promise<UploadedFile>;
    uploadFiles: (files: File[], options?: Omit<UploadOptions, 'mimeTypes' | 'multiple'>) => Promise<UploadedFile[]>;
    getDownloadUrl: (fileName: string) => string;
    download: (fileName: string) => Promise<void>;
    deleteFile?: (fileId: string) => Promise<void>;
    createFolder?: (name: string, parentId?: string, repositoryKey?: string) => Promise<any>;
    renameFile?: (fileId: string, newName: string) => Promise<void>;
    moveFile?: (fileId: string, targetFolderId: string) => Promise<void>;
}

/**
 * Plugin services registry
 * Plugins can register their services here to be accessed via useService hook
 */
export interface Services {
    fileService?: FileService;
}