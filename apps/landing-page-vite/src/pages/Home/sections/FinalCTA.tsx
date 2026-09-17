import React from "react";
import { useTranslation } from "@kn/common";
import { ArrowRight, Github, Download } from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { DESKTOP_RELEASE_URL, GITHUB_URL, LIVE_DEMO_URL } from "../../../constants/links";
import { buildTrackedUrl, openExternal, track } from "../../../ops/analytics";
import { readString, type SectionProps } from "../../../ops/section-props";
import { stripTrailingArrow } from "../../../utils/text";

export interface FinalCTASectionProps {
    props?: SectionProps;
}

/**
 * Final CTA as a single inverted ink panel (light-on-dark in the light
 * theme, dark-on-light in the dark theme). Replaces the previous glowing
 * radial gradient card.
 */
export const FinalCTA: React.FC<FinalCTASectionProps> = ({ props: sectionProps }) => {
    const { t } = useTranslation();

    const primaryHref = readString(sectionProps, "primaryHref", LIVE_DEMO_URL);
    const primaryLabel = readString(sectionProps, "primaryLabel", t("home.final-cta-primary"));

    const faded = (pct: number) => "color-mix(in srgb, var(--kn-paper) " + pct + "%, transparent)";

    return (
        <section className="section-padding">
            <div className="container-padding">
                <Reveal>
                    <div
                        className="relative overflow-hidden rounded-2xl px-8 py-14 md:px-14 md:py-20"
                        style={{ background: "var(--kn-ink)" }}
                    >
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 opacity-[0.07]"
                            style={{
                                backgroundImage:
                                    "linear-gradient(to right, var(--kn-paper) 1px, transparent 1px), linear-gradient(to bottom, var(--kn-paper) 1px, transparent 1px)",
                                backgroundSize: "48px 48px",
                            }}
                        />
                        <div className="relative max-w-2xl">
                            <div className="mb-6 flex items-center gap-2.5">
                                <span className="h-px w-6" style={{ background: "var(--kn-accent)" }} />
                                <span className="kicker" style={{ color: faded(58) }}>
                                    {readString(sectionProps, "eyebrow", t("home.final-cta-eyebrow"))}
                                </span>
                            </div>

                            <h2
                                className="text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] md:text-[3rem]"
                                style={{ color: "var(--kn-paper)" }}
                            >
                                {readString(sectionProps, "title1", t("home.final-cta-title-1"))}
                                <br />
                                <span style={{ color: "var(--kn-accent)" }}>
                                    {readString(sectionProps, "title2", t("home.final-cta-title-2"))}
                                </span>
                            </h2>

                            <p className="mt-5 max-w-xl text-base leading-relaxed" style={{ color: faded(74) }}>
                                {readString(sectionProps, "desc", t("home.final-cta-desc"))}
                            </p>

                            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                                <button
                                    type="button"
                                    className="btn-accent px-5 py-2.5 text-[15px]"
                                    onClick={() => openExternal(primaryHref, { location: "final-cta", target: "demo", medium: "demo" })}
                                >
                                    {stripTrailingArrow(primaryLabel)}
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary px-5 py-2.5 text-[15px]"
                                    style={{ borderColor: faded(32), color: "var(--kn-paper)" }}
                                    onClick={() => openExternal(GITHUB_URL, { location: "final-cta", target: "github", medium: "social" })}
                                >
                                    <Github className="h-4 w-4" />
                                    {t("home.final-cta-secondary")}
                                </button>
                                <a
                                    href={buildTrackedUrl(DESKTOP_RELEASE_URL, {
                                        utm_source: "kotion-landing",
                                        utm_medium: "download",
                                        utm_campaign: "site",
                                        utm_content: "final-cta",
                                    })}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => track("cta_click", { location: "final-cta", target: "desktop" })}
                                    className="inline-flex items-center gap-1.5 px-1 py-2 text-sm font-medium"
                                    style={{ color: faded(70) }}
                                >
                                    <Download className="h-4 w-4" />
                                    {t("home.final-cta-tertiary")}
                                </a>
                            </div>

                            <div className="mt-7 font-mono text-[11px] tracking-wide" style={{ color: faded(50) }}>
                                {t("home.final-cta-meta")}
                            </div>
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    );
};
