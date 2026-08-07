/**
 * Internationalization support for Editor package
 * @module @kn/editor/i18n
 */

import { i18n as i18nInstance } from "@kn/common";

export const translations = {
    en: {
        slashCommands: {
            headingGroup: 'Headings',
            heading1: 'Heading 1',
            heading2: 'Heading 2',
            heading3: 'Heading 3',
            heading4: 'Heading 4',
            bulletList: 'Bullet List',
            orderedList: 'Ordered List',
            codeBlock: 'Code Block',
            table: 'Table',
            importExcel: 'Import from Excel',
            horizontalRule: 'Horizontal Rule',
            image: 'Image',
            link: 'Link',
            callout: 'Callout',
            columns: 'Columns',
            inlineMath: 'Inline Math',
            blockMath: 'Block Math',
        },
        slashMenu: {
            noResults: 'No commands found',
            noResultsHint: 'Try a different keyword',
        },
        datePicker: {
            placeholder: 'Pick a date',
            today: 'Today',
            tomorrow: 'Tomorrow',
            includeTime: 'Include time',
            clear: 'Clear',
        },
    },
    zh: {
        slashCommands: {
            headingGroup: '标题',
            heading1: '标题一',
            heading2: '标题二',
            heading3: '标题三',
            heading4: '标题四',
            bulletList: '无序列表',
            orderedList: '有序列表',
            codeBlock: '代码块',
            table: '表格',
            importExcel: '从Excel导入表格',
            horizontalRule: '分割线',
            image: '图片',
            link: '链接',
            callout: 'Callout',
            columns: '布局',
            inlineMath: '行内公式',
            blockMath: '块级公式（多行）',
        },
        slashMenu: {
            noResults: '未找到指令',
            noResultsHint: '请尝试其他关键词',
        },
        datePicker: {
            placeholder: '选择日期',
            today: '今天',
            tomorrow: '明天',
            includeTime: '包含时间',
            clear: '清除',
        },
    },
};

export type Translations = typeof translations;
export type SupportedLanguage = keyof Translations;

/**
 * Get translation for a key with optional interpolation params.
 * @param lang - Language code ('en' or 'zh')
 * @param key - Dot-separated key path (e.g., 'slashCommands.heading1')
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
