import React, { useState } from "react";

export interface TabItem {
    key: string;
    label: React.ReactNode;
    content: React.ReactNode;
}

export interface TabPreviewProps {
    tabs: TabItem[];
    defaultKey?: string;
    className?: string;
    tabClassName?: string;
    /** Optional scene color for the active pill */
    scene?: "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";
}

const sceneVars: Record<NonNullable<TabPreviewProps["scene"]>, { bg: string; fg: string }> = {
    editor:   { bg: "var(--scene-editor-100)",   fg: "var(--scene-editor-600)" },
    collab:   { bg: "var(--scene-collab-100)",   fg: "var(--scene-collab-600)" },
    bitable:  { bg: "var(--scene-bitable-100)",  fg: "var(--scene-bitable-600)" },
    ai:       { bg: "var(--scene-ai-100)",       fg: "var(--scene-ai-600)" },
    canvas:   { bg: "var(--scene-canvas-100)",   fg: "var(--scene-canvas-600)" },
    selfhost: { bg: "var(--scene-selfhost-100)", fg: "var(--scene-selfhost-600)" },
};

export const TabPreview: React.FC<TabPreviewProps> = ({ tabs, defaultKey, className = "", tabClassName = "", scene = "editor" }) => {
    const [active, setActive] = useState<string>(defaultKey ?? tabs[0]?.key);
    const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];
    const { bg, fg } = sceneVars[scene];

    return (
        <div className={className}>
            <div className={`flex flex-wrap items-center gap-1 rounded-full p-1 mb-4 border w-fit ${tabClassName}`} style={{ borderColor: "var(--kn-line)", backgroundColor: "var(--kn-paper-2)" }}>
                {tabs.map((t) => {
                    const isActive = t.key === active;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setActive(t.key)}
                            className="px-3 py-1.5 text-xs font-medium rounded-full transition-all"
                            style={
                                isActive
                                    ? { backgroundColor: bg, color: fg }
                                    : { color: "var(--kn-ink-soft)" }
                            }
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>
            <div>{activeTab?.content}</div>
        </div>
    );
};
