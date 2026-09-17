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
    /** Kept for API compatibility; the collapsed palette ignores it. */
    scene?: "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";
}

/**
 * Segmented control for mock views. Active state is ink-on-paper rather
 * than a colour pill, matching the rest of the system.
 */
export const TabPreview: React.FC<TabPreviewProps> = ({
    tabs,
    defaultKey,
    className = "",
    tabClassName = "",
}) => {
    const [active, setActive] = useState<string>(defaultKey ?? tabs[0]?.key);
    const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

    return (
        <div className={className}>
            <div
                className={"mb-4 flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-md border p-0.5 " + tabClassName}
                style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper-2)" }}
            >
                {tabs.map((t) => {
                    const isActive = t.key === active;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setActive(t.key)}
                            className="rounded px-2.5 py-1 text-xs font-medium transition-colors"
                            style={
                                isActive
                                    ? { background: "var(--kn-paper)", color: "var(--kn-ink)", boxShadow: "0 0 0 1px var(--kn-line)" }
                                    : { color: "var(--kn-ink-mute)" }
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
