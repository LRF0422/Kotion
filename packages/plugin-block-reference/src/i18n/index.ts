/**
 * Internationalization support for Block Reference Plugin
 * @module @kn/plugin-block-reference/i18n
 */

export const translations = {
    en: {
        blockReference: {
            loading: 'Loading block...',
            error: 'Failed to load block',
            notFound: 'Block does not exist',
            refresh: 'Refresh block',
            goToPage: 'Go to page',
            delete: 'Delete reference',
            refreshing: 'Refreshing...',
            blockWillUpdate: 'Block content will be updated',
        },
        pageReference: {
            untitled: 'Untitled',
            deleted: 'This page has been deleted',
            createFailed: 'Failed to create page',
            loading: 'Loading...',
        },
        blockSelector: {
            title: 'Select Block',
            spaces: 'Spaces',
            searchPlaceholder: 'Search blocks...',
            noResults: 'No blocks found',
            loadingBlocks: 'Loading blocks...',
            tryDifferentSearch: 'Try a different search term',
        },
        pageSelector: {
            title: 'Select Page',
            searchPlaceholder: 'Search pages...',
            noResults: 'No pages found',
            loadingPages: 'Loading pages...',
            close: 'Close',
        },
        slashCommands: {
            referenceGroup: 'Reference',
            createPage: 'Create sibling page and reference',
            createSubPage: 'Create child page and reference',
            linkPage: 'Link to existing page',
            linkBlock: 'Reference a block',
        },
    },
    zh: {
        blockReference: {
            loading: '加载中...',
            error: '加载失败',
            notFound: '块不存在',
            refresh: '刷新块',
            goToPage: '跳转到页面',
            delete: '删除引用',
            refreshing: '刷新中...',
            blockWillUpdate: '块内容将被更新',
        },
        pageReference: {
            untitled: '未命名',
            deleted: '该页面已被删除',
            createFailed: '创建页面失败',
            loading: '加载中...',
        },
        blockSelector: {
            title: '选择块',
            spaces: '空间',
            searchPlaceholder: '搜索块...',
            noResults: '未找到块',
            loadingBlocks: '正在加载块...',
            tryDifferentSearch: '试试其他搜索词',
        },
        pageSelector: {
            title: '选择页面',
            searchPlaceholder: '请输入页面名称',
            noResults: '未找到页面',
            loadingPages: '正在加载页面...',
            close: '关闭',
        },
        slashCommands: {
            referenceGroup: '引用',
            createPage: '新建同级页面并引用',
            createSubPage: '新建子页面并引用',
            linkPage: '关联页面',
            linkBlock: '关联块',
        },
    },
};

export type Translations = typeof translations;
export type SupportedLanguage = keyof Translations;

/**
 * Get translation for a key
 * @param lang - Language code ('en' or 'zh')
 * @param key - Dot-separated key path (e.g., 'blockReference.loading')
 * @returns Translated string
 */
export function t(lang: SupportedLanguage, key: string): string {
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
                    return key; // Return key if not found
                }
            }
            break;
        }
    }

    return typeof value === 'string' ? value : key;
}
