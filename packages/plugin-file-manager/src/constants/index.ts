/**
 * Constants for the FileManager plugin
 */

export const FILE_TYPES = {
    FOLDER: 'FOLDER',
    FILE: 'FILE',
} as const;

export const FILE_VIEWS = {
    GRID: 'grid',
    LIST: 'list',
} as const;

export const SORT_OPTIONS = {
    NAME: 'name',
    TYPE: 'type',
    DATE: 'date',
    SIZE: 'size',
} as const;

export const SORT_ORDER = {
    ASC: 'asc',
    DESC: 'desc',
} as const;

export const MAX_FILE_NAME_LENGTH = 255;
export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100MB

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
export const VIDEO_EXTENSIONS = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'];
export const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'];

export const RESERVED_FILENAMES = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
];

export const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
