import React from "react";

export interface PluginCardProps {
    icon: React.ReactNode;
    name: string;
    description: string;
    scene: "editor" | "collab" | "bitable" | "ai" | "canvas" | "selfhost";
    tag?: string;
    href?: string;
    onClick?: () => void;
}

/**
 * A compact plugin card with gradient icon, scene-colored tag and hover lift.
 */
export const PluginCard: React.FC<PluginCardProps> = ({
    icon,
    name,
    description,
    scene,
    tag,
    href,
    onClick,
}) => {
    const Wrapper: React.ElementType = href ? "a" : "button";
    return (
        <Wrapper
            {...(href ? { href, target: "_blank", rel: "noreferrer" } : { type: "button", onClick })}
            className="card-lift group text-left p-5 flex flex-col gap-3 h-full"
        >
            <div className="flex items-start justify-between">
                <div
                    className="w-10 h-10 rounded-lg grid place-items-center text-lg"
                    style={{ background: `var(--scene-${scene}-100)`, color: `var(--scene-${scene}-600)` }}
                >
                    {icon}
                </div>
                {tag && (
                    <span
                        className="chip"
                        style={{ background: `var(--scene-${scene}-50)`, color: `var(--scene-${scene}-600)` }}
                    >
                        {tag}
                    </span>
                )}
            </div>
            <div>
                <div className="font-semibold" style={{ color: "var(--kn-ink)" }}>{name}</div>
                <div className="mt-1 text-sm leading-relaxed line-clamp-2" style={{ color: "var(--kn-ink-soft)" }}>
                    {description}
                </div>
            </div>
        </Wrapper>
    );
};
