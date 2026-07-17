import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileText, Search, Sparkles } from "@kn/icon";
import request from "../../utils/request";
import { useTranslation } from "@kn/common";
import { Reveal } from "../../components/Reveal";
import { GITHUB_ISSUES_URL, LIVE_DEMO_URL } from "../../constants/links";

interface TemplateItem {
    id?: string | number;
    name?: string;
    description?: string;
    category?: string;
}

interface FilterItem {
    key: string;
    labelKey: string;
    scene: "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";
    icon: string;
}

const FILTERS: FilterItem[] = [
    { key: "all", labelKey: "templates.filter-all", scene: "bitable", icon: "📚" },
    { key: "productivity", labelKey: "templates.filter-productivity", scene: "editor", icon: "⚡" },
    { key: "work", labelKey: "templates.filter-work", scene: "collab", icon: "💼" },
    { key: "personal", labelKey: "templates.filter-personal", scene: "ai", icon: "🏠" },
    { key: "study", labelKey: "templates.filter-study", scene: "canvas", icon: "📖" },
    { key: "health", labelKey: "templates.filter-health", scene: "collab", icon: "❤️" },
    { key: "finance", labelKey: "templates.filter-finance", scene: "selfhost", icon: "💰" },
];

const PREVIEW_SCENES: Array<"editor" | "bitable" | "canvas" | "collab" | "ai" | "selfhost"> = [
    "editor",
    "bitable",
    "canvas",
    "collab",
    "ai",
    "selfhost",
    "editor",
    "canvas",
];

/** CSS-only mini preview varying by scene. */
const MiniPreview: React.FC<{ index: number }> = ({ index }) => {
    const scene = PREVIEW_SCENES[index % PREVIEW_SCENES.length];
    const layouts = [
        // Editor / doc
        <div className="p-3 space-y-1.5" key="doc">
            <div className="h-2.5 rounded" style={{ width: "60%", background: `var(--scene-${scene}-500)`, opacity: 0.4 }} />
            <div className="h-2 rounded" style={{ background: "var(--kn-paper)" }} />
            <div className="h-2 rounded" style={{ width: "85%", background: "var(--kn-paper)" }} />
            <div className="h-2 rounded" style={{ width: "70%", background: "var(--kn-paper)" }} />
            <div className="mt-3 h-8 rounded" style={{ background: `var(--scene-${scene}-100)` }} />
        </div>,
        // Kanban 3-col
        <div className="p-3 grid grid-cols-3 gap-1.5" key="kanban">
            {["a", "b", "c"].map((c) => (
                <div key={c} className="space-y-1.5">
                    <div className="h-2 rounded" style={{ background: `var(--scene-${scene}-500)`, opacity: 0.4 }} />
                    <div className="h-6 rounded" style={{ background: "var(--kn-paper)" }} />
                    <div className="h-6 rounded" style={{ background: "var(--kn-paper)" }} />
                </div>
            ))}
        </div>,
        // Calendar
        <div className="p-3 grid grid-cols-7 gap-1" key="cal">
            {Array.from({ length: 21 }).map((_, i) => (
                <div key={i} className="aspect-square rounded" style={{ background: i % 5 === 2 ? `var(--scene-${scene}-500)` : "var(--kn-paper)", opacity: i % 5 === 2 ? 0.6 : 1 }} />
            ))}
        </div>,
        // Gallery
        <div className="p-3 grid grid-cols-2 gap-1.5" key="gallery">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-video rounded" style={{ background: i % 2 === 0 ? `var(--scene-${scene}-100)` : "var(--kn-paper)" }} />
            ))}
        </div>,
    ];
    return (
        <div
            className="w-full h-full"
            style={{ background: `linear-gradient(135deg, var(--scene-${scene}-50), var(--scene-${scene}-100))` }}
        >
            {layouts[index % layouts.length]}
        </div>
    );
};

