import React from "react";
import { useTranslation } from "@kn/common";
import { PenTool, Users, Rocket } from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";
import { readString, type SectionProps } from "../../../ops/section-props";

interface Step {
    icon: React.ReactNode;
    titleKey: string;
    descKey: string;
}

const STEPS: Step[] = [
    { icon: <PenTool className="h-4 w-4" />, titleKey: "home.workflow-1-title", descKey: "home.workflow-1-desc" },
    { icon: <Users className="h-4 w-4" />, titleKey: "home.workflow-2-title", descKey: "home.workflow-2-desc" },
    { icon: <Rocket className="h-4 w-4" />, titleKey: "home.workflow-3-title", descKey: "home.workflow-3-desc" },
];

export interface WorkflowsSectionProps {
    props?: SectionProps;
}

export const Workflows: React.FC<WorkflowsSectionProps> = ({ props: sectionProps }) => {
    const { t } = useTranslation();
    return (
        <section id="workflows" className="section-padding section-alt">
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        index="02"
                        eyebrow={readString(sectionProps, "eyebrow", t("home.workflows-eyebrow"))}
                        title={readString(sectionProps, "title", t("home.workflows-title"))}
                        description={readString(sectionProps, "desc", t("home.workflows-desc"))}
                    />
                </Reveal>

                <div className="mt-14 grid grid-cols-1 gap-px md:grid-cols-3" style={{ background: "var(--kn-line)" }}>
                    {STEPS.map((s, i) => (
                        <Reveal key={s.titleKey} delay={i * 70} className="h-full">
                            <div className="flex h-full flex-col p-7" style={{ background: "var(--kn-paper)" }}>
                                <div className="mb-5 flex items-center justify-between">
                                    <span className="font-mono text-[11px] tracking-[0.16em]" style={{ color: "var(--kn-ink-mute)" }}>
                                        {"0" + (i + 1)}
                                    </span>
                                    <span className="grid h-8 w-8 place-items-center rounded-md" style={{ background: "var(--kn-tile)", color: "var(--kn-ink)" }}>
                                        {s.icon}
                                    </span>
                                </div>
                                <h3 className="text-lg font-semibold tracking-[-0.01em]" style={{ color: "var(--kn-ink)" }}>
                                    {t(s.titleKey)}
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
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
