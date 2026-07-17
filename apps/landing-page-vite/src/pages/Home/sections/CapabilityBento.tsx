import React from "react";
import { useTranslation } from "@kn/common";
import { FileText, Users, Database, Sparkles, Palette, Link2 } from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";
import { EditorMock } from "../../../components/EditorMock";
import { CollabMock } from "../../../components/CollabMock";
import { BitableMock } from "../../../components/BitableMock";
import { AIMock } from "../../../components/AIMock";
import { CanvasMock } from "../../../components/CanvasMock";

type Scene = "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";

interface Card {
    icon: React.ReactNode;
    titleKey: string;
    descKey: string;
    scene: Scene;
    preview: React.ReactNode;
    className: string;
}

const BacklinksMock: React.FC = () => (
    <svg viewBox="0 0 300 180" className="w-full h-full" style={{ background: "var(--scene-selfhost-50)" }}>
        <g fontFamily="ui-serif" fontSize="10">
            {[
                { x: 130, y: 75, w: 60, h: 30, label: "Home", scene: "selfhost" },
                { x: 30, y: 25, w: 60, h: 24, label: "Roadmap", scene: "editor" },
                { x: 220, y: 25, w: 60, h: 24, label: "Metrics", scene: "bitable" },
                { x: 30, y: 130, w: 60, h: 24, label: "Design", scene: "canvas" },
                { x: 220, y: 130, w: 60, h: 24, label: "Notes", scene: "ai" },
            ].map((n) => (
                <g key={n.label}>
                    <path d={`M160 90 Q ${(160 + n.x + n.w / 2) / 2} ${(90 + n.y + 12) / 2}, ${n.x + n.w / 2} ${n.y + 12}`} stroke="var(--kn-line)" strokeWidth="1" fill="none" />
                    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="6" fill={`var(--scene-${n.scene}-100)`} />
                    <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 3} textAnchor="middle" fontWeight="600" fill={`var(--scene-${n.scene}-600)`}>
                        {n.label}
                    </text>
                </g>
            ))}
        </g>
    </svg>
);

export const CapabilityBento: React.FC = () => {
    const { t } = useTranslation();

    const cards: Card[] = [
        {
            icon: <FileText className="w-5 h-5" />,
            titleKey: "home.cap-editor-title",
            descKey: "home.cap-editor-desc",
            scene: "editor",
            preview: (
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--kn-line)" }}>
                    <EditorMock compact />
                </div>
            ),
            className: "md:col-span-2 md:row-span-2",
        },
        {
            icon: <Users className="w-5 h-5" />,
            titleKey: "home.cap-collab-title",
            descKey: "home.cap-collab-desc",
            scene: "collab",
            preview: <CollabMock />,
            className: "",
        },
        {
            icon: <Database className="w-5 h-5" />,
            titleKey: "home.cap-bitable-title",
            descKey: "home.cap-bitable-desc",
            scene: "bitable",
            preview: (
                <div className="rounded-lg overflow-hidden border p-3" style={{ borderColor: "var(--kn-line)" }}>
                    <BitableMock />
                </div>
            ),
            className: "md:col-span-2",
        },
        {
            icon: <Sparkles className="w-5 h-5" />,
            titleKey: "home.cap-ai-title",
            descKey: "home.cap-ai-desc",
            scene: "ai",
            preview: <AIMock />,
            className: "",
        },
        {
            icon: <Palette className="w-5 h-5" />,
            titleKey: "home.cap-canvas-title",
            descKey: "home.cap-canvas-desc",
            scene: "canvas",
            preview: (
                <div className="rounded-lg overflow-hidden border p-3" style={{ borderColor: "var(--kn-line)" }}>
                    <CanvasMock />
                </div>
            ),
            className: "",
        },
        {
            icon: <Link2 className="w-5 h-5" />,
            titleKey: "home.cap-links-title",
            descKey: "home.cap-links-desc",
            scene: "selfhost",
            preview: (
                <div className="rounded-lg overflow-hidden border aspect-[5/3]" style={{ borderColor: "var(--kn-line)" }}>
                    <BacklinksMock />
                </div>
            ),
            className: "",
        },
    ];

    return (
        <section id="features" className="section-padding" style={{ background: "var(--kn-paper)" }}>
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        eyebrow={t("home.cap-eyebrow")}
                        title={t("home.cap-title")}
                        description={t("home.cap-desc")}
                        scene="editor"
                    />
                </Reveal>

                <div className="mt-14 grid grid-cols-1 md:grid-cols-3 md:auto-rows-fr gap-5">
                    {cards.map((c, idx) => (
                        <Reveal key={c.titleKey} delay={idx * 60} className={`${c.className}`}>
                            <div className="bento-card group h-full flex flex-col">
                                <div className="flex items-center gap-3 mb-3">
                                    <div
                                        className="feature-icon !mb-0"
                                        style={{ background: `var(--scene-${c.scene}-100)`, color: `var(--scene-${c.scene}-600)` }}
                                    >
                                        {c.icon}
                                    </div>
                                    <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--kn-ink)" }}>
                                        {t(c.titleKey)}
                                    </h3>
                                </div>
                                <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--kn-ink-soft)" }}>
                                    {t(c.descKey)}
                                </p>
                                <div className="mt-auto">{c.preview}</div>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};
