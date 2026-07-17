import React from "react";
import { useTranslation } from "@kn/common";
import { PenTool, Users, Rocket } from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";

type Scene = "editor" | "collab" | "ai";

interface Step {
    icon: React.ReactNode;
    titleKey: string;
    descKey: string;
    scene: Scene;
}

const STEPS: Step[] = [
    { icon: <PenTool className="w-5 h-5" />, titleKey: "home.workflow-1-title", descKey: "home.workflow-1-desc", scene: "editor" },
    { icon: <Users className="w-5 h-5" />, titleKey: "home.workflow-2-title", descKey: "home.workflow-2-desc", scene: "collab" },
    { icon: <Rocket className="w-5 h-5" />, titleKey: "home.workflow-3-title", descKey: "home.workflow-3-desc", scene: "ai" },
];

export const Workflows: React.FC = () => {
    const { t } = useTranslation();
    return (
        <section id="workflows" className="section-padding section-alt">
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        eyebrow={t("home.workflows-eyebrow")}
                        title={t("home.workflows-title")}
                        description={t("home.workflows-desc")}
                        scene="collab"
                    />
                </Reveal>

                <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                    {/* connecting dashed line */}
                    <div
                        className="hidden md:block absolute left-[16%] right-[16%] top-8 h-px"
                        style={{
                            backgroundImage:
                                "linear-gradient(90deg, var(--kn-line) 50%, transparent 50%)",
                            backgroundSize: "10px 1px",
                        }}
                    />

                    {STEPS.map((s, i) => (
                        <Reveal key={s.titleKey} delay={i * 100}>
                            <div className="relative bento-card group h-full">
                                <div className="flex items-center gap-3 mb-4">
                                    <div
                                        className="w-8 h-8 grid place-items-center rounded-full font-serif text-sm font-semibold border-2"
                                        style={{
                                            background: "var(--kn-paper)",
                                            borderColor: `var(--scene-${s.scene}-500)`,
                                            color: `var(--scene-${s.scene}-600)`,
                                        }}
                                    >
                                        {i + 1}
                                    </div>
                                    <div
                                        className="w-9 h-9 rounded-lg grid place-items-center"
                                        style={{ background: `var(--scene-${s.scene}-100)`, color: `var(--scene-${s.scene}-600)` }}
                                    >
                                        {s.icon}
                                    </div>
                                </div>
                                <h3 className="text-xl font-semibold tracking-tight mb-2" style={{ color: "var(--kn-ink)" }}>
                                    {t(s.titleKey)}
                                </h3>
                                <p className="text-sm leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                                    {t(s.descKey)}
                                </p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};
