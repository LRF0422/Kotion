/**
 * Internationalization support for Block Reference Plugin
 * @module @kn/plugin-block-reference/i18n
 */

import { i18n as i18nInstance } from "@kn/common";

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
        bidirectionalLink: {
            backlinksTitle: 'Backlinks',
            unlinkedMentionsTitle: 'Unlinked mentions',
            refresh: 'Refresh',
            viewGraph: 'View graph',
            filterAll: 'All',
            filterLinks: 'Links',
            filterMentions: 'Mentions',
            filterEmbeds: 'Embeds',
            blockBadge: 'Block',
            searchPagesPlaceholder: 'Type to search pages…',
            searchBlocksPlaceholder: 'Type to search blocks…',
            noPages: 'No pages found',
            noBlocks: 'No blocks found',
            tryDifferentSearch: 'Try a different keyword',
            createPagePrefix: 'Create page',
            creating: 'Creating…',
            currentPage: 'Current page',
            untitled: 'Untitled',
            navHint: '↑↓ Navigate',
            selectHint: 'Enter to select · Esc to dismiss',
            previewEmpty: 'This page is empty',
            jumpTo: 'Jump to',
            page: 'Page',
            pageDeleted: 'This page has been deleted',
            removeLink: 'Remove link',
            loadFailed: 'Load failed',
            blockNotFound: 'Block not found or deleted',
            goToSource: 'Go to source',
            delete: 'Delete',
            from: 'From',
            loading: 'Loading…',
            ctrlClickHint: 'Ctrl+Click to open directly',
            edit: 'Edit',
            close: 'Close',
            openFullPage: 'Open full page',
            loadPageFailed: 'Failed to load page',
            statusSaving: 'Saving',
            statusSaved: 'Saved',
            statusSaveFailed: 'Save failed',
            statusEditing: 'Editing',
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
        bidirectionalLink: {
            backlinksTitle: '反向链接',
            unlinkedMentionsTitle: '未链接提及',
            refresh: '刷新',
            viewGraph: '查看图谱',
            filterAll: '全部',
            filterLinks: '链接',
            filterMentions: '提及',
            filterEmbeds: '嵌入',
            blockBadge: '块',
            searchPagesPlaceholder: '输入以搜索页面…',
            searchBlocksPlaceholder: '输入以搜索块…',
            noPages: '未找到页面',
            noBlocks: '未找到块',
            tryDifferentSearch: '换个关键词试试',
            createPagePrefix: '创建页面',
            creating: '创建中…',
            currentPage: '当前页面',
            untitled: '未命名',
            navHint: '↑↓ 导航',
            selectHint: 'Enter 选择 · Esc 关闭',
            previewEmpty: '该页面暂无内容',
            jumpTo: '跳转到',
            page: '页面',
            pageDeleted: '该页面已被删除',
            removeLink: '移除链接',
            loadFailed: '加载失败',
            blockNotFound: '块不存在或已删除',
            goToSource: '跳转到来源',
            delete: '删除',
            from: '来自',
            loading: '加载中…',
            ctrlClickHint: 'Ctrl+单击直接打开',
            edit: '编辑',
            close: '关闭',
            openFullPage: '打开完整页面',
            loadPageFailed: '页面加载失败',
            statusSaving: '保存中',
            statusSaved: '已保存',
            statusSaveFailed: '保存失败',
            statusEditing: '编辑中',
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

/**
 * Create a translator function for use outside React components.
 * Reads the current language from the i18next instance at call time.
 */
export function createT() {
    const lang: SupportedLanguage = i18nInstance?.language?.startsWith('zh') ? 'zh' : 'en';
    return (key: string) => t(lang, key);
}
