import React from "react";
import { useTranslation } from "@kn/common";
import { Globe, Monitor, ServerCog } from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";
import { DeviceFrame } from "../../../components/DeviceFrame";

type Scene = "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";

interface Deck {
    icon: React.ReactNode;
    titleKey: string;
    descKey: string;
    scene: Scene;
    frame: React.ReactNode;
}

const WebPreview: React.FC = () => (
    <div className="p-4 font-mono text-[11px] leading-relaxed" style={{ background: "var(--kn-paper)" }}>
        <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-orange-400 to-pink-500 grid place-items-center text-white text-[10px] font-bold">K</div>
            <div className="font-semibold" style={{ color: "var(--kn-ink)" }}>kotion.top</div>
        </div>
        <div className="space-y-1.5" style={{ color: "var(--kn-ink-soft)" }}>
            <div className="h-2 rounded" style={{ width: "92%", background: "var(--kn-paper-2)" }} />
            <div className="h-2 rounded" style={{ width: "78%", background: "var(--kn-paper-2)" }} />
            <div className="h-2 rounded" style={{ width: "85%", background: "var(--kn-paper-2)" }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
            {["editor", "bitable", "canvas"].map((s) => (
                <div key={s} className="h-8 rounded" style={{ background: `var(--scene-${s}-100)` }} />
            ))}
        </div>
    </div>
);

const DesktopPreview: React.FC = () => (
    <div className="p-4" style={{ background: "var(--kn-paper-2)" }}>
        <div className="grid grid-cols-[80px_1fr] gap-2 h-full">
            <div className="rounded p-2 space-y-1" style={{ background: "var(--kn-paper)" }}>
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-2 rounded" style={{ background: i === 2 ? "var(--scene-editor-100)" : "var(--kn-line)" }} />
                ))}
            </div>
            <div className="rounded p-3 space-y-2" style={{ background: "var(--kn-paper)" }}>
                <div className="h-3 rounded w-2/3" style={{ background: "var(--kn-paper-2)" }} />
                <div className="h-2 rounded w-full" style={{ background: "var(--kn-paper-2)" }} />
                <div className="h-2 rounded w-11/12" style={{ background: "var(--kn-paper-2)" }} />
                <div className="h-16 rounded" style={{ background: `linear-gradient(135deg, var(--scene-ai-50), var(--scene-canvas-50))` }} />
            </div>
        </div>
    </div>
);

const TerminalPreview: React.FC = () => (
    <div className="p-4 font-mono text-[11px] leading-relaxed" style={{ background: "#0b0b0f", color: "#a1e6b1" }}>
        <div style={{ color: "#7ec7ff" }}>~ ❯ git clone {"https://github.com/LRF0422/knowledge-repo"}</div>
        <div style={{ color: "#b1b0a9" }}>Cloning into 'knowledge-repo'...</div>
        <div style={{ color: "#7ec7ff" }}>~ ❯ cd knowledge-repo</div>
        <div style={{ color: "#7ec7ff" }}>~/knowledge-repo ❯ docker compose up -d</div>
        <div style={{ color: "#b1b0a9" }}>[+] Running 4/4</div>
        <div>✔ mysql   Started</div>
        <div>✔ redis   Started</div>
        <div>✔ backend Started</div>
        <div>✔ web     Started</div>
        <div style={{ color: "#e879f9" }}>▸ open http://localhost:3000</div>
    </div>
);

const DECKS: Deck[] = [
    { icon: <Globe className="w-5 h-5" />, titleKey: "home.everywhere-web-title", descKey: "home.everywhere-web-desc", scene: "editor", frame: <DeviceFrame type="browser" url="kotion.top"><WebPreview /></DeviceFrame> },
    { icon: <Monitor className="w-5 h-5" />, titleKey: "home.everywhere-desktop-title", descKey: "home.everywhere-desktop-desc", scene: "ai", frame: <DeviceFrame type="desktop" title="Kotion"><DesktopPreview /></DeviceFrame> },
    { icon: <ServerCog className="w-5 h-5" />, titleKey: "home.everywhere-selfhost-title", descKey: "home.everywhere-selfhost-desc", scene: "selfhost", frame: <DeviceFrame type="terminal" title="~ zsh"><TerminalPreview /></DeviceFrame> },
];

export const EverywhereYouWork: React.FC = () => {
    const { t } = useTranslation();
    return (
        <section id="self-host" className="section-padding section-alt">
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        eyebrow={t("home.everywhere-eyebrow")}
                        title={t("home.everywhere-title")}
                        description={t("home.everywhere-desc")}
                        scene="selfhost"
                    />
                </Reveal>

                <div className="mt-14 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {DECKS.map((d, i) => (
                        <Reveal key={d.titleKey} delay={i * 80}>
                            <div className="flex flex-col h-full">
                                <div className="rounded-xl overflow-hidden">{d.frame}</div>
                                <div className="mt-5 flex items-center gap-3">
                                    <div
                                        className="w-9 h-9 rounded-lg grid place-items-center"
                                        style={{ background: `var(--scene-${d.scene}-100)`, color: `var(--scene-${d.scene}-600)` }}
                                    >
                                        {d.icon}
                                    </div>
                                    <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--kn-ink)" }}>
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
