import React from "react";

/**
 * DeviceFrame: quiet, hairline chrome around mock content. The traffic
 * lights are deliberately monochrome so the frame never competes with
 * the product UI inside it.
 */
export type DeviceType = "browser" | "desktop" | "terminal" | "mobile";

export interface DeviceFrameProps {
    type?: DeviceType;
    url?: string;
    title?: string;
    children: React.ReactNode;
    className?: string;
}

const FRAME_SHADOW = "0 1px 2px rgba(0,0,0,0.04), 0 24px 48px -32px rgba(0,0,0,0.28)";

const Dots: React.FC = () => (
    <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--kn-line-strong)" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--kn-line-strong)" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--kn-line-strong)" }} />
    </div>
);

export const DeviceFrame: React.FC<DeviceFrameProps> = ({
    type = "browser",
    url = "kotion.app",
    title,
    children,
    className = "",
}) => {
    if (type === "terminal") {
        return (
            <div
                className={"overflow-hidden rounded-[10px] border " + className}
                style={{ borderColor: "var(--kn-line)", background: "#101010", boxShadow: FRAME_SHADOW }}
            >
                <div className="flex items-center gap-3 border-b px-4 py-2.5" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                    <Dots />
                    <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                        {title || "kotion@server ~ zsh"}
                    </span>
                </div>
                <div className="p-4 font-mono text-[12px] leading-relaxed">{children}</div>
            </div>
        );
    }

    if (type === "mobile") {
        return (
            <div
                className={"relative mx-auto rounded-[2rem] border p-2 " + className}
                style={{ borderColor: "var(--kn-line)", background: "var(--kn-ink)", width: 262, boxShadow: FRAME_SHADOW }}
            >
                <div className="absolute left-1/2 top-2 z-10 h-4 w-24 -translate-x-1/2 rounded-full bg-black/70" />
                <div className="overflow-hidden rounded-[1.6rem]" style={{ background: "var(--kn-paper)" }}>
                    {children}
                </div>
            </div>
        );
    }

    const chromeTitle = title ?? (type === "desktop" ? "Kotion" : url);
    return (
        <div
            className={"overflow-hidden rounded-[10px] border " + className}
            style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper)", boxShadow: FRAME_SHADOW }}
        >
            <div
                className="flex items-center gap-3 border-b px-3 py-2"
                style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper-2)" }}
            >
                <Dots />
                {type === "browser" ? (
                    <div
                        className="ml-1 min-w-0 flex-1 truncate rounded-md border px-2 py-0.5 text-center font-mono text-[11px]"
                        style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper)", color: "var(--kn-ink-mute)" }}
                    >
                        {url}
                    </div>
                ) : (
                    <div className="ml-1 text-[12px] font-medium" style={{ color: "var(--kn-ink-soft)" }}>
                        {chromeTitle}
                    </div>
                )}
            </div>
            {children}
        </div>
    );
};
