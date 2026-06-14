
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
    /** Open the OS file picker and return the selected File objects (no upload) */
    pickFiles?: (options?: UploadOptions) => Promise<File[]>;
    /** Upload a file to the file center (single-step: OSS + DB record) under a folder */
    uploadToFileCenter?: (file: File, parentId?: string, repositoryKey?: string) => Promise<any>;
}

/**
 * AIFoundation interface - Global AI service for the entire application
 * Provides unified access to AI capabilities across all plugins and components
 */
export interface AIFoundation {
    // Configuration
    getConfig(): any;
    setConfig(config: Partial<any>): void;

    // Tool Management
    getToolRegistry(): any;
    registerTool(name: string, tool: any, meta?: Partial<any>): void;
    unregisterTool(name: string): void;

    // Skill Management
    getSkillRegistry(): any;
    installSkill(skill: any): Promise<{ success: boolean; message: string }>;

    // Context Management
    setEditorContext(editor: any, documentId?: string): void;
    getEditorContext(): any;
    setContext<T>(context: any): void;
    getContext<T = any>(id: string): any;
    getActiveContext(): any;

    // Agent Management
    createAgent(options?: any): any;
    getDefaultAgent(): any;
    getAgent(id: string): any;
    destroyAgent(id: string): void;

    // Events
    subscribe(listener: (event: any) => void): () => void;
    emit(event: any): void;

    // Lifecycle
    initialize(): Promise<void>;
    isInitialized(): boolean;
    dispose(): void;
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
    aiFoundation?: AIFoundation;
}