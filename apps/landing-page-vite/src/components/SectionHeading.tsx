import React from "react";

export interface SectionHeadingProps {
    eyebrow?: string;
    title: React.ReactNode;
    description?: React.ReactNode;
    align?: "left" | "center";
    scene?: "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";
    className?: string;
}

const sceneVars: Record<NonNullable<SectionHeadingProps["scene"]>, { bg: string; fg: string }> = {
    editor:   { bg: "var(--scene-editor-50)",   fg: "var(--scene-editor-600)" },
    collab:   { bg: "var(--scene-collab-50)",   fg: "var(--scene-collab-600)" },
    bitable:  { bg: "var(--scene-bitable-50)",  fg: "var(--scene-bitable-600)" },
    ai:       { bg: "var(--scene-ai-50)",       fg: "var(--scene-ai-600)" },
    canvas:   { bg: "var(--scene-canvas-50)",   fg: "var(--scene-canvas-600)" },
    selfhost: { bg: "var(--scene-selfhost-50)", fg: "var(--scene-selfhost-600)" },
};

export const SectionHeading: React.FC<SectionHeadingProps> = ({
    eyebrow,
    title,
    description,
    align = "center",
    scene = "editor",
    className = "",
}) => {
    const { bg, fg } = sceneVars[scene];
    const alignClass = align === "center" ? "text-center mx-auto" : "text-left";
    return (
        <div className={`${alignClass} max-w-3xl ${className}`}>
            {eyebrow && (
                <span
                    className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium mb-4"
                    style={{ backgroundColor: bg, color: fg }}
                >
                    {eyebrow}
                </span>
            )}
            <h2
                className="font-serif text-3xl md:text-5xl font-semibold tracking-tight leading-[1.1]"
                style={{ color: "var(--kn-ink)" }}
            >
                {title}
            </h2>
            {description && (
                <p className="mt-5 text-base md:text-lg leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                    {description}
                </p>
            )}
        </div>
    );
};
