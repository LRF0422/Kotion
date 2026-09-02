import type { FileItem, SelectionModifiers } from '../editor-extensions/component/FileContext';

export type FileSelectionTarget = 'folder' | 'file' | 'both';

export interface FileSelectionPolicy {
    target?: FileSelectionTarget;
    accept?: string[];
    multiple?: boolean;
}

const MEDIA_TYPE_MIME: Record<string, string[]> = {
    IMAGE: ['image/*'],
    PDF: ['application/pdf'],
    DOC: ['application/msword'],
    DOCX: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    XLS: ['application/vnd.ms-excel'],
    XLSX: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

const EXTENSION_MIME: Record<string, string> = {
    '.bmp': 'image/bmp',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const getMediaType = (item: FileItem): string => {
    if (typeof item.mediaType === 'string') return item.mediaType.toUpperCase();
    return item.mediaType?.value?.toUpperCase() || '';
};

const getExtension = (name: string): string => {
    const index = name.lastIndexOf('.');
    return index >= 0 ? name.slice(index).toLowerCase() : '';
};

const matchesAccept = (item: FileItem, accept: string[]): boolean => {
    if (accept.length === 0) return true;

    const extension = getExtension(item.name);
    const mediaType = getMediaType(item);
    const mimeCandidates = [
        ...(MEDIA_TYPE_MIME[mediaType] || []),
        ...(mediaType.includes('/') ? [mediaType.toLowerCase()] : []),
        ...(EXTENSION_MIME[extension] ? [EXTENSION_MIME[extension]] : []),
    ];

    return accept.some((rawPattern) => {
        const pattern = rawPattern.trim().toLowerCase();
        if (!pattern) return false;
        if (pattern.startsWith('.')) return extension === pattern;

        if (pattern.endsWith('/*')) {
            const prefix = pattern.slice(0, -1);
            return mimeCandidates.some((mime) => mime.startsWith(prefix));
        }

        return mimeCandidates.includes(pattern);
    });
};

export const isItemSelectable = (
    item: FileItem,
    { target = 'both', accept = [] }: FileSelectionPolicy = {},
): boolean => {
    if (item.trashed === 1) return false;
    if (target === 'folder') return item.isFolder;
    if (item.isFolder) return target === 'both';
    if (target !== 'file' && target !== 'both') return false;
    return matchesAccept(item, accept);
};

export const normalizeConfirmedSelection = (
    files: FileItem[],
    policy: FileSelectionPolicy,
): FileItem[] => {
    const valid = files.filter((file) => isItemSelectable(file, policy));
    return policy.multiple ? valid : valid.slice(0, 1);
};

export const reconcileSelectedFiles = (
    selectedFiles: FileItem[],
    currentItems: FileItem[],
): FileItem[] => {
    const currentById = new Map(currentItems.map((item) => [item.id, item]));
    return selectedFiles
        .map((file) => currentById.get(file.id))
        .filter((file): file is FileItem => Boolean(file));
};

export const resolveNextSelection = ({
    selectedFiles,
    item,
    modifiers,
    orderedItems,
    anchorId,
    multiple,
    selectable,
}: {
    selectedFiles: FileItem[];
    item: FileItem;
    modifiers: SelectionModifiers;
    orderedItems: FileItem[];
    anchorId: string | null;
    multiple: boolean;
    selectable: (item: FileItem) => boolean;
}): FileItem[] => {
    if (!selectable(item)) return selectedFiles;
    if (!multiple) return [item];

    const range = Boolean(modifiers.shiftKey && anchorId);
    if (range) {
        const selectableItems = orderedItems.filter(selectable);
        const from = selectableItems.findIndex((candidate) => candidate.id === anchorId);
        const to = selectableItems.findIndex((candidate) => candidate.id === item.id);
        if (from !== -1 && to !== -1) {
            const [start, end] = from <= to ? [from, to] : [to, from];
            return selectableItems.slice(start, end + 1);
        }
    }

    if (modifiers.ctrlKey || modifiers.metaKey) {
        return selectedFiles.some((file) => file.id === item.id)
            ? selectedFiles.filter((file) => file.id !== item.id)
            : [...selectedFiles, item];
    }

    return [item];
};
