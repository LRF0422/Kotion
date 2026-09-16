import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useTranslation } from "@kn/common";
import { Hero } from "./sections/Hero";
import { StackCloud } from "./sections/StackCloud";
import { CapabilityBento } from "./sections/CapabilityBento";
import { Workflows } from "./sections/Workflows";
import { EcosystemSpotlight } from "./sections/EcosystemSpotlight";
import { EverywhereYouWork } from "./sections/EverywhereYouWork";
import { TemplatesPreview } from "./sections/TemplatesPreview";
import { OpenSource } from "./sections/OpenSource";
import { FAQ } from "./sections/FAQ";
import { FinalCTA } from "./sections/FinalCTA";
import { trackEvent } from "../../ops/analytics";
import {
    getCachedConfig,
    loadOpsConfig,
    subscribeConfig,
    type OpsConfig,
    type SectionItem,
} from "../../ops/config";

const LOCALE_PREFIX_RE = /^\/(zh|en)(?=\/|$)/;

/** 内置默认顺序：配置缺失 / 为空时的回退，保持现有叙事结构。 */
const DEFAULT_ORDER = [
    "hero",
    "stack-cloud",
    "capability-bento",
    "workflows",
    "ecosystem-spotlight",
    "everywhere-you-work",
    "templates-preview",
    "open-source",
    "faq",
    "final-cta",
] as const;

/**
 * sectionKey → 区块组件。
 *
 * 注：现有区块组件都不接受 props，因此 CMS 的 `props` 暂时不向下传递，
 * 保留给未来的可配置区块；未知 sectionKey 一律静默跳过。
 */
const SECTION_COMPONENTS: Record<string, React.ComponentType> = {
    hero: Hero,
    "stack-cloud": StackCloud,
    "capability-bento": CapabilityBento,
    workflows: Workflows,
    "ecosystem-spotlight": EcosystemSpotlight,
    "everywhere-you-work": EverywhereYouWork,
    "templates-preview": TemplatesPreview,
    "open-source": OpenSource,
    faq: FAQ,
    "final-cta": FinalCTA,
};

const DEFAULT_SECTIONS: SectionItem[] = DEFAULT_ORDER.map((sectionKey, position) => ({
    sectionKey,
    position,
    enabled: true,
}));

const SCROLL_DEPTHS = [25, 50, 75, 100] as const;

/** 页面滚动发生在 Radix ScrollArea 的 viewport 上，而不是 window。 */
const resolveScrollContainer = (node: HTMLElement | null): HTMLElement | null =>
    node ? node.closest<HTMLElement>("[data-radix-scroll-area-viewport]") : null;

export const Home: React.FC = () => {
    const { i18n } = useTranslation();
    const { pathname } = useLocation();
    const language = i18n.language;

    const locale = useMemo(() => {
        const fromPath = LOCALE_PREFIX_RE.exec(pathname)?.[1];
        if (fromPath) return fromPath;
        return (language || "").toLowerCase().startsWith("en") ? "en" : "zh";
    }, [pathname, language]);

    const [config, setConfig] = useState<OpsConfig | undefined>(() => getCachedConfig(locale));

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

    // 配置存在则按 position 排序并剔除 enabled === false / 未注册的区块，否则用默认顺序
    const sections = useMemo<SectionItem[]>(() => {
        const configured = config?.sections?.home;
        if (!configured || configured.length === 0) return DEFAULT_SECTIONS;
        return [...configured]
            .filter((item) => item.enabled !== false)
            .sort((a, b) => a.position - b.position)
            .filter((item) => Boolean(SECTION_COMPONENTS[item.sectionKey]));
    }, [config]);

    const rootRef = useRef<HTMLDivElement | null>(null);
    const seenRef = useRef<Set<string>>(new Set());

    // 单个共享 IntersectionObserver（阈值 0.5），每个区块每次页面加载只上报一次
    useEffect(() => {
        const root = rootRef.current;
        if (!root || typeof IntersectionObserver === "undefined") return;
        const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-section]"));
        if (nodes.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    // 阈值 0.5；但高于视口的区块永远达不到 0.5 比例（移动端常见），
                    // 因此额外接受「占满至少半个视口」的情况。
                    const rootHeight = entry.rootBounds?.height ?? 0;
                    const coverage = rootHeight > 0 ? entry.intersectionRect.height / rootHeight : 0;
                    const tallerThanViewport = rootHeight > 0 && entry.boundingClientRect.height >= rootHeight;
                    if (entry.intersectionRatio < 0.5 && !(tallerThanViewport && coverage >= 0.5)) continue;

                    const target = entry.target as HTMLElement;
                    const key = target.dataset.section;
                    if (!key || seenRef.current.has(key)) continue;
                    seenRef.current.add(key);
                    const rawIndex = Number(target.dataset.sectionIndex ?? "0");
                    trackEvent("section_view", {
                        section: key,
                        index: Number.isFinite(rawIndex) ? rawIndex : 0,
                    });
                    observer.unobserve(target);
                }
            },
            { threshold: [0.25, 0.5] },
        );
        for (const node of nodes) observer.observe(node);
        return () => observer.disconnect();
    }, [sections]);

    // 滚动深度 25/50/75/100，各上报一次
    useEffect(() => {
        const scroller = resolveScrollContainer(rootRef.current);
        const fired = new Set<number>();

        const onScroll = () => {
            const top = scroller ? scroller.scrollTop : window.scrollY || document.documentElement.scrollTop || 0;
            const max = scroller
                ? scroller.scrollHeight - scroller.clientHeight
                : document.documentElement.scrollHeight - window.innerHeight;
            if (max <= 0) return;
            const depth = Math.min(100, Math.round((top / max) * 100));
            for (const step of SCROLL_DEPTHS) {
                if (depth >= step && !fired.has(step)) {
                    fired.add(step);
                    trackEvent("scroll_depth", { depth: step });
                }
            }
        };

        if (scroller) {
            scroller.addEventListener("scroll", onScroll, { passive: true });
            onScroll();
            return () => scroller.removeEventListener("scroll", onScroll);
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <div ref={rootRef}>
            {sections.map((item, index) => {
                const Section = SECTION_COMPONENTS[item.sectionKey];
                if (!Section) return null;
                return (
                    <div key={item.sectionKey} data-section={item.sectionKey} data-section-index={index}>
                        <Section />
                    </div>
                );
            })}
        </div>
    );
};
