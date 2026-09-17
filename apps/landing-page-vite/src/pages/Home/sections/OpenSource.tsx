import React from "react";
import { Link, useTranslation } from "@kn/common";
import { ArrowRight, Github, Heart, GitFork, Puzzle } from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";
import { GITHUB_URL, DOCS_PLUGIN_DEV } from "../../../constants/links";
import { openExternal } from "../../../ops/analytics";
import { readString, type SectionProps } from "../../../ops/section-props";

const CODE_SNIPPET = [
    'import { ExtensionWrapper } from "@kn/common";',
    "",
    "export const MyPlugin = () => (",
    "  <ExtensionWrapper",
    "    slashMenu={{",
    '      name: "my-block",',
    "      icon: <SparklesIcon />,",
    "      onSelect: (editor) => editor.chain()",
    '        .insertContent("<my-block />")',
    "        .run(),",
    "    }}",
    '    aiTools={[{ name: "summarize", run }]}',
    "  >",
    "    <YourBlockView />",
    "  </ExtensionWrapper>",
    ");",
].join("\n");

export interface OpenSourceSectionProps {
    props?: SectionProps;
}

export const OpenSource: React.FC<OpenSourceSectionProps> = ({ props: sectionProps }) => {
    const { t } = useTranslation();
    const badges = [
        { icon: <Heart className="h-3.5 w-3.5" />, label: "MIT" },
        { icon: <Github className="h-3.5 w-3.5" />, label: "GitHub" },
        { icon: <GitFork className="h-3.5 w-3.5" />, label: "Fork" },
        { icon: <Puzzle className="h-3.5 w-3.5" />, label: t("home.opensource-plugin-label") },
    ];

    return (
        <section className="section-padding section-alt">
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        index="07"
                        eyebrow={readString(sectionProps, "eyebrow", t("home.opensource-eyebrow"))}
                        title={readString(sectionProps, "title", t("home.opensource-title"))}
                        description={readString(sectionProps, "desc", t("home.opensource-desc"))}
                    />
                </Reveal>

                <div className="mt-14 grid grid-cols-1 items-stretch gap-8 lg:grid-cols-2">
                    {/* Narrative */}
                    <Reveal>
                        <div className="flex h-full flex-col">
                            <div className="mb-6 flex flex-wrap gap-2">
                                {badges.map((b) => (
                                    <span key={b.label} className="chip">
                                        {b.icon}
                                        {b.label}
                                    </span>
                                ))}
                            </div>

                            <h3 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl" style={{ color: "var(--kn-ink)" }}>
                                {t("home.opensource-heading")}
                            </h3>
                            <p className="mb-6 mt-4 text-base leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                                {t("home.opensource-body")}
                            </p>

                            <ul className="mb-8 space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm">
                                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--kn-accent)" }} />
                                        <span style={{ color: "var(--kn-ink-soft)" }}>{t("home.opensource-bullet-" + i)}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-auto flex flex-wrap items-center gap-4">
                                <button
                                    type="button"
                                    className="btn-secondary px-4 py-2.5"
                                    onClick={() => openExternal(GITHUB_URL, { location: "opensource", target: "github", medium: "social" })}
                                >
                                    <Github className="mr-2 h-4 w-4" />
                                    {t("home.opensource-cta-github")}
                                </button>
                                <Link to={DOCS_PLUGIN_DEV} className="link-accent inline-flex items-center gap-2 text-sm font-medium">
                                    {t("home.opensource-cta-docs")}
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>
                    </Reveal>

                    {/* Code sample */}
                    <Reveal delay={70}>
                        <div className="overflow-hidden rounded-[10px] border" style={{ borderColor: "var(--kn-line)", background: "#101010" }}>
                            <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                                <div className="flex gap-1.5">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} />
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} />
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} />
                                </div>
                                <span className="ml-1 font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                                    packages/plugin-my-block/index.tsx
                                </span>
                            </div>
                            <pre className="overflow-auto p-5 font-mono text-[12.5px] leading-relaxed" style={{ color: "#e6e3db", minHeight: 340 }}>
                                <code>{CODE_SNIPPET}</code>
                            </pre>
                            <div className="flex items-center justify-between border-t px-5 py-3 text-xs" style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
                                <span>{t("home.opensource-code-caption")}</span>
                                <Link to={DOCS_PLUGIN_DEV} className="inline-flex items-center gap-1 font-medium" style={{ color: "#e0653f" }}>
                                    {t("home.opensource-code-cta")}
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </div>
                        </div>
                    </Reveal>
                </div>
            </div>
        </section>
    );
};
