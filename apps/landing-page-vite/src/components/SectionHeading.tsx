import React from "react";

export interface SectionHeadingProps {
    eyebrow?: string;
    title: React.ReactNode;
    description?: React.ReactNode;
    align?: "left" | "center";
    /** Kept for API compatibility with older call sites; the collapsed
     *  palette means every scene renders in the same ink + accent tones. */
    scene?: "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";
    className?: string;
    /** Optional mono index shown before the eyebrow, e.g. "01". */
    index?: string;
}

/**
 * Editorial section heading: an accent rule + mono kicker above a tight,
 * left-aligned title. Replaces the centred colour-pill eyebrow pattern.
 */
export const SectionHeading: React.FC<SectionHeadingProps> = ({
    eyebrow,
    title,
    description,
    align = "left",
    className = "",
    index,
}) => {
    const centered = align === "center";
    const rootClass = [
        centered ? "items-center text-center mx-auto" : "items-start text-left",
        "flex flex-col max-w-2xl",
        className,
    ].join(" ");

    return (
        <div className={rootClass}>
            {eyebrow && (
                <div className="mb-5 flex items-center gap-2.5">
                    <span className="h-px w-6" style={{ background: "var(--kn-accent)" }} />
                    {index && (
                        <span className="font-mono text-[11px] tracking-[0.16em]" style={{ color: "var(--kn-accent)" }}>
                            {index}
                        </span>
                    )}
                    <span className="kicker">{eyebrow}</span>
                </div>
            )}
            <h2
                className="text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.5rem]"
                style={{ color: "var(--kn-ink)" }}
            >
                {title}
            </h2>
            {description && (
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed md:text-base" style={{ color: "var(--kn-ink-soft)" }}>
                    {description}
                </p>
            )}
        </div>
    );
};
