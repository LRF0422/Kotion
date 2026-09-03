/**
 * Utility functions for file management
 */

/**
 * Format file size to human-readable format
 * @param bytes File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/** Keep malformed API records visible and safe to operate on. */
export const normalizeFileName = (name: unknown, id: unknown): string => {
    if (typeof name === 'string' && name.trim()) return name;

    const normalizedId = id === null || id === undefined ? '' : String(id).trim();
    return normalizedId ? `#${normalizedId}` : 'Unnamed';
};

/**
 * Get file extension from filename
 * @param filename File name
 * @returns File extension without dot
 */
export const getFileExtension = (filename: string | null | undefined): string => {
    if (typeof filename !== 'string') return '';

    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

/**
 * Check if file is an image by extension
 * @param filename File name
 * @returns True if file is an image
 */
export const isImageFile = (filename: string): boolean => {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
    return imageExtensions.includes(getFileExtension(filename));
};

/**
 * Check if file is a video by extension
 * @param filename File name
 * @returns True if file is a video
 */
export const isVideoFile = (filename: string): boolean => {
    const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'm4v', 'ogv', 'mpg', 'mpeg', '3gp'];
    return videoExtensions.includes(getFileExtension(filename));
};

/**
 * Check if file is a document by extension
 * @param filename File name
 * @returns True if file is a document
 */
export const isDocumentFile = (filename: string): boolean => {
    const documentExtensions = ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'];
    return documentExtensions.includes(getFileExtension(filename));
};

/**
 * Check if file is an audio file by extension
 * @param filename File name
 * @returns True if file is audio
 */
export const isAudioFile = (filename: string): boolean => {
    const audioExtensions = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'weba', 'opus', 'oga', 'aiff', 'aif', 'amr', 'wma'];
    return audioExtensions.includes(getFileExtension(filename));
};

/**
 * Check if file is a PDF by extension
 * @param filename File name
 * @returns True if file is a PDF
 */
export const isPdfFile = (filename: string): boolean => {
    return getFileExtension(filename) === 'pdf';
};

/**
 * Check if file is a plain-text / code file by extension
 * @param filename File name
 * @returns True if file can be shown as text
 */
export const isTextFile = (filename: string): boolean => {
    const textExtensions = [
        'txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'csv', 'log',
        'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'less', 'html', 'htm',
        'java', 'py', 'go', 'rs', 'c', 'cpp', 'h', 'sh', 'sql', 'ini', 'conf',
    ];
    return textExtensions.includes(getFileExtension(filename));
};

/**
 * Kind of inline preview a file supports.
 * 'media' is an ambiguous audio/video container that needs metadata probing.
 * 'none' means the file cannot be previewed in the browser.
 */
export type PreviewKind = 'image' | 'video' | 'audio' | 'media' | 'pdf' | 'text' | 'none';
export type MediaTypeHint = string | { value?: string } | null | undefined;

const normalizeMediaTypeHint = (hint: MediaTypeHint): string => {
    const value = typeof hint === 'string' ? hint : hint?.value;
    return value?.split(';', 1)[0].trim().toLowerCase() || '';
};

/** Determine how a file should be previewed from metadata, then its extension. */
export const getPreviewKind = (filename: string, mediaType?: MediaTypeHint): PreviewKind => {
    const hint = normalizeMediaTypeHint(mediaType);
    const extension = getFileExtension(filename);
    if (extension === 'webm') {
        return hint.startsWith('audio/') || hint === 'audio' ? 'audio' : 'media';
    }
    if (hint.startsWith('audio/') || hint === 'audio') return 'audio';
    if (hint.startsWith('video/') || hint === 'video') return 'video';
    if (hint.startsWith('image/') || hint === 'image') return 'image';
    if (hint === 'application/pdf' || hint === 'pdf') return 'pdf';
    if (hint.startsWith('text/')) return 'text';

    if (getFileExtension(filename) === 'webm') return 'media';
    if (isImageFile(filename)) return 'image';
    if (isVideoFile(filename)) return 'video';
    if (isAudioFile(filename)) return 'audio';
    if (isPdfFile(filename)) return 'pdf';
    if (isTextFile(filename)) return 'text';
    return 'none';
};

/** Whether a file can be previewed inline in the browser. */
export const isPreviewable = (filename: string, mediaType?: MediaTypeHint): boolean =>
    getPreviewKind(filename, mediaType) !== 'none';

/**
 * Truncate filename if too long
 * @param filename File name
 * @param maxLength Maximum length
 * @returns Truncated filename
 */
export const truncateFilename = (filename: string, maxLength: number = 30): string => {
    if (filename.length <= maxLength) return filename;

    const extension = getFileExtension(filename);
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
    const truncatedName = nameWithoutExt.substring(0, maxLength - extension.length - 4);

    return `${truncatedName}...${extension}`;
};

/**
 * Sort files by name, type, or date
 * @param files Array of files
 * @param sortBy Sort criteria
 * @param order Sort order
 * @returns Sorted array
 */
export const sortFiles = <T extends { name: string; isFolder: boolean; createdAt?: string }>(
    files: T[],
    sortBy: 'name' | 'type' | 'date' = 'name',
    order: 'asc' | 'desc' = 'asc'
): T[] => {
    const sorted = [...files];

    sorted.sort((a, b) => {
        // Always put folders first
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;

        let comparison = 0;

        switch (sortBy) {
            case 'name':
                comparison = normalizeFileName(a.name, '').localeCompare(normalizeFileName(b.name, ''));
                break;
            case 'type':
                const extA = getFileExtension(a.name);
                const extB = getFileExtension(b.name);
                comparison = extA.localeCompare(extB);
                break;
            case 'date':
                if (a.createdAt && b.createdAt) {
                    comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                }
                break;
        }

        return order === 'asc' ? comparison : -comparison;
    });

    return sorted;
};

/**
 * Filter files by search query
 * @param files Array of files
 * @param query Search query
 * @returns Filtered array
 */
export const filterFiles = <T extends { name: string }>(files: T[], query: string): T[] => {
    if (!query.trim()) return files;

    const lowerQuery = query.toLowerCase();
    return files.filter(file => normalizeFileName(file.name, '').toLowerCase().includes(lowerQuery));
};

/**
 * Generate unique filename if file already exists
 * @param filename Original filename
 * @param existingNames Array of existing filenames
 * @returns Unique filename
 */
export const generateUniqueFilename = (filename: string, existingNames: string[]): string => {
    if (!existingNames.includes(filename)) return filename;

    const extension = getFileExtension(filename);
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));

    let counter = 1;
    let newFilename = `${nameWithoutExt} (${counter})${extension ? '.' + extension : ''}`;

    while (existingNames.includes(newFilename)) {
        counter++;
        newFilename = `${nameWithoutExt} (${counter})${extension ? '.' + extension : ''}`;
    }

    return newFilename;
};

/**
 * Validate filename
 * @param filename File name to validate
 * @returns Error message if invalid, null if valid
 */
export const validateFilename = (filename: string): string | null => {
    if (!filename.trim()) {
        return 'Filename cannot be empty';
    }

    if (filename.length > 255) {
        return 'Filename is too long (max 255 characters)';
    }

    const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
    if (invalidChars.test(filename)) {
        return 'Filename contains invalid characters';
    }

    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    const nameWithoutExt = filename.split('.')[0].toUpperCase();
    if (reservedNames.includes(nameWithoutExt)) {
        return 'Filename is reserved by the system';
    }

    return null;
};
