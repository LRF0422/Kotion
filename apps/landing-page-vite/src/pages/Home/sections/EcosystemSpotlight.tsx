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

type Scene = "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";

interface Item {
    icon: React.ReactNode;
    nameKey: string;
    descKey: string;
    scene: Scene;
    tagKey?: string;
}

const ITEMS: Item[] = [
    { icon: <Sparkles className="w-5 h-5" />, nameKey: "home.eco-ai-name", descKey: "home.eco-ai-desc", scene: "ai", tagKey: "home.eco-tag-ai" },
    { icon: <Database className="w-5 h-5" />, nameKey: "home.eco-bitable-name", descKey: "home.eco-bitable-desc", scene: "bitable", tagKey: "home.eco-tag-data" },
    { icon: <Palette className="w-5 h-5" />, nameKey: "home.eco-excalidraw-name", descKey: "home.eco-excalidraw-desc", scene: "canvas", tagKey: "home.eco-tag-canvas" },
    { icon: <Workflow className="w-5 h-5" />, nameKey: "home.eco-drawio-name", descKey: "home.eco-drawio-desc", scene: "canvas", tagKey: "home.eco-tag-canvas" },
    { icon: <GitBranch className="w-5 h-5" />, nameKey: "home.eco-mermaid-name", descKey: "home.eco-mermaid-desc", scene: "canvas", tagKey: "home.eco-tag-diagram" },
    { icon: <Network className="w-5 h-5" />, nameKey: "home.eco-mindmap-name", descKey: "home.eco-mindmap-desc", scene: "bitable", tagKey: "home.eco-tag-canvas" },
    { icon: <Link2 className="w-5 h-5" />, nameKey: "home.eco-blockref-name", descKey: "home.eco-blockref-desc", scene: "editor", tagKey: "home.eco-tag-editor" },
    { icon: <MessageSquare className="w-5 h-5" />, nameKey: "home.eco-comment-name", descKey: "home.eco-comment-desc", scene: "collab", tagKey: "home.eco-tag-collab" },
    { icon: <BarChart3 className="w-5 h-5" />, nameKey: "home.eco-chart-name", descKey: "home.eco-chart-desc", scene: "bitable", tagKey: "home.eco-tag-data" },
    { icon: <PlayCircle className="w-5 h-5" />, nameKey: "home.eco-bilibili-name", descKey: "home.eco-bilibili-desc", scene: "ai", tagKey: "home.eco-tag-embed" },
    { icon: <Music className="w-5 h-5" />, nameKey: "home.eco-music-name", descKey: "home.eco-music-desc", scene: "ai", tagKey: "home.eco-tag-embed" },
    { icon: <Mic className="w-5 h-5" />, nameKey: "home.eco-speech-name", descKey: "home.eco-speech-desc", scene: "ai", tagKey: "home.eco-tag-ai" },
];

export const EcosystemSpotlight: React.FC = () => {
    const { t } = useTranslation();
    return (
        <section id="ecosystem" className="section-padding" style={{ background: "var(--kn-paper)" }}>
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        eyebrow={t("home.ecosystem-eyebrow")}
                        title={t("home.ecosystem-title")}
                        description={t("home.ecosystem-desc")}
                        scene="ai"
                    />
                </Reveal>

                {/* desktop grid */}
                <div className="hidden md:grid mt-14 grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr">
                    {ITEMS.map((it, i) => (
                        <Reveal key={it.nameKey} delay={i * 40} className="h-full">
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

                {/* mobile horizontal scroll */}
                <div className="md:hidden mt-10 -mx-4 px-4 overflow-x-auto flex gap-3 snap-x snap-mandatory pb-4">
                    {ITEMS.map((it) => (
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
                    <div className="mt-10 text-center">
                        <Link
                            to="/plugins"
                            className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-80"
                            style={{ color: "var(--scene-ai-600)" }}
                        >
                            {t("home.ecosystem-explore")}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </Reveal>
            </div>
        </section>
    );
};
