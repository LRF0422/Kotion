/**
 * Local folder upload helpers.
 *
 * A folder upload preserves the selected directory tree: the structure is turned
 * into an ordered plan of folders to create (parents first) plus the files that
 * belong in each resulting folder. Picking and drag-and-drop produce the same
 * {@link FolderUploadSelection} shape so both entry points share one planner.
 */

/** A file chosen from a local folder, with its path relative to the selected root. */
export interface FolderUploadEntry {
    file: File;
    /** POSIX-style path relative to the selected folder root (includes the root folder name). */
    relativePath: string;
}

/** A local folder selection: files plus directories that may be empty. */
export interface FolderUploadSelection {
    entries: FolderUploadEntry[];
    /** POSIX-style directory paths that must be created even when they contain no files. */
    directories: string[];
}

/** A directory that must exist before its files can be uploaded. */
export interface FolderUploadDirectory {
    /** Full POSIX-style path relative to the destination folder. */
    path: string;
    /** Parent directory path, or '' when the directory lives directly in the destination. */
    parentPath: string;
    /** Final path segment. */
    name: string;
}

export interface FolderUploadFile {
    file: File;
    /** Target directory path, or '' for the destination folder itself. */
    directoryPath: string;
}

export interface FolderUploadPlan {
    /** All directories, ordered parents-first and ready to be created in order. */
    directories: FolderUploadDirectory[];
    files: FolderUploadFile[];
}

export interface FolderUploadGroup {
    /** Target directory path, or '' for the destination folder itself. */
    directoryPath: string;
    files: File[];
}

export interface FolderUploadResult {
    foldersCreated: number;
    filesQueued: number;
    filesUploaded: number;
    filesFailed: number;
}

export const emptyFolderSelection = (): FolderUploadSelection => ({ entries: [], directories: [] });

/** Normalize an OS/user supplied path: forward slashes, no empty, '.' or '..' segments. */
export const normalizeFolderPath = (raw: unknown): string => {
    if (typeof raw !== 'string') return '';
    return raw
        .replace(/\\/g, '/')
        .split('/')
        .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
        .join('/');
};

/** Turn a folder selection into an ordered plan of folders to create and files to upload. */
export const planFolderUpload = (selection: FolderUploadSelection = emptyFolderSelection()): FolderUploadPlan => {
    const directorySet = new Set<string>();

    const addDirectoryChain = (directoryPath: string) => {
        const segments = directoryPath.split('/').filter(Boolean);
        for (let index = 1; index <= segments.length; index += 1) {
            directorySet.add(segments.slice(0, index).join('/'));
        }
    };

    for (const directory of selection.directories ?? []) {
        const normalized = normalizeFolderPath(directory);
        if (normalized) addDirectoryChain(normalized);
    }

    const files: FolderUploadFile[] = [];
    for (const entry of selection.entries ?? []) {
        const relativePath = normalizeFolderPath(entry.relativePath || entry.file?.name);
        const segments = relativePath.split('/').filter(Boolean);
        const directoryPath = segments.slice(0, -1).join('/');
        if (directoryPath) addDirectoryChain(directoryPath);
        files.push({ file: entry.file, directoryPath });
    }

    const directories = [...directorySet]
        .map((path) => {
            const segments = path.split('/');
            return {
                path,
                parentPath: segments.slice(0, -1).join('/'),
                name: segments[segments.length - 1],
            };
        })
        .sort((left, right) => {
            const byDepth = left.path.split('/').length - right.path.split('/').length;
            return byDepth !== 0 ? byDepth : left.path.localeCompare(right.path);
        });

    return { directories, files };
};

/** Group planned files by target directory, preserving first-seen order. */
export const groupFilesByDirectory = (files: FolderUploadFile[]): FolderUploadGroup[] => {
    const groups = new Map<string, File[]>();
    for (const item of files) {
        const existing = groups.get(item.directoryPath);
        if (existing) existing.push(item.file);
        else groups.set(item.directoryPath, [item.file]);
    }
    return [...groups.entries()].map(([directoryPath, groupedFiles]) => ({
        directoryPath,
        files: groupedFiles,
    }));
};

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

