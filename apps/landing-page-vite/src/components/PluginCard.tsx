import React from "react";

export interface PluginCardProps {
    icon: React.ReactNode;
    name: string;
    description: string;
    scene: "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";
    tag?: string;
    href?: string;
    onClick?: () => void;
    /** Optional ops-set label rendered as a small accent marker. */
    featured?: boolean;
}

/**
 * Dense, flat plugin card: hairline border, tile icon, mono tag.
 * Scene colour is intentionally ignored — the palette is collapsed.
 */
export const PluginCard: React.FC<PluginCardProps> = ({
    icon,
    name,
    description,
    tag,
    href,
    onClick,
    featured = false,
}) => {
    const Wrapper: React.ElementType = href ? "a" : "button";
    return (
        <Wrapper
            {...(href ? { href, target: "_blank", rel: "noreferrer" } : { type: "button", onClick })}
            className="card-lift group flex h-full w-full flex-col gap-3 p-5 text-left"
        >
            <div className="flex items-start justify-between gap-3">
                <span
                    className="grid h-9 w-9 place-items-center rounded-md"
                    style={{ background: "var(--kn-tile)", color: "var(--kn-ink)" }}
                >
                    {icon}
                </span>
                {tag && (
                    <span
                        className="font-mono text-[10px] uppercase tracking-[0.14em]"
                        style={{ color: featured ? "var(--kn-accent-ink)" : "var(--kn-ink-mute)" }}
                    >
                        {tag}
                    </span>
                )}
            </div>
            <div>
                <div className="text-[15px] font-semibold" style={{ color: "var(--kn-ink)" }}>
                    {name}
                </div>
                <div className="mt-1 line-clamp-2 text-[13px] leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                    {description}
                </div>
            </div>
        </Wrapper>
    );
};
