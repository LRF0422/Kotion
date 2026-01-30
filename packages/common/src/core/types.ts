import { string } from "@kn/ui";

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
 * Options for file selector
 */
export interface FileSelectorOptions {
    /** Allow multiple file selection */
    multiple?: boolean;
    /** Target type: 'file', 'folder', or 'both' */
    target?: 'file' | 'folder' | 'both';
    /** Filter by file types (e.g., ['image/*', 'application/pdf']) */
    accept?: string[];
    /** Dialog title */
    title?: string;
}

/**
 * Selected file information from file manager
 */
export interface SelectedFile {
    id: string;
    name: string;
    path?: string;
    isFolder: boolean;
    /** Full download URL */
    url?: string;
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
    /** Open file selector dialog to select files from file manager */
    openFileSelector?: (options?: FileSelectorOptions, editor?: any) => Promise<SelectedFile[] | null>;
}

/**
 * Plugin services registry
 * Plugins can register their services here to be accessed via useService hook
 * Use module augmentation to add new services:
 * 
 * @example
 * ```typescript
 * declare module '@kn/common' {
 *     interface Services {
 *         myService: MyServiceType;
 *     }
 * }
 * ```
 */
export interface Services {
    fileService?: FileService;
}