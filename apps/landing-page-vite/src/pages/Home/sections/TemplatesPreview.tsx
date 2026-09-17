import React, { useEffect, useMemo, useState } from "react";
import { Link, useTranslation } from "@kn/common";
import { ArrowRight, FileText } from "@kn/icon";
import request from "../../../utils/request";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";
import { LIVE_DEMO_URL } from "../../../constants/links";
import { buildTrackedUrl, track } from "../../../ops/analytics";
import { appendHandoff } from "../../../ops/attribution";
import type { FeaturedItem } from "../../../ops/config";
import { readNumber, readString, type SectionProps } from "../../../ops/section-props";

interface TemplateItem {
    id?: string | number;
    name?: string;
    description?: string;
    category?: string;
    [k: string]: unknown;
}

/**
 * 模板卡片外链：优先记录自带 URL / path，其次按 id 深链，最后回退示例站首页。
 */
function resolveTemplateUrl(tpl: TemplateItem): string {
    const url = tpl.url;
    if (typeof url === "string" && url.startsWith("http")) return url;
    const path = tpl.path;
    if (typeof path === "string" && path.startsWith("/")) return LIVE_DEMO_URL + path;
    const id = tpl.id;
    if (id !== undefined && id !== null && String(id) !== "") return LIVE_DEMO_URL + "/template/" + id;
    return LIVE_DEMO_URL;
}

/** 中性线框预览，替代原先的六色渐变占位图。 */
const MiniPreview: React.FC<{ index: number }> = ({ index }) => (
    <div className="relative h-32 overflow-hidden border-b" style={{ background: "var(--kn-paper-2)", borderColor: "var(--kn-line)" }}>
        <div
            className="absolute inset-x-4 top-4 h-[3px] rounded-full"
            style={{ background: index % 3 === 0 ? "var(--kn-accent)" : "var(--kn-line-strong)" }}
        />
        <div className="absolute inset-x-4 bottom-4 top-8 space-y-1.5">
            <div className="h-3 w-1/2 rounded" style={{ background: "var(--kn-line-strong)", opacity: 0.7 }} />
            <div className="h-2 w-full rounded" style={{ background: "var(--kn-line)" }} />
            <div className="h-2 w-5/6 rounded" style={{ background: "var(--kn-line)" }} />
            <div className="h-2 w-2/3 rounded" style={{ background: "var(--kn-line)" }} />
            <div className="grid grid-cols-3 gap-1.5 pt-1.5">
                <div className="h-6 rounded" style={{ background: "var(--kn-paper)" }} />
                <div className="h-6 rounded" style={{ background: "var(--kn-paper)" }} />
                <div className="h-6 rounded" style={{ background: "var(--kn-paper)" }} />
            </div>
        </div>
    </div>
);

export interface TemplatesPreviewSectionProps {
    props?: SectionProps;
    /** 运营在 admin「市场精选位」配置的精选模板（FEATURED）。 */
    featured?: FeaturedItem[];
}

export const TemplatesPreview: React.FC<TemplatesPreviewSectionProps> = ({ props: sectionProps, featured = [] }) => {
    const { t } = useTranslation();
    const [templates, setTemplates] = useState<TemplateItem[]>([]);
    const limit = readNumber(sectionProps, "limit", 6, 1, 12);

    useEffect(() => {
        let cancelled = false;
        request({ url: "/knowledge-wiki/space/public/templates", method: "GET" })
            .then((res: { data?: { records?: TemplateItem[] } }) => {
                if (!cancelled) setTemplates(res?.data?.records ?? []);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const featuredTemplates = useMemo(
        () => featured.filter((item) => item.targetType === "template").sort((a, b) => a.position - b.position),
        [featured],
    );

    const featuredById = useMemo(() => {
        const map = new Map<string, FeaturedItem>();
        for (const item of featuredTemplates) map.set(String(item.targetId), item);
        return map;
    }, [featuredTemplates]);

    // 精选位优先，其后按产品侧返回顺序补足
    const ordered = useMemo(() => {
        if (featuredTemplates.length === 0) return templates.slice(0, limit);
        const seen = new Set<string>();
        const result: TemplateItem[] = [];
        for (const item of featuredTemplates) {
            const key = String(item.targetId);
            const hit = templates.find((tpl) => String(tpl.id) === key);
            result.push(hit ?? { id: item.targetId, name: item.name, description: item.blurb });
            seen.add(key);
        }
        for (const tpl of templates) {
            if (seen.has(String(tpl.id))) continue;
            result.push(tpl);
        }
        return result.slice(0, limit);
    }, [templates, featuredTemplates, limit]);

    const fallback = Array.from({ length: limit }).map((_, i) => ({
        id: i,
        name: t("home.templates-fallback-" + ((i % 3) + 1)),
        description: t("home.templates-fallback-desc"),
    }));

    const cards = ordered.length > 0 ? ordered : fallback;

    return (
        <section className="section-padding" style={{ background: "var(--kn-paper)" }}>
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        index="06"
                        eyebrow={readString(sectionProps, "eyebrow", t("home.templates-preview-eyebrow"))}
                        title={readString(sectionProps, "title", t("home.templates-preview-title"))}
                        description={readString(sectionProps, "desc", t("home.templates-preview-desc"))}
                    />
                </Reveal>

                <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {cards.map((tpl, i) => {
                        const curated = featuredById.get(String(tpl.id));
                        return (
                            <Reveal key={String(tpl.id ?? i)} delay={i * 40}>
                                <a
                                    href={appendHandoff(
                                        buildTrackedUrl(resolveTemplateUrl(tpl), {
                                            utm_source: "kotion-landing",
                                            utm_medium: "template",
                                            utm_campaign: "home-preview",
                                            utm_content: String(tpl.id ?? tpl.name ?? i),
                                        }),
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => track("template_use", { templateId: tpl.id, templateName: tpl.name, location: "home-preview" })}
                                    className="card-lift group block overflow-hidden p-0"
                                >
                                    <MiniPreview index={i} />
                                    <div className="p-5">
                                        <div className="mb-2 flex items-center gap-2">
                                            <FileText className="h-3.5 w-3.5" style={{ color: "var(--kn-ink-mute)" }} />
                                            <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: curated ? "var(--kn-accent-ink)" : "var(--kn-ink-mute)" }}>
                                                {curated?.badge || t("home.templates-tag-default")}
                                            </span>
                                        </div>
                                        <div className="line-clamp-1 font-semibold" style={{ color: "var(--kn-ink)" }}>
                                            {tpl.name || t("home.templates-fallback-1")}
                                        </div>
                                        <div className="mt-1 line-clamp-2 text-sm leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                                            {(curated?.blurb || tpl.description) || t("home.templates-fallback-desc")}
                                        </div>
                                        <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium link-accent opacity-0 transition-opacity group-hover:opacity-100">
                                            {t("home.templates-use")} <ArrowRight className="h-3.5 w-3.5" />
                                        </div>
                                    </div>
                                </a>
                            </Reveal>
                        );
                    })}
                </div>

                <Reveal>
                    <div className="mt-10">
                        <Link to="/templates" className="link-accent inline-flex items-center gap-2 text-sm font-medium">
                            {t("home.templates-browse-all")}
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </Reveal>
            </div>
        </section>
    );
};
