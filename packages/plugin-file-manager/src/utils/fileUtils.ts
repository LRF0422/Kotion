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

/**
 * Get file extension from filename
 * @param filename File name
 * @returns File extension without dot
 */
export const getFileExtension = (filename: string): string => {
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
    const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'];
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
                comparison = a.name.localeCompare(b.name);
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
    return files.filter(file => file.name.toLowerCase().includes(lowerQuery));
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
