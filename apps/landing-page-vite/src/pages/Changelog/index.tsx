import React, { useEffect, useState } from "react";
import { useTranslation } from "@kn/common";
import { ExternalLink, Github, Tag as TagIcon } from "@kn/icon";
import { GITHUB_RELEASES_URL } from "../../constants/links";
import { fetchChangelog, type ChangelogItem } from "../../ops/changelog";
import { Reveal } from "../../components/Reveal";
import { track } from "../../ops/analytics";

export const Changelog: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [items, setItems] = useState<ChangelogItem[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        void fetchChangelog(20).then((value) => {
            if (!cancelled) setItems(value);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const locale = i18n.language?.startsWith("zh") ? "zh-CN" : "en-US";
    const formatDate = (value?: number) => {
        if (!value) return "";
        try {
            return new Date(value).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
        } catch {
            return "";
        }
    };

    return (
        <div>
            <section className="hero-paper">
                <div className="container-padding pt-16 pb-10 md:pt-20 md:pb-12 text-center">
                    <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight" style={{ color: "var(--kn-ink)" }}>
                        {t("changelog.title")}
                    </h1>
                    <p className="mt-4 text-lg max-w-2xl mx-auto" style={{ color: "var(--kn-ink-soft)" }}>
                        {t("changelog.subtitle")}
                    </p>
                </div>
            </section>

            <section className="section-padding">
                <div className="container-padding max-w-3xl mx-auto">
                    {items === null && (
                        <p className="text-center" style={{ color: "var(--kn-ink-soft)" }}>{t("changelog.loading")}</p>
                    )}
                    {items !== null && items.length === 0 && (
                        <p className="text-center" style={{ color: "var(--kn-ink-soft)" }}>{t("changelog.empty")}</p>
                    )}
                    <div className="space-y-6">
                        {items?.map((item, index) => (
                            <Reveal key={item.id} delay={index * 30}>
                                <article className="bento-card">
                                    <header className="flex flex-wrap items-center gap-3 mb-3">
                                        <span
                                            className="chip"
                                            style={{ background: "var(--scene-editor-50)", color: "var(--scene-editor-600)", borderColor: "transparent" }}
                                        >
                                            <TagIcon className="w-3.5 h-3.5" />
                                            {item.tag || item.name || item.id}
                                        </span>
                                        {item.prerelease && (
                                            <span
                                                className="chip"
                                                style={{ background: "var(--scene-ai-50)", color: "var(--scene-ai-600)", borderColor: "transparent" }}
                                            >
                                                pre-release
                                            </span>
                                        )}
                                        <span className="text-xs" style={{ color: "var(--kn-ink-soft)" }}>
                                            {formatDate(item.publishedAt)}
                                        </span>
                                    </header>
                                    {item.name && (
                                        <h2 className="font-semibold text-lg mb-2" style={{ color: "var(--kn-ink)" }}>{item.name}</h2>
                                    )}
                                    {item.body && (
                                        <div
                                            className="text-sm leading-relaxed whitespace-pre-wrap"
                                            style={{ color: "var(--kn-ink-soft)" }}
                                        >
                                            {item.body}
                                        </div>
                                    )}
                                    {item.url && (
                                        <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={() => track("cta_click", { location: "changelog", target: "release", tag: item.tag })}
                                            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
                                            style={{ color: "var(--scene-editor-600)" }}
                                        >
                                            {t("changelog.view-release")}
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                    )}
                                </article>
                            </Reveal>
                        ))}
                    </div>

                    <div className="mt-12 text-center">
                        <a
                            href={GITHUB_RELEASES_URL}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => track("cta_click", { location: "changelog", target: "all-releases" })}
                            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium btn-secondary"
                        >
                            <Github className="w-4 h-4" />
                            {t("changelog.all-releases")}
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
};
