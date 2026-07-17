import React from "react";
import { useTranslation } from "@kn/common";
import { Button } from "@kn/ui";
import { ArrowRight, Github, Download } from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { DESKTOP_RELEASE_URL, GITHUB_URL, LIVE_DEMO_URL } from "../../../constants/links";

export const FinalCTA: React.FC = () => {
    const { t } = useTranslation();
    return (
        <section className="section-padding relative overflow-hidden">
            {/* warm gradient background */}
            <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        "radial-gradient(ellipse 60% 60% at 30% 40%, color-mix(in srgb, var(--scene-ai-500) 22%, transparent), transparent), radial-gradient(ellipse 60% 60% at 80% 60%, color-mix(in srgb, var(--scene-canvas-500) 18%, transparent), transparent)",
                }}
            />
            <div className="container-padding relative">
                <Reveal>
                    <div
                        className="max-w-4xl mx-auto rounded-2xl overflow-hidden border p-10 md:p-14 text-center"
                        style={{
                            borderColor: "var(--kn-line)",
                            background: "color-mix(in srgb, var(--kn-paper) 88%, transparent)",
                            backdropFilter: "blur(14px)",
                        }}
                    >
                        <span
                            className="chip"
                            style={{ background: "var(--scene-ai-50)", color: "var(--scene-ai-600)", borderColor: "transparent" }}
                        >
                            {t("home.final-cta-eyebrow")}
                        </span>
                        <h2
                            className="mt-6 font-serif text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]"
                            style={{ color: "var(--kn-ink)" }}
                        >
                            {t("home.final-cta-title-1")}
                            <br />
                            <span className="gradient-text">{t("home.final-cta-title-2")}</span>
                        </h2>
                        <p className="mt-5 text-lg leading-relaxed max-w-xl mx-auto" style={{ color: "var(--kn-ink-soft)" }}>
                            {t("home.final-cta-desc")}
                        </p>

                        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                            <Button
                                size="lg"
                                className="rounded-lg px-6"
                                onClick={() => window.open(LIVE_DEMO_URL, "_blank")}
                            >
                                {t("home.final-cta-primary")}
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="lg"
                                className="rounded-lg px-6"
                                onClick={() => window.open(GITHUB_URL, "_blank")}
                            >
                                <Github className="mr-2 h-5 w-5" />
                                {t("home.final-cta-secondary")}
                            </Button>
                            <a
                                href={DESKTOP_RELEASE_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium hover:opacity-80"
                                style={{ color: "var(--kn-ink-soft)" }}
                            >
                                <Download className="h-4 w-4" />
                                {t("home.final-cta-tertiary")}
                            </a>
                        </div>

                        <div className="mt-6 text-xs" style={{ color: "var(--kn-ink-soft)" }}>
                            {t("home.final-cta-meta")}
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    );
};
