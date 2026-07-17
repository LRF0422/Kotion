import React, { useEffect, useMemo, useState } from "react";
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Rate,
} from "@kn/ui";
import {
    ArrowRight,
    DownloadIcon,
    Search,
    FaPlug,
    Sparkles,
    HeartIcon,
    Puzzle,
    Layers,
    Code,
} from "@kn/icon";
import { useTranslation, Link } from "@kn/common";
import request from "../../utils/request";
import { usePath } from "../../utils/use-path";
import { Reveal } from "../../components/Reveal";
import { DOCS_PLUGIN_DEV, GITHUB_ISSUES_URL, LIVE_DEMO_URL } from "../../constants/links";

type Scene = "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";

interface PluginRaw {
    id?: string;
    name?: string;
    developer?: string;
    description?: string;
    icon?: string;
    screenShot?: string;
    downloads?: number;
    rating?: number;
    reviews?: number;
    features?: string[];
    category?: { value?: string };
}

interface FilterItem {
    key: string;
    labelKey: string;
    icon: string;
    scene: Scene;
}

const FILTERS: FilterItem[] = [
    { key: "all", labelKey: "plugins.filter-all", icon: "🔌", scene: "ai" },
    { key: "feature", labelKey: "plugins.filter-feature", icon: "⚡", scene: "editor" },
    { key: "app", labelKey: "plugins.filter-app", icon: "📱", scene: "bitable" },
    { key: "connector", labelKey: "plugins.filter-connector", icon: "🔗", scene: "collab" },
    { key: "ai", labelKey: "plugins.filter-ai", icon: "✨", scene: "ai" },
];

const CATEGORY_SCENE: Record<string, Scene> = {
    Feature: "editor",
    App: "bitable",
    Connector: "collab",
    AI: "ai",
};

