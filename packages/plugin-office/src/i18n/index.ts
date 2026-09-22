/**
 * Internationalization support for the Office plugin (Excel only).
 * @module @kn/plugin-office/i18n
 */

import { i18n as i18nInstance } from "@kn/common";
import { t, translations, type SupportedLanguage, type Translations } from "./translate";

export { t, translations };
export type { SupportedLanguage, Translations };

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
