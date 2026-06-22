/**
 * useI18n - bridges the app's current language (react-i18next) to this plugin's
 * local translation table. Components call `t('pageReference.jumpTo')`.
 *
 * @module @kn/plugin-block-reference/i18n
 */

import { useCallback } from "react";
import { useTranslation } from "@kn/common";
import { t as translate, type SupportedLanguage } from "./index";

export function useI18n() {
    const { i18n } = useTranslation();
    const lang: SupportedLanguage = i18n?.language?.startsWith("zh") ? "zh" : "en";
    const t = useCallback((key: string) => translate(lang, key), [lang]);
    return { t, lang };
}
