import React, { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useTranslation } from "@kn/common";
import { Header } from "../Header";
import { ScrollArea } from "@kn/ui";
import { Footer } from "../Footer";
import { RouteAnalytics } from "../../ops/RouteAnalytics";
import { LangSync } from "../../ops/LangSync";
import { ConsentBanner } from "../../components/ConsentBanner";
import { AnnouncementBar } from "../../components/AnnouncementBar";
import { ExitIntentModal } from "../../components/ExitIntentModal";
import { StickyCta } from "../../components/StickyCta";
import {
    getCachedConfig,
    loadOpsConfig,
    matchesPromotionPage,
    subscribeConfig,
    type OpsConfig,
    type PromotionItem,
} from "../../ops/config";
import { applySeo, applyStructuredData } from "../../ops/seo";
import { disableAnalyticsInPreview, isPreviewMode } from "../../ops/preview";

const LOCALE_PREFIX_RE = /^\/(zh|en)(?=\/|$)/;

interface PagePromotions {
    announcement?: PromotionItem;
    exitIntent?: PromotionItem;
    stickyCta?: PromotionItem;
}

export const Layout: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { pathname } = useLocation();
    const language = i18n.language;

    // 与 App.tsx 一致：路径前缀优先，其次跟随当前语言
    const locale = useMemo(() => {
        const fromPath = LOCALE_PREFIX_RE.exec(pathname)?.[1];
        if (fromPath) return fromPath;
        return (language || "").toLowerCase().startsWith("en") ? "en" : "zh";
    }, [pathname, language]);

    const [config, setConfig] = useState<OpsConfig | undefined>(() => getCachedConfig(locale));
    const [preview, setPreview] = useState(() => isPreviewMode());

    // 挂载 / 语言变化时加载配置；异步完成后由订阅回调驱动重渲染
    useEffect(() => {
        let active = true;
        setConfig(getCachedConfig(locale));
        void loadOpsConfig(locale).then((next) => {
            if (active) setConfig(next);
        });
        const unsubscribe = subscribeConfig((changedLocale, next) => {
            if (active && changedLocale === locale) setConfig(next);
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, [locale]);

    // 每种类型只取第一个「启用且匹配当前路径」的推广位
    const promotions = useMemo<PagePromotions>(() => {
        const pick = (type: PromotionItem["type"]) =>
            config?.promotions.find(
                (item) => item.type === type && matchesPromotionPage(item.pages, pathname),
            );
        return {
            announcement: pick("announcement"),
            exitIntent: pick("exit_intent"),
            stickyCta: pick("sticky_cta"),
        };
    }, [config, pathname]);

    useEffect(() => {
        applySeo(pathname, locale);
        applyStructuredData(pathname, locale);
    }, [pathname, locale]);

    useEffect(() => {
        if (!isPreviewMode()) return;
        // 站点内跳转进入预览链接时也要立刻关闭埋点
        disableAnalyticsInPreview();
        setPreview(true);
    }, [pathname]);

    return (
        <div
            className="flex h-[100dvh] min-h-screen flex-col"
            style={{ background: "var(--kn-paper)", color: "var(--kn-ink)" }}
        >
            <RouteAnalytics />
            <LangSync />
            <div className="absolute" id="ref"></div>
            {promotions.announcement && (
                <AnnouncementBar key={promotions.announcement.id} promotion={promotions.announcement} />
            )}
            <header>
                <Header />
            </header>
            <ScrollArea className="min-h-0 flex-1">
                <main>
                    <Outlet />
                </main>
                <Footer />
            </ScrollArea>
            {promotions.stickyCta && (
                <StickyCta key={promotions.stickyCta.id} promotion={promotions.stickyCta} />
            )}
            {promotions.exitIntent && (
                <ExitIntentModal key={promotions.exitIntent.id} promotion={promotions.exitIntent} />
            )}
            <ConsentBanner />
            {preview && (
                <div
                    className="fixed right-3 top-3 z-[70] rounded-full border px-3 py-1 text-xs font-medium shadow-sm"
                    style={{
                        background: "var(--kn-paper)",
                        color: "var(--kn-ink-soft)",
                        borderColor: "var(--kn-line)",
                    }}
                >
                    {t("ops.preview-badge")}
                </div>
            )}
        </div>
    );
};