type FolderPickOutcome =
    | { kind: 'selection'; selection: FolderUploadSelection }
    | { kind: 'cancelled' }
    | { kind: 'unsupported' };

interface DirectoryHandleLike {
    kind: 'directory';
    name: string;
    values(): AsyncIterableIterator<DirectoryHandleLike | FileHandleLike>;
}

interface FileHandleLike {
    kind: 'file';
    name: string;
    getFile(): Promise<File>;
}

interface DirectoryPickerWindow {
    showDirectoryPicker?: (options?: { mode?: 'read' }) => Promise<DirectoryHandleLike>;
}

interface ElectronDirEntry {
    name: string;
    isDirectory: boolean;
    isFile: boolean;
}

interface ElectronBridge {
    invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
}

const walkDirectoryHandle = async (
    directory: DirectoryHandleLike,
    prefix: string,
    selection: FolderUploadSelection,
): Promise<void> => {
    for await (const handle of directory.values()) {
        const path = prefix ? `${prefix}/${handle.name}` : handle.name;
        if (handle.kind === 'directory') {
            selection.directories.push(path);
            await walkDirectoryHandle(handle, path, selection);
        } else {
            selection.entries.push({ file: await handle.getFile(), relativePath: path });
        }
    }
};

/** Chromium File System Access API picker. Must be invoked on `window` (detached calls throw Illegal invocation). */
const pickFolderWithDirectoryPicker = async (): Promise<FolderPickOutcome> => {
    if (typeof window === 'undefined') return { kind: 'unsupported' };
    const pickerWindow = window as unknown as DirectoryPickerWindow;
    if (typeof pickerWindow.showDirectoryPicker !== 'function') return { kind: 'unsupported' };

    let directory: DirectoryHandleLike;
    try {
        directory = await pickerWindow.showDirectoryPicker({ mode: 'read' });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return { kind: 'cancelled' };
        throw error;
    }

    const selection: FolderUploadSelection = { entries: [], directories: [directory.name] };
    await walkDirectoryHandle(directory, directory.name, selection);
    return { kind: 'selection', selection };
};