export const Templates: React.FC = () => {
    const { t } = useTranslation();
    const [templates, setTemplates] = useState<TemplateItem[]>([]);
    const [selectedKey, setSelectedKey] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        request({ url: "/knowledge-wiki/space/public/templates", method: "GET" })
            .then((res: { data?: { records?: TemplateItem[] } }) => {
                setTemplates(res?.data?.records ?? []);
            })
            .catch(() => setTemplates([]))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return templates.filter((tpl) => {
            const catMatch =
                selectedKey === "all" ||
                (tpl.category ?? "").toLowerCase().includes(selectedKey.toLowerCase());
            const qMatch =
                !q ||
                (tpl.name ?? "").toLowerCase().includes(q) ||
                (tpl.description ?? "").toLowerCase().includes(q);
            return catMatch && qMatch;
        });
    }, [templates, selectedKey, searchQuery]);

    const currentScene = FILTERS.find((f) => f.key === selectedKey)?.scene ?? "bitable";

    return (
        <div>
            {/* Hero */}
            <section className="relative overflow-hidden hero-paper">
                <div className="container-padding pt-16 pb-14 md:pt-20 md:pb-16 text-center relative z-10">
                    <span
                        className="chip inline-flex"
                        style={{ background: "var(--scene-bitable-50)", color: "var(--scene-bitable-600)", borderColor: "transparent" }}
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        {t("templates.badge")}
                    </span>
                    <h1
                        className="mt-6 font-serif text-4xl md:text-6xl font-semibold tracking-tight"
                        style={{ color: "var(--kn-ink)" }}
                    >
                        {t("templates.title-1")}
                        <span className="gradient-text"> {t("templates.title-2")}</span>
                    </h1>
                    <p className="mt-4 text-lg max-w-2xl mx-auto" style={{ color: "var(--kn-ink-soft)" }}>
                        {t("templates.desc")}
                    </p>

                    {/* Search */}
                    <div className="mt-8 max-w-xl mx-auto relative">
                        <Search
                            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                            style={{ color: "var(--kn-ink-soft)" }}
                        />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t("templates.search-placeholder")}
                            className="w-full h-12 pl-11 pr-4 rounded-xl outline-none border transition-colors"
                            style={{
                                background: "var(--kn-paper)",
                                borderColor: "var(--kn-line)",
                                color: "var(--kn-ink)",
                            }}
                        />
                    </div>
                </div>
            </section>

            {/* Filter chips */}
            <section className="sticky top-16 z-30 py-4 border-b glass" style={{ borderColor: "var(--kn-line)" }}>
                <div className="container-padding">
                    <div className="flex flex-wrap gap-2">
                        {FILTERS.map((f) => {
                            const active = selectedKey === f.key;
                            return (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setSelectedKey(f.key)}
                                    className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all border"
                                    style={{
                                        background: active ? `var(--scene-${f.scene}-500)` : "var(--kn-paper)",
                                        color: active ? "var(--kn-paper)" : "var(--kn-ink-soft)",
                                        borderColor: active ? `var(--scene-${f.scene}-500)` : "var(--kn-line)",
                                    }}
                                >
                                    <span>{f.icon}</span>
                                    {t(f.labelKey)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Grid */}
            <section className="section-padding">
                <div className="container-padding">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="font-serif text-2xl md:text-3xl font-semibold tracking-tight" style={{ color: "var(--kn-ink)" }}>
                            {t("templates.popular-title")}
                        </h2>
                        <span className="text-sm" style={{ color: "var(--kn-ink-soft)" }}>
                            {filtered.length} {t("templates.templates-found")}
                        </span>
                    </div>

                    {loading && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="card-lift p-0 overflow-hidden animate-pulse">
                                    <div className="h-40" style={{ background: "var(--kn-paper-2)" }} />
                                    <div className="p-5 space-y-3">
                                        <div className="h-3 rounded w-1/3" style={{ background: "var(--kn-paper-2)" }} />
                                        <div className="h-4 rounded w-2/3" style={{ background: "var(--kn-paper-2)" }} />
                                        <div className="h-2 rounded w-full" style={{ background: "var(--kn-paper-2)" }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && filtered.length === 0 && (
                        <div className="text-center py-20">
                            <div className="mx-auto w-16 h-16 rounded-2xl grid place-items-center mb-4" style={{ background: "var(--kn-paper-2)" }}>
                                <FileText className="w-7 h-7" style={{ color: "var(--kn-ink-soft)" }} />
                            </div>
                            <div className="font-semibold" style={{ color: "var(--kn-ink)" }}>{t("templates.empty-title")}</div>
                            <p className="mt-1 text-sm" style={{ color: "var(--kn-ink-soft)" }}>
                                {t("templates.empty-desc")}
                            </p>
                            <button
                                type="button"
                                onClick={() => { setSelectedKey("all"); setSearchQuery(""); }}
                                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
                                style={{ color: `var(--scene-${currentScene}-600)` }}
                            >
                                {t("templates.clear-filters")}
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {!loading && filtered.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {filtered.map((tpl, i) => (
                                <Reveal key={String(tpl.id ?? i)} delay={i * 30}>
                                    <a
                                        href={LIVE_DEMO_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="card-lift group block p-0 overflow-hidden"
                                    >
                                        <div className="h-40 overflow-hidden relative">
                                            <MiniPreview index={i} />
                                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: "rgba(0,0,0,0.12)" }}>
                                                <span
                                                    className="chip"
                                                    style={{ background: "var(--kn-paper)", color: "var(--kn-ink)", borderColor: "transparent" }}
                                                >
                                                    {t("templates.use-template")} <ArrowRight className="w-3.5 h-3.5" />
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-5">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span
                                                    className="chip"
                                                    style={{
                                                        background: `var(--scene-${PREVIEW_SCENES[i % PREVIEW_SCENES.length]}-50)`,
                                                        color: `var(--scene-${PREVIEW_SCENES[i % PREVIEW_SCENES.length]}-600)`,
                                                        borderColor: "transparent",
                                                    }}
                                                >
                                                    {tpl.category || t("home.templates-tag-default")}
                                                </span>
                                            </div>
                                            <h3 className="font-semibold line-clamp-1" style={{ color: "var(--kn-ink)" }}>
                                                {tpl.name}
                                            </h3>
                                            <p className="mt-1 text-sm line-clamp-2 min-h-[40px]" style={{ color: "var(--kn-ink-soft)" }}>
                                                {tpl.description}
                                            </p>
                                        </div>
                                    </a>
                                </Reveal>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Submit CTA */}
            <section className="section-padding section-alt">
                <div className="container-padding">
                    <Reveal>
                        <div
                            className="max-w-3xl mx-auto text-center rounded-2xl p-10 md:p-14 border"
                            style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper)" }}
                        >
                            <span
                                className="chip"
                                style={{ background: "var(--scene-ai-50)", color: "var(--scene-ai-600)", borderColor: "transparent" }}
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                {t("templates.submit-badge")}
                            </span>
                            <h3 className="mt-5 font-serif text-3xl md:text-4xl font-semibold tracking-tight" style={{ color: "var(--kn-ink)" }}>
                                {t("templates.submit-title")}
                            </h3>
                            <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                                {t("templates.submit-desc")}
                            </p>
                            <a
                                href={GITHUB_ISSUES_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-6 inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium btn-primary"
                            >
                                {t("templates.submit-cta")}
                                <ArrowRight className="w-4 h-4" />
                            </a>
                        </div>
                    </Reveal>
                </div>
            </section>
        </div>
    );
};
