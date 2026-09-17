import React from "react";
import { ArrowRight, Github, Download } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { DeviceFrame } from "../../../components/DeviceFrame";
import { EditorMock } from "../../../components/EditorMock";
import { DESKTOP_RELEASE_URL, GITHUB_URL, LIVE_DEMO_URL } from "../../../constants/links";
import { buildTrackedUrl, openExternal, track } from "../../../ops/analytics";
import { reportExperimentConversion, useExperiment } from "../../../ops/experiment";
import { StarCount } from "../../../ops/StarCount";
import { readBoolean, readString, readStringArray, type SectionProps } from "../../../ops/section-props";
import { stripTrailingArrow } from "../../../utils/text";

/** Hero 主 CTA 实验的 payload 形状，由后台「实验平台」配置。 */
interface HeroCtaPayload {
    ctaLabel?: string;
    ctaHref?: string;
}

export interface HeroSectionProps {
    props?: SectionProps;
}

/**
 * Hero.
 *
 * Copy and CTA can be overridden per-locale from admin via SECTION props
 * (badge / title1 / title2 / desc / ctaLabel / ctaHref / secondaryLabel /
 * secondaryHref / meta / showStats). A running hero-cta experiment still
 * takes precedence for the primary CTA so existing A/B tests keep working.
 */
export const Hero: React.FC<HeroSectionProps> = ({ props: sectionProps }) => {
    const { t } = useTranslation();
    const { variantKey, payload } = useExperiment<HeroCtaPayload>("hero-cta");

    const badge = readString(sectionProps, "badge", t("home.hero-badge"));
    const title1 = readString(sectionProps, "title1", t("home.hero-title-1"));
    const title2 = readString(sectionProps, "title2", t("home.hero-title-2"));
    const desc = readString(sectionProps, "desc", t("home.desc"));
    const ctaHref = payload?.ctaHref || readString(sectionProps, "ctaHref", LIVE_DEMO_URL);
    const ctaLabel = payload?.ctaLabel || readString(sectionProps, "ctaLabel", t("home.hero-cta-primary"));
    const secondaryLabel = readString(sectionProps, "secondaryLabel", t("home.hero-cta-github"));
    const secondaryHref = readString(sectionProps, "secondaryHref", GITHUB_URL);
    const meta = readStringArray(sectionProps, "meta", [
        t("home.hero-meta-1"),
        t("home.hero-meta-2"),
        t("home.hero-meta-3"),
    ]);
    const showStats = readBoolean(sectionProps, "showStats", true);

    const onPrimaryCta = () => {
        openExternal(ctaHref, {
            location: "hero",
            target: "demo",
            medium: "demo",
            props: { variant: variantKey },
        });
        reportExperimentConversion("hero-cta", "cta_click");
    };

    const stats = [
        { value: "20+", label: t("home.stat-plugins") },
        { value: "7", label: t("home.stat-views") },
        { value: "MIT", label: t("home.stat-license") },
    ];

    return (
        <section className="hero-paper relative overflow-hidden">
            <div className="container-padding relative z-10 pb-16 pt-16 md:pb-24 md:pt-24">
                <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
                    {/* Copy column */}
                    <div className="fade-in-up">
                        <div className="mb-6 flex items-center gap-2.5">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--kn-accent)" }} />
                            <span className="kicker" style={{ color: "var(--kn-ink-soft)" }}>{badge}</span>
                        </div>

                        <h1
                            className="text-[2.6rem] font-semibold leading-[1.03] tracking-[-0.035em] md:text-[3.75rem]"
                            style={{ color: "var(--kn-ink)" }}
                        >
                            {title1}
                            <br />
                            <span style={{ color: "var(--kn-accent)" }}>{title2}</span>
                        </h1>

                        <p className="mt-6 max-w-xl text-base leading-relaxed md:text-lg" style={{ color: "var(--kn-ink-soft)" }}>
                            {desc}
                        </p>

                        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                            <button
                                type="button"
                                onClick={onPrimaryCta}
                                className="btn-accent px-5 py-2.5 text-[15px]"
                            >
                                {stripTrailingArrow(ctaLabel)}
                                <ArrowRight className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => openExternal(secondaryHref, { location: "hero", target: "github", medium: "social" })}
                                className="btn-secondary px-5 py-2.5 text-[15px]"
                            >
                                <Github className="h-4 w-4" />
                                {secondaryLabel}
                            </button>
                            <a
                                href={buildTrackedUrl(DESKTOP_RELEASE_URL, {
                                    utm_source: "kotion-landing",
                                    utm_medium: "download",
                                    utm_campaign: "site",
                                    utm_content: "hero",
                                })}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => track("cta_click", { location: "hero", target: "desktop" })}
                                className="inline-flex items-center gap-1.5 px-1 py-2 text-sm font-medium link-accent"
                            >
                                <Download className="h-4 w-4" />
                                {t("home.hero-cta-desktop")}
                            </a>
                        </div>

                        <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
                            {meta.map((item, index) => (
                                <React.Fragment key={item}>
                                    {index > 0 && <span className="h-3 w-px" style={{ background: "var(--kn-line-strong)" }} />}
                                    <span className="font-mono text-[11px] tracking-wide" style={{ color: "var(--kn-ink-mute)" }}>
                                        {item}
                                    </span>
                                </React.Fragment>
                            ))}
                        </div>

                        <div className="mt-5">
                            <StarCount />
                        </div>
                    </div>

                    {/* Device column */}
                    <div className="fade-in-up relative">
                        <DeviceFrame type="browser" url="kotion.top/roadmap" className="relative">
                            <EditorMock />
                        </DeviceFrame>
                    </div>
                </div>

                {showStats && (
                    <div
                        className="mx-auto mt-16 grid max-w-4xl grid-cols-3 gap-6 border-t pt-8"
                        style={{ borderColor: "var(--kn-line)" }}
                    >
                        {stats.map((s) => (
                            <div key={s.label}>
                                <div
                                    className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl"
                                    style={{ color: "var(--kn-ink)" }}
                                >
                                    {s.value}
                                </div>
                                <div className="kicker mt-1.5">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};
