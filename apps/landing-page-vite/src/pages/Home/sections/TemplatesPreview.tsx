import React, { useEffect, useState } from "react";
import { Link, useTranslation } from "@kn/common";
import { ArrowRight, FileText } from "@kn/icon";
import request from "../../../utils/request";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";
import { LIVE_DEMO_URL } from "../../../constants/links";

interface TemplateItem {
    id?: string | number;
    name?: string;
    description?: string;
    category?: string;
    [k: string]: unknown;
}

const PREVIEW_SCENES: Array<"editor" | "bitable" | "canvas" | "collab" | "ai" | "selfhost"> = [
    "editor",
    "bitable",
    "canvas",
    "collab",
    "ai",
    "selfhost",
];

const MiniPreview: React.FC<{ index: number }> = ({ index }) => {
    const scene = PREVIEW_SCENES[index % PREVIEW_SCENES.length];
    return (
        <div
            className="relative h-32 overflow-hidden"
            style={{
                background: `linear-gradient(135deg, var(--scene-${scene}-50), var(--scene-${scene}-100))`,
            }}
        >
            <div className="absolute inset-4 grid grid-cols-3 gap-1.5">
                <div className="col-span-3 h-2.5 rounded" style={{ background: `var(--scene-${scene}-500)`, opacity: 0.35 }} />
                <div className="h-8 rounded" style={{ background: "var(--kn-paper)" }} />
                <div className="h-8 rounded" style={{ background: "var(--kn-paper)" }} />
                <div className="h-8 rounded" style={{ background: `var(--scene-${scene}-500)`, opacity: 0.25 }} />
                <div className="col-span-3 h-6 rounded" style={{ background: "var(--kn-paper)" }} />
                <div className="col-span-2 h-4 rounded" style={{ background: `var(--scene-${scene}-500)`, opacity: 0.2 }} />
                <div className="h-4 rounded" style={{ background: "var(--kn-paper)" }} />
            </div>
        </div>
    );
};

export const TemplatesPreview: React.FC = () => {
    const { t } = useTranslation();
    const [templates, setTemplates] = useState<TemplateItem[]>([]);

    useEffect(() => {
        let cancelled = false;
        request({ url: "/knowledge-wiki/space/public/templates", method: "GET" })
            .then((res: { data?: { records?: TemplateItem[] } }) => {
                if (!cancelled) setTemplates(res?.data?.records?.slice(0, 6) ?? []);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <section className="section-padding" style={{ background: "var(--kn-paper)" }}>
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        eyebrow={t("home.templates-preview-eyebrow")}
                        title={t("home.templates-preview-title")}
                        description={t("home.templates-preview-desc")}
                        scene="bitable"
                    />
                </Reveal>

                <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {(templates.length > 0
                        ? templates
                        : Array.from({ length: 6 }).map((_, i) => ({ id: i, name: t(`home.templates-fallback-${(i % 3) + 1}`), description: t("home.templates-fallback-desc") }))
                    ).map((tpl, i) => (
                        <Reveal key={String(tpl.id ?? i)} delay={i * 50}>
                            <a
                                href={LIVE_DEMO_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="card-lift group block overflow-hidden p-0"
                            >
                                <MiniPreview index={i} />
                                <div className="p-5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <FileText className="w-4 h-4" style={{ color: "var(--scene-bitable-600)" }} />
                                        <span className="chip" style={{ background: "var(--scene-bitable-50)", color: "var(--scene-bitable-600)" }}>
                                            {((tpl as { category?: string }).category) || t("home.templates-tag-default")}
                                        </span>
                                    </div>
                                    <div className="font-semibold line-clamp-1" style={{ color: "var(--kn-ink)" }}>
                                        {tpl.name || t("home.templates-fallback-1")}
                                    </div>
                                    <div className="mt-1 text-sm line-clamp-2" style={{ color: "var(--kn-ink-soft)" }}>
                                        {tpl.description || t("home.templates-fallback-desc")}
                                    </div>
                                    <div className="mt-3 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1" style={{ color: "var(--scene-bitable-600)" }}>
                                        {t("home.templates-use")} <ArrowRight className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                            </a>
                        </Reveal>
                    ))}
                </div>

                <Reveal>
                    <div className="mt-10 text-center">
                        <Link
                            to="/templates"
                            className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-80"
                            style={{ color: "var(--scene-bitable-600)" }}
                        >
                            {t("home.templates-browse-all")}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </Reveal>
            </div>
        </section>
    );
};
