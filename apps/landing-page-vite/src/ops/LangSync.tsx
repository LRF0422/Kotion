import { useEffect } from "react";
import { i18n, useParams } from "@kn/common";

const SUPPORTED = ["zh", "en"] as const;

/** 从 /zh、/en 路径前缀同步语言，并维护 <html lang>。 */
export const LangSync: React.FC = () => {
    const { lang } = useParams<{ lang?: string }>();

    useEffect(() => {
        const next = SUPPORTED.includes(lang as (typeof SUPPORTED)[number]) ? (lang as string) : undefined;
        if (next) {
            if (!i18n.language?.startsWith(next)) {
                void i18n.changeLanguage(next);
            }
            try {
                localStorage.setItem("language", next);
            } catch {
                /* ignore */
            }
            document.documentElement.lang = next === "en" ? "en" : "zh-CN";
        } else {
            document.documentElement.lang = i18n.language?.startsWith("en") ? "en" : "zh-CN";
        }
    }, [lang]);

    return null;
};
