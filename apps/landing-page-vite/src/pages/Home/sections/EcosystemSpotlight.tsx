import React from "react";
import { Link, useTranslation } from "@kn/common";
import {
    Sparkles,
    Database,
    Palette,
    Workflow,
    GitBranch,
    Network,
    Link2,
    MessageSquare,
    BarChart3,
    PlayCircle,
    Music,
    Mic,
    ArrowRight,
} from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";
import { PluginCard } from "../../../components/PluginCard";
import { LIVE_DEMO_URL } from "../../../constants/links";
import { buildTrackedUrl, track } from "../../../ops/analytics";
import type { FeaturedItem } from "../../../ops/config";
import { readNumber, readString, type SectionProps } from "../../../ops/section-props";

type Scene = "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";

interface Item {
    icon: React.ReactNode;
    nameKey: string;
    descKey: string;
    scene: Scene;
    tagKey?: string;
}

const ITEMS: Item[] = [
    { icon: <Sparkles className="h-5 w-5" />, nameKey: "home.eco-ai-name", descKey: "home.eco-ai-desc", scene: "ai", tagKey: "home.eco-tag-ai" },
    { icon: <Database className="h-5 w-5" />, nameKey: "home.eco-bitable-name", descKey: "home.eco-bitable-desc", scene: "bitable", tagKey: "home.eco-tag-data" },
    { icon: <Palette className="h-5 w-5" />, nameKey: "home.eco-excalidraw-name", descKey: "home.eco-excalidraw-desc", scene: "canvas", tagKey: "home.eco-tag-canvas" },
    { icon: <Workflow className="h-5 w-5" />, nameKey: "home.eco-drawio-name", descKey: "home.eco-drawio-desc", scene: "canvas", tagKey: "home.eco-tag-canvas" },
    { icon: <GitBranch className="h-5 w-5" />, nameKey: "home.eco-mermaid-name", descKey: "home.eco-mermaid-desc", scene: "canvas", tagKey: "home.eco-tag-diagram" },
    { icon: <Network className="h-5 w-5" />, nameKey: "home.eco-mindmap-name", descKey: "home.eco-mindmap-desc", scene: "bitable", tagKey: "home.eco-tag-canvas" },
    { icon: <Link2 className="h-5 w-5" />, nameKey: "home.eco-blockref-name", descKey: "home.eco-blockref-desc", scene: "editor", tagKey: "home.eco-tag-editor" },
    { icon: <MessageSquare className="h-5 w-5" />, nameKey: "home.eco-comment-name", descKey: "home.eco-comment-desc", scene: "collab", tagKey: "home.eco-tag-collab" },
    { icon: <BarChart3 className="h-5 w-5" />, nameKey: "home.eco-chart-name", descKey: "home.eco-chart-desc", scene: "bitable", tagKey: "home.eco-tag-data" },
    { icon: <PlayCircle className="h-5 w-5" />, nameKey: "home.eco-bilibili-name", descKey: "home.eco-bilibili-desc", scene: "ai", tagKey: "home.eco-tag-embed" },
    { icon: <Music className="h-5 w-5" />, nameKey: "home.eco-music-name", descKey: "home.eco-music-desc", scene: "ai", tagKey: "home.eco-tag-embed" },
    { icon: <Mic className="h-5 w-5" />, nameKey: "home.eco-speech-name", descKey: "home.eco-speech-desc", scene: "ai", tagKey: "home.eco-tag-ai" },
];

/** 运营精选插件 → 产品侧插件详情深链（与模板一致）。 */
const resolvePluginHref = (targetId: string): string => LIVE_DEMO_URL + "/plugin/" + targetId;

export interface EcosystemSpotlightSectionProps {
    props?: SectionProps;
    /** 运营在 admin「市场精选位」配置的精选插件（FEATURED）。 */
    featured?: FeaturedItem[];
}

export const EcosystemSpotlight: React.FC<EcosystemSpotlightSectionProps> = ({
    props: sectionProps,
    featured = [],
}) => {
    const { t } = useTranslation();
    const limit = readNumber(sectionProps, "limit", ITEMS.length, 1, ITEMS.length);

    const featuredPlugins = featured
        .filter((item) => item.targetType === "plugin")
        .sort((a, b) => a.position - b.position);

    const items = ITEMS.slice(0, limit);

    return (
        <section id="ecosystem" className="section-padding" style={{ background: "var(--kn-paper)" }}>
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        index="04"
                        eyebrow={readString(sectionProps, "eyebrow", t("home.ecosystem-eyebrow"))}
                        title={readString(sectionProps, "title", t("home.ecosystem-title"))}
                        description={readString(sectionProps, "desc", t("home.ecosystem-desc"))}
                    />
                </Reveal>

                {/* Ops-curated featured plugins (admin → MarketOps → FEATURED) */}
                {featuredPlugins.length > 0 && (
                    <Reveal>
                        <div className="mt-12">
                            <div className="mb-4 flex items-center gap-2.5">
                                <span className="h-px w-6" style={{ background: "var(--kn-accent)" }} />
                                <span className="kicker" style={{ color: "var(--kn-ink-soft)" }}>{t("home.eco-featured-label")}</span>
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {featuredPlugins.map((item) => (
                                    <a
                                        key={item.targetType + ":" + item.targetId}
                                        href={buildTrackedUrl(resolvePluginHref(item.targetId), {
                                            utm_source: "kotion-landing",
                                            utm_medium: "featured",
                                            utm_campaign: "ecosystem",
                                            utm_content: item.targetId,
                                        })}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={() => track("cta_click", { location: "ecosystem-featured", target: item.targetId })}
                                        className="card-lift group flex items-start justify-between gap-4 p-5"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[15px] font-semibold" style={{ color: "var(--kn-ink)" }}>
                                                    {item.name || item.targetId}
                                                </span>
                                                {item.badge && (
                                                    <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--kn-accent-ink)" }}>
                                                        {item.badge}
                                                    </span>
                                                )}
                                            </div>
                                            {item.blurb && (
                                                <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                                                    {item.blurb}
                                                </p>
                                            )}
                                        </div>
                                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: "var(--kn-ink-mute)" }} />
                                    </a>
                                ))}
                            </div>
                        </div>
                    </Reveal>
                )}

                {/* Official plugin grid */}
                <div className="mt-12 hidden grid-cols-3 gap-4 md:grid lg:grid-cols-4 md:auto-rows-fr">
                    {items.map((it, i) => (
                        <Reveal key={it.nameKey} delay={i * 30} className="h-full">
                            <PluginCard
                                icon={it.icon}
                                name={t(it.nameKey)}
                                description={t(it.descKey)}
                                scene={it.scene}
                                tag={it.tagKey ? t(it.tagKey) : undefined}
                            />
                        </Reveal>
                    ))}
                </div>

                {/* Mobile horizontal scroll */}
                <div className="-mx-5 mt-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-4 md:hidden">
                    {items.map((it) => (
                        <div key={it.nameKey} className="min-w-[75%] snap-start">
                            <PluginCard
                                icon={it.icon}
                                name={t(it.nameKey)}
                                description={t(it.descKey)}
                                scene={it.scene}
                                tag={it.tagKey ? t(it.tagKey) : undefined}
                            />
                        </div>
                    ))}
                </div>

                <Reveal>
                    <div className="mt-10">
                        <Link to="/plugins" className="link-accent inline-flex items-center gap-2 text-sm font-medium">
                            {t("home.ecosystem-explore")}
                        </Link>
                    </div>
                </Reveal>
            </div>
        </section>
    );
};
