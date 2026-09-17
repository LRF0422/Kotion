import React from "react";
import { useTranslation } from "@kn/common";
import { Globe, Monitor, ServerCog } from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";
import { DeviceFrame } from "../../../components/DeviceFrame";
import { readString, type SectionProps } from "../../../ops/section-props";

interface Deck {
    icon: React.ReactNode;
    titleKey: string;
    descKey: string;
    frame: React.ReactNode;
}

const WebPreview: React.FC = () => (
    <div className="p-4 font-mono text-[11px] leading-relaxed" style={{ background: "var(--kn-paper)" }}>
        <div className="mb-3 flex items-center gap-2">
            <div className="grid h-5 w-5 place-items-center rounded" style={{ background: "var(--kn-ink)" }}>
                <span className="text-[10px] font-bold text-white">K</span>
            </div>
            <div className="font-semibold" style={{ color: "var(--kn-ink)" }}>kotion.top</div>
        </div>
        <div className="space-y-1.5">
            <div className="h-2 rounded" style={{ width: "92%", background: "var(--kn-paper-3)" }} />
            <div className="h-2 rounded" style={{ width: "78%", background: "var(--kn-paper-3)" }} />
            <div className="h-2 rounded" style={{ width: "85%", background: "var(--kn-paper-3)" }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 rounded" style={{ background: "var(--kn-tile)" }} />
            ))}
        </div>
    </div>
);

const DesktopPreview: React.FC = () => (
    <div className="p-4" style={{ background: "var(--kn-paper-2)" }}>
        <div className="grid h-full grid-cols-[80px_1fr] gap-2">
            <div className="space-y-1 rounded p-2" style={{ background: "var(--kn-paper)" }}>
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-2 rounded" style={{ background: i === 1 ? "var(--kn-ink-soft)" : "var(--kn-line)" }} />
                ))}
            </div>
            <div className="space-y-2 rounded p-3" style={{ background: "var(--kn-paper)" }}>
                <div className="h-3 w-2/3 rounded" style={{ background: "var(--kn-paper-3)" }} />
                <div className="h-2 w-full rounded" style={{ background: "var(--kn-paper-3)" }} />
                <div className="h-2 w-11/12 rounded" style={{ background: "var(--kn-paper-3)" }} />
                <div className="h-16 rounded border" style={{ background: "var(--kn-tile)", borderColor: "var(--kn-line)" }} />
            </div>
        </div>
    </div>
);

const TerminalPreview: React.FC = () => (
    <div className="p-4 font-mono text-[11px] leading-relaxed" style={{ color: "#d6d3ca" }}>
        <div style={{ color: "#d8d5cc" }}>~ $ git clone {"https://github.com/LRF0422/knowledge-repo"}</div>
        <div style={{ color: "#7f7c72" }}>Cloning into 'knowledge-repo'...</div>
        <div style={{ color: "#d8d5cc" }}>~ $ cd knowledge-repo</div>
        <div style={{ color: "#d8d5cc" }}>~ $ docker compose up -d</div>
        <div style={{ color: "#7f7c72" }}>[+] Running 4/4</div>
        <div>OK  mysql   Started</div>
        <div>OK  redis   Started</div>
        <div>OK  backend Started</div>
        <div>OK  web     Started</div>
        <div style={{ color: "#e0653f" }}>open http://localhost:3000</div>
    </div>
);

const DECKS: Deck[] = [
    { icon: <Globe className="h-4 w-4" />, titleKey: "home.everywhere-web-title", descKey: "home.everywhere-web-desc", frame: <DeviceFrame type="browser" url="kotion.top"><WebPreview /></DeviceFrame> },
    { icon: <Monitor className="h-4 w-4" />, titleKey: "home.everywhere-desktop-title", descKey: "home.everywhere-desktop-desc", frame: <DeviceFrame type="desktop" title="Kotion"><DesktopPreview /></DeviceFrame> },
    { icon: <ServerCog className="h-4 w-4" />, titleKey: "home.everywhere-selfhost-title", descKey: "home.everywhere-selfhost-desc", frame: <DeviceFrame type="terminal" title="~ zsh"><TerminalPreview /></DeviceFrame> },
];

export interface EverywhereYouWorkSectionProps {
    props?: SectionProps;
}

export const EverywhereYouWork: React.FC<EverywhereYouWorkSectionProps> = ({ props: sectionProps }) => {
    const { t } = useTranslation();
    return (
        <section id="self-host" className="section-padding section-alt">
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        index="05"
                        eyebrow={readString(sectionProps, "eyebrow", t("home.everywhere-eyebrow"))}
                        title={readString(sectionProps, "title", t("home.everywhere-title"))}
                        description={readString(sectionProps, "desc", t("home.everywhere-desc"))}
                    />
                </Reveal>

                <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-3">
                    {DECKS.map((d, i) => (
                        <Reveal key={d.titleKey} delay={i * 60}>
                            <div className="flex h-full flex-col">
                                <div className="flex min-h-[300px] flex-col justify-center overflow-hidden rounded-[10px]">{d.frame}</div>
                                <div className="mt-5 flex items-center gap-2.5">
                                    <span className="grid h-8 w-8 place-items-center rounded-md" style={{ background: "var(--kn-tile)", color: "var(--kn-ink)" }}>
                                        {d.icon}
                                    </span>
                                    <h3 className="text-base font-semibold tracking-[-0.01em]" style={{ color: "var(--kn-ink)" }}>
                                        {t(d.titleKey)}
                                    </h3>
                                </div>
                                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                                    {t(d.descKey)}
                                </p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};