function formatNumber(num: number | undefined): string {
    if (!num) return "0";
    if (num >= 1000) return (num / 1000).toFixed(1) + "k";
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const BUILD_SNIPPET = `pnpm create @kn/plugin my-plugin

// packages/plugin-my-plugin/index.tsx
export const MyPlugin = () => (
  <ExtensionWrapper
    slashMenu={{ name: "my-block", onSelect: insert }}
    aiTools={[{ name: "summarize", run }]}
  />
);`;

export const Plugins: React.FC = () => {
    const { t } = useTranslation();
    const [plugins, setPlugins] = useState<PluginRaw[]>([]);
    const [selectedKey, setSelectedKey] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        setLoading(true);
        request({ url: "/knowledge-wiki/plugin/public/plugins", method: "GET" })
            .then((res: { data?: { records?: PluginRaw[] } }) => setPlugins(res?.data?.records ?? []))
            .catch(() => setPlugins([]))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return plugins.filter((p) => {
            const catValue = (p.category?.value || "").toLowerCase();
            const catMatch =
                selectedKey === "all" ||
                catValue.includes(selectedKey.toLowerCase());
            const qMatch =
                !q ||
                (p.name ?? "").toLowerCase().includes(q) ||
                (p.description ?? "").toLowerCase().includes(q);
            return catMatch && qMatch;
        });
    }, [plugins, selectedKey, searchQuery]);

    const gotoInstall = (id?: string) => {
        if (!id) return;
        window.open(`${LIVE_DEMO_URL}?requestPluginId=${id}`, "_blank");
    };

    return (
        <div>
            {/* Hero */}
            <section className="relative overflow-hidden hero-paper">
                <div className="container-padding pt-16 pb-14 md:pt-20 md:pb-16 text-center relative z-10">
                    <span
                        className="chip inline-flex"
                        style={{ background: "var(--scene-ai-50)", color: "var(--scene-ai-600)", borderColor: "transparent" }}
                    >
                        <FaPlug className="w-3.5 h-3.5" />
                        {t("plugins.badge")}
                    </span>
                    <h1
                        className="mt-6 font-serif text-4xl md:text-6xl font-semibold tracking-tight"
                        style={{ color: "var(--kn-ink)" }}
                    >
                        {t("plugins.title-1")}
                        <span className="gradient-text"> {t("plugins.title-2")}</span>
                    </h1>
                    <p className="mt-4 text-lg max-w-2xl mx-auto" style={{ color: "var(--kn-ink-soft)" }}>
                        {t("plugins.desc")}
                    </p>

                    <div className="mt-8 max-w-xl mx-auto relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--kn-ink-soft)" }} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t("plugins.search-placeholder")}
                            className="w-full h-12 pl-11 pr-4 rounded-xl outline-none border transition-colors"
                            style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)", color: "var(--kn-ink)" }}
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
                            {t("plugins.popular-title")}
                        </h2>
                        <span className="text-sm" style={{ color: "var(--kn-ink-soft)" }}>
                            {filtered.length} {t("plugins.plugins-found")}
                        </span>
                    </div>

                    {loading && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="card-lift p-5 animate-pulse">
                                    <div className="flex gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-lg" style={{ background: "var(--kn-paper-2)" }} />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-3 rounded" style={{ background: "var(--kn-paper-2)" }} />
                                            <div className="h-2 rounded w-2/3" style={{ background: "var(--kn-paper-2)" }} />
                                        </div>
                                    </div>
                                    <div className="h-2 rounded w-full" style={{ background: "var(--kn-paper-2)" }} />
                                    <div className="h-2 rounded w-5/6 mt-2" style={{ background: "var(--kn-paper-2)" }} />
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && filtered.length === 0 && (
                        <div className="text-center py-20">
                            <div className="mx-auto w-16 h-16 rounded-2xl grid place-items-center mb-4" style={{ background: "var(--kn-paper-2)" }}>
                                <FaPlug className="w-7 h-7" style={{ color: "var(--kn-ink-soft)" }} />
                            </div>
                            <div className="font-semibold" style={{ color: "var(--kn-ink)" }}>{t("plugins.empty-title")}</div>
                            <p className="mt-1 text-sm" style={{ color: "var(--kn-ink-soft)" }}>{t("plugins.empty-desc")}</p>
                            <button
                                type="button"
                                onClick={() => { setSelectedKey("all"); setSearchQuery(""); }}
                                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
                                style={{ color: "var(--scene-ai-600)" }}
                            >
                                {t("templates.clear-filters")}
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {!loading && filtered.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 auto-rows-fr">
                            {filtered.map((plugin, index) => {
                                const catValue = plugin.category?.value || "Feature";
                                const scene: Scene = CATEGORY_SCENE[catValue] ?? "editor";
                                return (
                                    <Reveal key={plugin.id ?? index} delay={index * 30} className="h-full">
                                        <div className="card-lift group p-5 h-full flex flex-col">
                                            <div className="flex items-start gap-4 mb-4">
                                                <div className="relative flex-shrink-0">
                                                    <img
                                                        src={usePath(plugin.icon ?? "")}
                                                        alt={plugin.name}
                                                        className="w-12 h-12 rounded-lg object-cover"
                                                        style={{ background: `var(--scene-${scene}-100)` }}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold text-base truncate" style={{ color: "var(--kn-ink)" }}>
                                                        {plugin.name}
                                                    </h3>
                                                    <p className="text-xs" style={{ color: "var(--kn-ink-soft)" }}>
                                                        by {plugin.developer}
                                                    </p>
                                                </div>
                                            </div>

                                            <p className="text-sm mb-4 line-clamp-2 min-h-[40px]" style={{ color: "var(--kn-ink-soft)" }}>
                                                {plugin.description}
                                            </p>

                                            <div className="flex items-center justify-between mb-4 text-sm">
                                                <div className="flex items-center gap-1">
                                                    <Rate disabled variant="yellow" rating={plugin.rating ?? 0} />
                                                    <span className="text-xs ml-1" style={{ color: "var(--kn-ink-soft)" }}>
                                                        ({plugin.reviews || 0})
                                                    </span>
                                                </div>
                                                <span className="text-xs inline-flex items-center gap-1" style={{ color: "var(--kn-ink-soft)" }}>
                                                    <DownloadIcon className="w-3 h-3" />
                                                    {formatNumber(plugin.downloads)}
                                                </span>
                                            </div>

                                            <div className="mb-4">
                                                <span
                                                    className="chip"
                                                    style={{
                                                        background: `var(--scene-${scene}-50)`,
                                                        color: `var(--scene-${scene}-600)`,
                                                        borderColor: "transparent",
                                                    }}
                                                >
                                                    {catValue}
                                                </span>
                                            </div>

                                            <div className="flex gap-2 mt-auto">
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline" className="flex-1 rounded-lg h-9 text-sm">
                                                            {t("plugins.view-details")}
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="w-[900px] max-w-none rounded-lg">
                                                        <DialogHeader>
                                                            <DialogTitle className="text-2xl">{plugin.name}</DialogTitle>
                                                            <DialogDescription />
                                                        </DialogHeader>
                                                        <div className="p-6">
                                                            <div className="grid grid-cols-12 gap-6">
                                                                <div className="col-span-7">
                                                                    <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--kn-line)" }}>
                                                                        <img
                                                                            src={usePath(plugin.screenShot ?? "")}
                                                                            alt="Plugin Preview"
                                                                            className="w-full h-auto"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="col-span-5 space-y-6">
                                                                    <div className="flex items-center gap-4">
                                                                        <img
                                                                            src={usePath(plugin.icon ?? "")}
                                                                            alt="Plugin Icon"
                                                                            className="w-16 h-16 rounded-lg"
                                                                        />
                                                                        <div>
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <Rate disabled variant="yellow" rating={plugin.rating ?? 0} />
                                                                                <span className="text-sm" style={{ color: "var(--kn-ink-soft)" }}>{plugin.rating}</span>
                                                                            </div>
                                                                            <div className="text-sm" style={{ color: "var(--kn-ink-soft)" }}>
                                                                                {formatNumber(plugin.downloads)} downloads
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div>
                                                                        <h4 className="font-semibold mb-2" style={{ color: "var(--kn-ink)" }}>
                                                                            {t("plugins.description")}
                                                                        </h4>
                                                                        <p className="text-sm" style={{ color: "var(--kn-ink-soft)" }}>
                                                                            {plugin.description}
                                                                        </p>
                                                                    </div>

                                                                    {plugin.features?.length ? (
                                                                        <div>
                                                                            <h4 className="font-semibold mb-2" style={{ color: "var(--kn-ink)" }}>
                                                                                {t("plugins.features")}
                                                                            </h4>
                                                                            <ul className="space-y-2">
                                                                                {plugin.features.map((f, i) => (
                                                                                    <li key={i} className="flex items-center gap-2 text-sm" style={{ color: "var(--kn-ink-soft)" }}>
                                                                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: `var(--scene-${scene}-500)` }} />
                                                                                        {f}
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        </div>
                                                                    ) : null}

                                                                    <div className="flex flex-wrap gap-2">
                                                                        <Badge
                                                                            style={{ background: `var(--scene-${scene}-100)`, color: `var(--scene-${scene}-600)` }}
                                                                        >
                                                                            {catValue}
                                                                        </Badge>
                                                                        <Badge variant="outline">by {plugin.developer}</Badge>
                                                                    </div>

                                                                    <div className="flex gap-2 pt-4">
                                                                        <Button
                                                                            className="flex-1 rounded-lg"
                                                                            onClick={() => gotoInstall(plugin.id)}
                                                                        >
                                                                            {t("plugins.add-to-kotion")}
                                                                        </Button>
                                                                        <Button variant="outline" className="rounded-lg">
                                                                            <HeartIcon className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </DialogContent>
                                                </Dialog>
                                                <Button
                                                    className="rounded-lg h-9 px-3"
                                                    onClick={() => gotoInstall(plugin.id)}
                                                    aria-label="Install"
                                                >
                                                    <DownloadIcon className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </Reveal>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* Build your own plugin */}
            <section className="section-padding section-alt">
                <div className="container-padding">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                        <Reveal>
                            <div className="bento-card h-full flex flex-col">
                                <span
                                    className="chip mb-5"
                                    style={{ background: "var(--scene-bitable-50)", color: "var(--scene-bitable-600)", borderColor: "transparent" }}
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    {t("plugins.build-badge")}
                                </span>
                                <h3 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight mb-3" style={{ color: "var(--kn-ink)" }}>
                                    {t("plugins.build-title")}
                                </h3>
                                <p className="text-base leading-relaxed mb-6" style={{ color: "var(--kn-ink-soft)" }}>
                                    {t("plugins.build-desc")}
                                </p>

                                <ol className="space-y-4 mb-8">
                                    {[
                                        { icon: <Puzzle className="w-4 h-4" />, k: "1", scene: "editor" as Scene },
                                        { icon: <Layers className="w-4 h-4" />, k: "2", scene: "collab" as Scene },
                                        { icon: <Code className="w-4 h-4" />, k: "3", scene: "ai" as Scene },
                                    ].map((s) => (
                                        <li key={s.k} className="flex items-start gap-3">
                                            <div
                                                className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 font-semibold text-sm"
                                                style={{ background: `var(--scene-${s.scene}-100)`, color: `var(--scene-${s.scene}-600)` }}
                                            >
                                                {s.icon}
                                            </div>
                                            <div>
                                                <div className="font-medium" style={{ color: "var(--kn-ink)" }}>{t(`plugins.build-step-${s.k}-title`)}</div>
                                                <div className="text-sm" style={{ color: "var(--kn-ink-soft)" }}>{t(`plugins.build-step-${s.k}-desc`)}</div>
                                            </div>
                                        </li>
                                    ))}
                                </ol>

                                <div className="mt-auto flex flex-wrap gap-3">
                                    <Link
                                        to={DOCS_PLUGIN_DEV}
                                        className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium btn-primary"
                                    >
                                        {t("plugins.build-cta-docs")}
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                    <a
                                        href={GITHUB_ISSUES_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium btn-secondary"
                                    >
                                        {t("plugins.build-cta-request")}
                                    </a>
                                </div>
                            </div>
                        </Reveal>

                        <Reveal delay={80}>
                            <div className="bento-card p-0 h-full overflow-hidden">
                                <div
                                    className="flex items-center gap-2 px-4 py-3 border-b"
                                    style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper-2)" }}
                                >
                                    <div className="flex gap-1.5">
                                        <span className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
                                        <span className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
                                        <span className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
                                    </div>
                                    <div className="ml-3 text-xs font-mono" style={{ color: "var(--kn-ink-soft)" }}>
                                        create-plugin.sh
                                    </div>
                                </div>
                                <pre
                                    className="p-5 text-[12.5px] leading-relaxed overflow-auto font-mono"
                                    style={{ color: "var(--kn-ink)", background: "var(--kn-paper)", minHeight: 340 }}
                                >
                                    <code>{BUILD_SNIPPET}</code>
                                </pre>
                            </div>
                        </Reveal>
                    </div>
                </div>
            </section>
        </div>
    );
};
