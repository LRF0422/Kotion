import React from "react";
import { Button } from "@kn/ui";
import { ArrowRight, Github, Download, Sparkles } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { DeviceFrame } from "../../../components/DeviceFrame";
import { EditorMock } from "../../../components/EditorMock";
import { DESKTOP_RELEASE_URL, GITHUB_URL, LIVE_DEMO_URL } from "../../../constants/links";

export const Hero: React.FC = () => {
    const { t } = useTranslation();

    return (
        <section className="relative overflow-hidden hero-paper">
            <div className="container-padding pt-16 pb-20 md:pt-24 md:pb-28">
                <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center relative z-10">
                    {/* Copy column */}
                    <div className="fade-in-up">
                        <span
                            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border"
                            style={{
                                background: "var(--kn-paper)",
                                borderColor: "var(--kn-line)",
                                color: "var(--kn-ink-soft)",
                            }}
                        >
                            <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--scene-ai-500)" }} />
                            {t("home.hero-badge")}
                        </span>

                        <h1
                            className="mt-6 font-serif text-4xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05]"
                            style={{ color: "var(--kn-ink)" }}
                        >
                            {t("home.hero-title-1")}
                            <br />
                            <span className="gradient-text">{t("home.hero-title-2")}</span>
                        </h1>

                        <p className="mt-6 text-lg md:text-xl leading-relaxed max-w-xl" style={{ color: "var(--kn-ink-soft)" }}>
                            {t("home.desc")}
                        </p>

                        <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <Button
                                size="lg"
                                className="rounded-lg px-6"
                                onClick={() => window.open(LIVE_DEMO_URL, "_blank")}
                            >
                                {t("home.hero-cta-primary")}
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="lg"
                                className="rounded-lg px-6"
                                onClick={() => window.open(GITHUB_URL, "_blank")}
                            >
                                <Github className="mr-2 h-5 w-5" />
                                {t("home.hero-cta-github")}
                            </Button>
                            <a
                                href={DESKTOP_RELEASE_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium hover:opacity-80"
                                style={{ color: "var(--kn-ink-soft)" }}
                            >
                                <Download className="h-4 w-4" />
                                {t("home.hero-cta-desktop")}
                            </a>
                        </div>

                        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs" style={{ color: "var(--kn-ink-soft)" }}>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--scene-collab-500)" }} />
                                {t("home.hero-meta-1")}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--scene-editor-500)" }} />
                                {t("home.hero-meta-2")}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--scene-ai-500)" }} />
                                {t("home.hero-meta-3")}
                            </span>
                        </div>
                    </div>

                    {/* Device column */}
                    <div className="fade-in-up relative">
                        {/* subtle glow */}
                        <div
                            className="absolute -inset-4 rounded-3xl blur-3xl opacity-40 pointer-events-none"
                            style={{
                                background:
                                    "radial-gradient(closest-side, var(--scene-ai-500), transparent), radial-gradient(closest-side, var(--scene-editor-500), transparent)",
                            }}
                        />
                        <DeviceFrame type="browser" url="kotion.app/roadmap" className="relative">
                            <EditorMock />
                        </DeviceFrame>
                    </div>
                </div>

                {/* Stats */}
                <div className="max-w-4xl mx-auto mt-16 md:mt-20 grid grid-cols-3 gap-6 pt-10 border-t" style={{ borderColor: "var(--kn-line)" }}>
                    {[
                        { value: "20+", label: t("home.stat-plugins") },
                        { value: "7", label: t("home.stat-views") },
                        { value: "MIT", label: t("home.stat-license") },
                    ].map((s) => (
                        <div key={s.label} className="text-center">
                            <div className="font-serif text-4xl md:text-5xl font-semibold tracking-tight" style={{ color: "var(--kn-ink)" }}>
                                {s.value}
                            </div>
                            <div className="mt-1 text-xs md:text-sm" style={{ color: "var(--kn-ink-soft)" }}>
                                {s.label}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
