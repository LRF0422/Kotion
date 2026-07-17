import React from "react";
import { Link, useTranslation } from "@kn/common";
import { Button } from "@kn/ui";
import { ArrowRight, Github, Heart, GitFork, Puzzle } from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";
import { GITHUB_URL, DOCS_PLUGIN_DEV } from "../../../constants/links";

const CODE_SNIPPET = `import { ExtensionWrapper } from "@kn/common";

export const MyPlugin = () => (
  <ExtensionWrapper
    slashMenu={{
      name: "my-block",
      icon: <SparklesIcon />,
      onSelect: (editor) => editor.chain()
        .insertContent("<my-block />")
        .run(),
    }}
    aiTools={[{ name: "summarize", run }]}
  >
    <YourBlockView />
  </ExtensionWrapper>
);`;

export const OpenSource: React.FC = () => {
    const { t } = useTranslation();
    return (
        <section className="section-padding section-alt">
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        eyebrow={t("home.opensource-eyebrow")}
                        title={t("home.opensource-title")}
                        description={t("home.opensource-desc")}
                        scene="collab"
                    />
                </Reveal>

                <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                    {/* Left: narrative */}
                    <Reveal>
                        <div className="bento-card h-full flex flex-col">
                            <div className="flex items-center gap-3 mb-6">
                                {[
                                    { icon: <Heart className="w-4 h-4" />, label: "MIT", scene: "collab" },
                                    { icon: <Github className="w-4 h-4" />, label: "GitHub", scene: "editor" },
                                    { icon: <GitFork className="w-4 h-4" />, label: "Fork", scene: "ai" },
                                    { icon: <Puzzle className="w-4 h-4" />, label: t("home.opensource-plugin-label"), scene: "bitable" },
                                ].map((b) => (
                                    <span
                                        key={b.label}
                                        className="chip"
                                        style={{ background: `var(--scene-${b.scene}-50)`, color: `var(--scene-${b.scene}-600)`, borderColor: "transparent" }}
                                    >
                                        {b.icon}
                                        {b.label}
                                    </span>
                                ))}
                            </div>

                            <h3 className="font-serif text-3xl font-semibold tracking-tight mb-4" style={{ color: "var(--kn-ink)" }}>
                                {t("home.opensource-heading")}
                            </h3>
                            <p className="text-base leading-relaxed mb-6" style={{ color: "var(--kn-ink-soft)" }}>
                                {t("home.opensource-body")}
                            </p>

                            <ul className="space-y-3 mb-8">
                                {[1, 2, 3].map((i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm" style={{ color: "var(--kn-ink)" }}>
                                        <span
                                            className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
                                            style={{ background: "var(--scene-collab-500)" }}
                                        />
                                        <span style={{ color: "var(--kn-ink-soft)" }}>{t(`home.opensource-bullet-${i}`)}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-auto flex flex-wrap gap-3">
                                <Button
                                    size="lg"
                                    variant="outline"
                                    className="rounded-lg"
                                    onClick={() => window.open(GITHUB_URL, "_blank")}
                                >
                                    <Github className="mr-2 h-4 w-4" />
                                    {t("home.opensource-cta-github")}
                                </Button>
                                <Link
                                    to={DOCS_PLUGIN_DEV}
                                    className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-medium hover:opacity-80"
                                    style={{ color: "var(--scene-bitable-600)" }}
                                >
                                    {t("home.opensource-cta-docs")}
                                    <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        </div>
                    </Reveal>

                    {/* Right: code sample */}
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
                                    packages/plugin-my-block/index.tsx
                                </div>
                            </div>
                            <pre
                                className="p-5 text-[12.5px] leading-relaxed overflow-auto font-mono"
                                style={{ color: "var(--kn-ink)", background: "var(--kn-paper)", minHeight: 340 }}
                            >
                                <code>{CODE_SNIPPET}</code>
                            </pre>
                            <div
                                className="px-5 py-3 border-t flex items-center justify-between text-xs"
                                style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper-2)", color: "var(--kn-ink-soft)" }}
                            >
                                <span>{t("home.opensource-code-caption")}</span>
                                <Link
                                    to={DOCS_PLUGIN_DEV}
                                    className="inline-flex items-center gap-1 font-medium hover:opacity-80"
                                    style={{ color: "var(--scene-editor-600)" }}
                                >
                                    {t("home.opensource-code-cta")}
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </Link>
                            </div>
                        </div>
                    </Reveal>
                </div>
            </div>
        </section>
    );
};
