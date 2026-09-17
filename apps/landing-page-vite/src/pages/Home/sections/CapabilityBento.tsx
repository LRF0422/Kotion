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
import { readString, readStringArray, type SectionProps } from "../../../ops/section-props";

type CardKey = "editor" | "collab" | "bitable" | "ai" | "canvas" | "links";

interface Card {
    key: CardKey;
    icon: React.ReactNode;
    titleKey: string;
    descKey: string;
    preview: React.ReactNode;
    className: string;
}

/** A small hand-drawn backlink graph, rendered in the collapsed palette. */
const BacklinksMock: React.FC = () => {
    const nodes = [
        { x: 128, y: 74, w: 64, h: 30, label: "Home", center: true },
        { x: 26, y: 22, w: 62, h: 24, label: "Roadmap" },
        { x: 224, y: 22, w: 62, h: 24, label: "Metrics" },
        { x: 26, y: 132, w: 62, h: 24, label: "Design" },
        { x: 224, y: 132, w: 62, h: 24, label: "Notes" },
    ];
    return (
        <svg viewBox="0 0 320 184" className="h-full w-full" style={{ background: "var(--kn-paper-2)" }}>
            <g fontFamily="ui-monospace, monospace" fontSize="10">
                {nodes.map((n) => {
                    const cx = n.x + n.w / 2;
                    const cy = n.y + n.h / 2;
                    return (
                        <path
                            key={"edge-" + n.label}
                            d={"M160 89 Q " + ((160 + cx) / 2) + " " + ((89 + cy) / 2) + ", " + cx + " " + cy}
                            stroke="var(--kn-line-strong)"
                            strokeWidth="1"
                            fill="none"
                            opacity={n.center ? 0 : 0.7}
                        />
                    );
                })}
                {nodes.map((n) => (
                    <g key={n.label}>
                        <rect
                            x={n.x}
                            y={n.y}
                            width={n.w}
                            height={n.h}
                            rx="6"
                            fill={n.center ? "var(--kn-accent)" : "var(--kn-tile)"}
                            stroke={n.center ? "var(--kn-accent)" : "var(--kn-line)"}
                        />
                        <text
                            x={n.x + n.w / 2}
                            y={n.y + n.h / 2 + 3.5}
                            textAnchor="middle"
                            fontWeight="600"
                            fill={n.center ? "#ffffff" : "var(--kn-ink-soft)"}
                        >
                            {n.label}
                        </text>
                    </g>
                ))}
            </g>
        </svg>
    );
};

const CARDS: Card[] = [
    {
        key: "editor",
        icon: <FileText className="h-5 w-5" />,
        titleKey: "home.cap-editor-title",
        descKey: "home.cap-editor-desc",
        preview: (
            <div className="overflow-hidden rounded-md border" style={{ borderColor: "var(--kn-line)", maxHeight: 250 }}>
                <EditorMock compact />
            </div>
        ),
        className: "md:col-span-8",
    },
    {
        key: "collab",
        icon: <Users className="h-5 w-5" />,
        titleKey: "home.cap-collab-title",
        descKey: "home.cap-collab-desc",
        preview: <CollabMock />,
        className: "md:col-span-4",
    },
    {
        key: "bitable",
        icon: <Database className="h-5 w-5" />,
        titleKey: "home.cap-bitable-title",
        descKey: "home.cap-bitable-desc",
        preview: (
            <div className="overflow-hidden rounded-md border p-3" style={{ borderColor: "var(--kn-line)" }}>
                <BitableMock />
            </div>
        ),
        className: "md:col-span-12",
    },
    {
        key: "ai",
        icon: <Sparkles className="h-5 w-5" />,
        titleKey: "home.cap-ai-title",
        descKey: "home.cap-ai-desc",
        preview: <AIMock />,
        className: "md:col-span-4",
    },
    {
        key: "canvas",
        icon: <Palette className="h-5 w-5" />,
        titleKey: "home.cap-canvas-title",
        descKey: "home.cap-canvas-desc",
        preview: (
            <div className="overflow-hidden rounded-md border p-3" style={{ borderColor: "var(--kn-line)" }}>
                <CanvasMock />
            </div>
        ),
        className: "md:col-span-4",
    },
    {
        key: "links",
        icon: <Link2 className="h-5 w-5" />,
        titleKey: "home.cap-links-title",
        descKey: "home.cap-links-desc",
        preview: (
            <div className="aspect-[5/3] overflow-hidden rounded-md border" style={{ borderColor: "var(--kn-line)" }}>
                <BacklinksMock />
            </div>
        ),
        className: "md:col-span-4",
    },
];

const CARD_KEYS: CardKey[] = ["editor", "collab", "bitable", "ai", "canvas", "links"];

export interface CapabilityBentoSectionProps {
    props?: SectionProps;
}

export const CapabilityBento: React.FC<CapabilityBentoSectionProps> = ({ props: sectionProps }) => {
    const { t } = useTranslation();

    // ops 可在 admin 里通过 cards / hidden 选择要展示的能力卡片
    const allow = readStringArray(sectionProps, "cards", []);
    const hidden = readStringArray(sectionProps, "hidden", []);
    const cards = CARDS.filter((card) => {
        if (allow.length > 0 && !allow.includes(card.key)) return false;
        if (hidden.includes(card.key)) return false;
        return true;
    });

    return (
        <section id="features" className="section-padding" style={{ background: "var(--kn-paper)" }}>
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        index="01"
                        eyebrow={readString(sectionProps, "eyebrow", t("home.cap-eyebrow"))}
                        title={readString(sectionProps, "title", t("home.cap-title"))}
                        description={readString(sectionProps, "desc", t("home.cap-desc"))}
                    />
                </Reveal>

                <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-12">
                    {cards.map((c, idx) => (
                        <Reveal key={c.key} delay={idx * 50} className={c.className}>
                            <div className="bento-card group flex h-full flex-col">
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="grid h-9 w-9 place-items-center rounded-md" style={{ background: "var(--kn-tile)", color: "var(--kn-ink)" }}>
                                            {c.icon}
                                        </span>
                                        <h3 className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: "var(--kn-ink)" }}>
                                            {t(c.titleKey)}
                                        </h3>
                                    </div>
                                    <span className="font-mono text-[11px] tracking-[0.14em]" style={{ color: "var(--kn-ink-mute)" }}>
                                        {"0" + (CARD_KEYS.indexOf(c.key) + 1)}
                                    </span>
                                </div>
                                <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
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
