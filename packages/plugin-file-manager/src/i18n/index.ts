/**
 * Internationalization support for File Manager Plugin
 * @module @kn/file-manager/i18n
 */

import { i18n as i18nInstance } from "@kn/common";

export const translations = {
    en: {
        sidebar: {
            library: 'Library',
            folders: 'Folders',
            home: 'Home',
            recent: 'Recent',
            favorites: 'Favorites',
            trash: 'Trash',
        },
        toolbar: {
            back: 'Back',
            forward: 'Forward',
            searchPlaceholder: 'Search files…',
            gridView: 'Grid view',
            listView: 'List view',
            upload: 'Upload',
            newFolder: 'New Folder',
            emptyTrash: 'Empty Trash',
            cancel: 'Cancel',
            dropFiles: 'Drop files to upload',
            fileNavigation: 'File navigation',
        },
        views: {
            recent: 'Recent',
            favorites: 'Favorites',
            trash: 'Trash',
        },
        selection: {
            selected: '{{count}} selected',
            confirm: 'Confirm',
            clearSelection: 'Clear selection',
        },
        breadcrumb: {
            home: 'Home',
            label: 'Breadcrumb',
        },
        contextMenu: {
            selectAll: 'Select All',
            clear: 'Clear ({{count}})',
            newFolder: 'New Folder',
            uploadFile: 'Upload File',
        },
        actions: {
            restore: 'Restore',
            deleteForever: 'Delete forever',
            preview: 'Preview',
            rename: 'Rename',
            moveTo: 'Move to…',
            copy: 'Copy',
            duplicate: 'Duplicate',
            removeFromFavorites: 'Remove from favorites',
            addToFavorites: 'Add to favorites',
            download: 'Download',
            properties: 'Properties',
            delete: 'Delete',
        },
        createFolder: {
            title: 'Create New Folder',
            description: 'Enter a name for the new folder',
            label: 'Folder name',
            placeholder: 'Enter folder name',
            emptyError: 'Folder name cannot be empty',
            invalidError: 'Folder name contains invalid characters',
            cancel: 'Cancel',
            create: 'Create',
        },
        rename: {
            titleFile: 'Rename File',
            titleFolder: 'Rename Folder',
            description: 'Enter a new name for "{{name}}"',
            label: 'New name',
            placeholder: 'Enter new name',
            emptyError: 'Name cannot be empty',
            invalidError: 'Name contains invalid characters',
            cancel: 'Cancel',
            confirm: 'Rename',
        },
        move: {
            title: 'Move {{count}} item(s)',
            description: 'Select a destination folder',
            home: 'Home',
            noFolders: 'No folders available',
            moveTo: 'Move to:',
            moveToCurrent: 'Move to current folder:',
            cancel: 'Cancel',
            confirm: 'Move Here',
        },
        details: {
            propertiesFile: 'File properties',
            propertiesFolder: 'Folder properties',
            basicInfo: 'Basic Information',
            name: 'Name',
            type: 'Type',
            folder: 'Folder',
            file: 'File',
            location: 'Location',
            details: 'Details',
            size: 'Size',
            created: 'Created',
            modified: 'Modified',
            technicalDetails: 'Technical Details',
            id: 'ID',
            close: 'Close',
            unknown: 'Unknown',
        },
        preview: {
            noPreview: 'No preview available — this file has no source location.',
            failedImage: 'Failed to load image preview.',
            cannotPreview: "This file type can't be previewed.",
            openInNewTab: 'Open in new tab',
            download: 'Download',
            videoNotSupported: 'Your browser does not support video playback.',
            audioNotSupported: 'Your browser does not support audio playback.',
        },
        confirm: {
            deleteTitle: 'Delete {{count}} item(s)?',
            deleteDescription: 'The selected item(s) will be moved to the trash. You can restore them later.',
            purgeTitle: 'Delete forever?',
            purgeDescription: 'This will permanently delete the selected item(s). This action cannot be undone.',
            emptyTrashTitle: 'Empty trash?',
            emptyTrashDescription: 'All items in the trash will be permanently deleted. This cannot be undone.',
            cancel: 'Cancel',
            confirm: 'Confirm',
        },
        emptyState: {
            errorLoading: 'Error loading files',
            retry: 'Retry',
            trashEmpty: 'Trash is empty',
            noFiles: 'No files yet',
            noFilesDescription: 'Upload files or create a folder to get started.',
            uploadFiles: 'Upload Files',
        },
        attachment: {
            empty: 'Empty attachment',
            downloadTitle: 'Download {{name}}',
            previewTitle: 'Preview {{name}}',
        },
        image: {
            loading: 'Loading...',
            failedToLoad: 'Failed to load image',
            alt: 'Image',
            captionPlaceholder: 'Add a caption',
        },
        folderDialog: {
            imageTitle: 'Select an image',
            imageDescription: 'Choose one image from the file library.',
            fileTitle: 'Select a file',
            fileDescription: 'Choose a file from the file library.',
            folderTitle: 'Select a folder',
            folderDescription: 'Choose a folder from the file library.',
            bothTitle: 'Select a file or folder',
            bothDescription: 'Choose an item from the file library.',
        },
        inlineFolder: {
            openLabel: 'Open folder: {{name}}',
            dialogTitle: '{{name}}',
            dialogDescription: 'Browse the contents of this folder.',
            unavailable: 'Folder unavailable',
            unavailableDescription: 'This folder no longer exists or is in the trash.',
            loading: 'Loading folder',
        },
        folderView: {
            selectFolder: 'Select a folder',
            noFolderSelected: 'No folder selected',
            selectFolderDescription: 'Select a folder to view its contents',
        },
        slashCommands: {
            folder: 'Folder',
            folderInline: 'Folder (Inline)',
            image: 'Image',
            attachmentBlock: 'Attachment (Block)',
            attachmentInline: 'Attachment (Inline)',
        },
        listHeader: {
            name: 'Name',
            size: 'Size',
            modified: 'Modified',
            actions: 'Actions',
        },
    },
    zh: {
        sidebar: {
            library: '资料库',
            folders: '文件夹',
            home: '主页',
            recent: '最近',
            favorites: '收藏',
            trash: '回收站',
        },
        toolbar: {
            back: '后退',
            forward: '前进',
            searchPlaceholder: '搜索文件…',
            gridView: '网格视图',
            listView: '列表视图',
            upload: '上传',
            newFolder: '新建文件夹',
            emptyTrash: '清空回收站',
            cancel: '取消',
            dropFiles: '拖放文件以上传',
            fileNavigation: '文件导航',
        },
        views: {
            recent: '最近',
            favorites: '收藏',
            trash: '回收站',
        },
        selection: {
            selected: '已选 {{count}} 项',
            confirm: '确认',
            clearSelection: '清除选择',
        },
        breadcrumb: {
            home: '主页',
            label: '面包屑导航',
        },
        contextMenu: {
            selectAll: '全选',
            clear: '清除 ({{count}})',
            newFolder: '新建文件夹',
            uploadFile: '上传文件',
        },
        actions: {
            restore: '恢复',
            deleteForever: '永久删除',
            preview: '预览',
            rename: '重命名',
            moveTo: '移动到…',
            copy: '复制',
            duplicate: '创建副本',
            removeFromFavorites: '取消收藏',
            addToFavorites: '添加收藏',
            download: '下载',
            properties: '属性',
            delete: '删除',
        },
        createFolder: {
            title: '新建文件夹',
            description: '请输入文件夹名称',
            label: '文件夹名称',
            placeholder: '请输入文件夹名称',
            emptyError: '文件夹名称不能为空',
            invalidError: '文件夹名称包含非法字符',
            cancel: '取消',
            create: '创建',
        },
        rename: {
            titleFile: '重命名文件',
            titleFolder: '重命名文件夹',
            description: '请输入"{{name}}"的新名称',
            label: '新名称',
            placeholder: '请输入新名称',
            emptyError: '名称不能为空',
            invalidError: '名称包含非法字符',
            cancel: '取消',
            confirm: '重命名',
        },
        move: {
            title: '移动 {{count}} 个项目',
            description: '选择目标文件夹',
            home: '主页',
            noFolders: '没有可用的文件夹',
            moveTo: '移动到：',
            moveToCurrent: '移动到当前文件夹：',
            cancel: '取消',
            confirm: '移动到此处',
        },
        details: {
            propertiesFile: '文件属性',
            propertiesFolder: '文件夹属性',
            basicInfo: '基本信息',
            name: '名称',
            type: '类型',
            folder: '文件夹',
            file: '文件',
            location: '位置',
            details: '详细信息',
            size: '大小',
            created: '创建时间',
            modified: '修改时间',
            technicalDetails: '技术详情',
            id: 'ID',
            close: '关闭',
            unknown: '未知',
        },
        preview: {
            noPreview: '无法预览 — 该文件没有源路径。',
            failedImage: '图片预览加载失败。',
            cannotPreview: '此文件类型无法预览。',
            openInNewTab: '在新标签页打开',
            download: '下载',
            videoNotSupported: '您的浏览器不支持视频播放。',
            audioNotSupported: '您的浏览器不支持音频播放。',
        },
        confirm: {
            deleteTitle: '删除 {{count}} 个项目？',
            deleteDescription: '所选项目将被移至回收站。您可以稍后恢复。',
            purgeTitle: '永久删除？',
            purgeDescription: '此操作将永久删除所选项目。此操作无法撤销。',
            emptyTrashTitle: '清空回收站？',
            emptyTrashDescription: '回收站中的所有项目将被永久删除。此操作无法撤销。',
            cancel: '取消',
            confirm: '确认',
        },
        emptyState: {
            errorLoading: '加载文件失败',
            retry: '重试',
            trashEmpty: '回收站为空',
            noFiles: '暂无文件',
            noFilesDescription: '上传文件或创建文件夹以开始。',
            uploadFiles: '上传文件',
        },
        attachment: {
            empty: '空附件',
            downloadTitle: '下载 {{name}}',
            previewTitle: '预览 {{name}}',
        },
        image: {
            loading: '加载中...',
            failedToLoad: '图片加载失败',
            alt: '图片',
            captionPlaceholder: '添加注脚',
        },
        folderDialog: {
            imageTitle: '选择图片',
            imageDescription: '从文件库中选择一张图片。',
            fileTitle: '选择文件',
            fileDescription: '从文件库中选择一个文件。',
            folderTitle: '选择文件夹',
            folderDescription: '从文件库中选择一个文件夹。',
            bothTitle: '选择文件或文件夹',
            bothDescription: '从文件库中选择一个项目。',
        },
        inlineFolder: {
            openLabel: '打开文件夹：{{name}}',
            dialogTitle: '{{name}}',
            dialogDescription: '浏览此文件夹中的内容。',
            unavailable: '文件夹不可用',
            unavailableDescription: '该文件夹已不存在或位于回收站中。',
            loading: '正在加载文件夹',
        },
        folderView: {
            selectFolder: '选择文件夹',
            noFolderSelected: '未选择文件夹',
            selectFolderDescription: '选择文件夹以查看其内容',
        },
        slashCommands: {
            folder: '文件夹',
            folderInline: '文件夹（行内）',
            image: '图片',
            attachmentBlock: '附件（块级）',
            attachmentInline: '附件（行内）',
        },
        listHeader: {
            name: '名称',
            size: '大小',
            modified: '修改时间',
            actions: '操作',
        },
    },
};

