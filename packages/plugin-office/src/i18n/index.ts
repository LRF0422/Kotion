/**
 * Internationalization support for the Office plugin (Excel only).
 * @module @kn/plugin-office/i18n
 */

import { i18n as i18nInstance } from "@kn/common";

export const translations = {
    en: {
        slashCommands: {
            spreadsheet: 'Spreadsheet',
            importExcel: 'Import Excel',
        },
        spreadsheet: {
            title: 'Spreadsheet',
            export: 'Export',
            exportTooltip: 'Export as .xlsx',
            fullscreen: 'Fullscreen',
            exitFullscreen: 'Exit fullscreen',
            close: 'Close',
            importFailed: 'Excel failed',
        },
    },
    zh: {
        slashCommands: {
            spreadsheet: '电子表格',
            importExcel: '导入Excel',
        },
        spreadsheet: {
            title: '电子表格',
            export: '导出',
            exportTooltip: '导出为 .xlsx',
            fullscreen: '全屏',
            exitFullscreen: '退出全屏',
            close: '关闭',
            importFailed: 'Excel 处理失败',
        },
    },
};

export type Translations = typeof translations;
export type SupportedLanguage = keyof Translations;

/**
 * Get translation for a key with optional interpolation params.
 * @param lang - Language code ('en' or 'zh')
 * @param key - Dot-separated key path (e.g., 'spreadsheet.export')
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

function currentLang(): SupportedLanguage {
    return i18nInstance?.language?.startsWith('zh') ? 'zh' : 'en';
}

/**
 * Create a translator function for use outside React components.
 * Reads the current language from the i18next instance at call time.
 */
export function createT() {
    return (key: string, params?: Record<string, string | number>) => t(currentLang(), key, params);
}

/**
 * Translator that resolves the language on every call. Prefer this over
 * {@link createT} for UI strings, which should follow live language switches.
 */
export const translate = (key: string, params?: Record<string, string | number>) =>
    t(currentLang(), key, params);
