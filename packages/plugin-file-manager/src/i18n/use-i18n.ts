/**
 * useI18n - bridges the app's current language (react-i18next) to this plugin's
 * local translation table. Components call `t('sidebar.home')`.
 *
 * @module @kn/file-manager/i18n
 */

import { useCallback } from "react";
import { useTranslation } from "@kn/common";
import { t as translate, type SupportedLanguage } from "./index";

export function useI18n() {
    const { i18n } = useTranslation();
    const lang: SupportedLanguage = i18n?.language?.startsWith("zh") ? "zh" : "en";
    const t = useCallback(
        (key: string, params?: Record<string, string | number>) =>
            translate(lang, key, params),
        [lang],
    );
    return { t, lang };
}