export type Translations = typeof translations;
export type SupportedLanguage = keyof Translations;

/**
 * Get translation for a key with optional interpolation params.
 * @param lang - Language code ('en' or 'zh')
 * @param key - Dot-separated key path (e.g., 'sidebar.home')
 * @param params - Optional interpolation values (e.g., { count: 3 })
 * @returns Translated string
 */
export function t(
    lang: SupportedLanguage,
    key: string,
    params?: Record<string, string | number>,
): string {
    const keys = key.split('.');
    let value: any = translations[lang];

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            // Fallback to English
            value = translations.en;
            for (const fallbackKey of keys) {
                if (value && typeof value === 'object' && fallbackKey in value) {
                    value = value[fallbackKey];
                } else {
                    return key;
                }
            }
            break;
        }
    }

    let result = typeof value === 'string' ? value : key;

    if (params) {
        for (const [param, val] of Object.entries(params)) {
            result = result.replace(new RegExp(`{{${param}}}`, 'g'), String(val));
        }
    }

    return result;
}

/**
 * Create a translator function for use outside React components.
 * Reads the current language from the i18next instance at call time.
 */
export function createT() {
    const lang: SupportedLanguage = i18nInstance?.language?.startsWith('zh') ? 'zh' : 'en';
    return (key: string, params?: Record<string, string | number>) => t(lang, key, params);
}