/** `<input webkitdirectory>` picker, used when the File System Access API is unavailable. */
const pickFolderWithInput = (): Promise<FolderPickOutcome> => new Promise((resolve) => {
    if (typeof document === 'undefined') {
        resolve({ kind: 'unsupported' });
        return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    (input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true;
    input.style.display = 'none';

    let settled = false;
    const finish = (outcome: FolderPickOutcome) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', handleFocus);
        input.remove();
        resolve(outcome);
    };
    // Some environments never fire 'change' (e.g. a dismissed dialog): settle as cancelled once focus returns.
    const handleFocus = () => {
        window.setTimeout(() => {
            if (!settled && (!input.files || input.files.length === 0)) finish({ kind: 'cancelled' });
        }, 400);
    };

    input.addEventListener('change', () => {
        const files = Array.from(input.files || []);
        finish({
            kind: 'selection',
            selection: {
                entries: files.map((file) => ({
                    file,
                    relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
                })),
                directories: [],
            },
        });
    }, { once: true });
    input.addEventListener('cancel' as keyof HTMLElementEventMap, () => finish({ kind: 'cancelled' }), { once: true });
    window.addEventListener('focus', handleFocus, { once: true });

    document.body.appendChild(input);
    input.click();
});

const getElectronBridge = (): ElectronBridge | undefined => {
    if (typeof window === 'undefined') return undefined;
    const bridge = (window as unknown as { api?: ElectronBridge }).api;
    return bridge && typeof bridge.invoke === 'function' ? bridge : undefined;
};

const readElectronFile = async (bridge: ElectronBridge, filePath: string): Promise<File> => {
    const response = await bridge.invoke<{ data?: string | null; error?: string }>('fs:readFile', filePath, 'base64');
    if (!response || typeof response.data !== 'string') {
        throw new Error(response?.error || `Failed to read ${filePath}`);
    }
    const binary = atob(response.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const name = filePath.split('/').filter(Boolean).pop() || 'file';
    return new File([bytes], name);
};

const walkElectronDirectory = async (
    bridge: ElectronBridge,
    directoryPath: string,
    pathPrefix: string,
    selection: FolderUploadSelection,
): Promise<void> => {
    const response = await bridge.invoke<{ data?: ElectronDirEntry[]; error?: string }>('fs:readdir', directoryPath);
    if (response?.error) throw new Error(response.error);
    const entries = [...(response?.data ?? [])].sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
        const childPath = `${directoryPath}/${entry.name}`;
        const relativePath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
        if (entry.isDirectory) {
            selection.directories.push(relativePath);
            await walkElectronDirectory(bridge, childPath, relativePath, selection);
        } else if (entry.isFile) {
            selection.entries.push({ file: await readElectronFile(bridge, childPath), relativePath });
        }
    }
};

/**
 * Electron picker. Chromium's `<input webkitdirectory>` returns an empty file list in
 * Electron, so the native dialog plus the preload file-system bridge is used instead.
 */
const pickFolderWithElectron = async (): Promise<FolderPickOutcome> => {
    const bridge = getElectronBridge();
    if (!bridge) return { kind: 'unsupported' };
    const result = await bridge.invoke<{ canceled: boolean; folderPath: string | null }>(
        'dialog:openFolder',
        { title: 'Select Folder' },
    );
    if (!result || result.canceled || !result.folderPath) return { kind: 'cancelled' };

    const rootPath = result.folderPath.replace(/\\/g, '/');
    const rootName = rootPath.split('/').filter(Boolean).pop() || 'folder';
    const selection: FolderUploadSelection = { entries: [], directories: [rootName] };
    await walkElectronDirectory(bridge, rootPath, rootName, selection);
    return { kind: 'selection', selection };
};

/**
 * Open the OS folder picker and return every file plus empty directory beneath it.
 * Returns `null` when the user cancels.
 */
export const pickFolderSelection = async (): Promise<FolderUploadSelection | null> => {
    let outcome: FolderPickOutcome;

    if (getElectronBridge()) {
        outcome = await pickFolderWithElectron();
    } else {
        outcome = await pickFolderWithDirectoryPicker();
        if (outcome.kind === 'unsupported') outcome = await pickFolderWithInput();
    }

    return outcome.kind === 'selection' ? outcome.selection : null;
};

// ---------------------------------------------------------------------------
// Drag and drop
// ---------------------------------------------------------------------------

const readFileEntry = (entry: FileSystemFileEntry): Promise<File> =>
    new Promise((resolve, reject) => entry.file(resolve, reject));

const walkDroppedEntry = async (
    entry: FileSystemEntry,
    prefix: string,
    selection: FolderUploadSelection,
): Promise<void> => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
        selection.entries.push({ file: await readFileEntry(entry as FileSystemFileEntry), relativePath: path });
        return;
    }
    if (!entry.isDirectory) return;
    selection.directories.push(path);
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries yields at most a few hundred entries per call; keep reading until it returns empty.
    for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walkDroppedEntry(child, path, selection);
    }
};

/** Collect files and empty folders from a drag-and-drop payload, preserving directory structure. */
export const collectDroppedSelection = async (
    dataTransfer: DataTransfer | null | undefined,
): Promise<FolderUploadSelection> => {
    const selection = emptyFolderSelection();
    if (!dataTransfer) return selection;

    const items = Array.from(dataTransfer.items || []).filter((item) => item.kind === 'file');
    const roots = items
        .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
        .filter((entry): entry is FileSystemEntry => entry !== null);

    if (roots.length) {
        for (const entry of roots) await walkDroppedEntry(entry, '', selection);
    }

    if (!selection.entries.length) {
        return {
            entries: Array.from(dataTransfer.files || []).map((file) => ({ file, relativePath: file.name })),
            directories: [],
        };
    }
    return selection;
};
