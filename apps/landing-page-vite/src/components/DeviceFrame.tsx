import React from "react";

/**
 * DeviceFrame: paints a realistic-looking chrome around mock content
 * for use in the hero and "everywhere you work" sections.
 */
export type DeviceType = "browser" | "desktop" | "terminal" | "mobile";

export interface DeviceFrameProps {
    type?: DeviceType;
    url?: string;
    title?: string;
    children: React.ReactNode;
    className?: string;
}

export const DeviceFrame: React.FC<DeviceFrameProps> = ({
    type = "browser",
    url = "kotion.app",
    title,
    children,
    className = "",
}) => {
    if (type === "terminal") {
        return (
            <div className={`rounded-xl overflow-hidden border shadow-2xl bg-[#0d1117] ${className}`} style={{ borderColor: "var(--kn-line)" }}>
                <div className="flex items-center gap-2 px-4 py-2.5 bg-[#161b22] border-b border-white/5">
                    <span className="w-3 h-3 rounded-full bg-red-400/80" />
                    <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
                    <span className="w-3 h-3 rounded-full bg-green-400/80" />
                    <span className="ml-2 text-xs text-gray-400 font-mono">{title || "kotion@server ~ zsh"}</span>
                </div>
                <div className="p-4 font-mono text-[12px] leading-relaxed text-green-300">{children}</div>
            </div>
        );
    }

    if (type === "mobile") {
        return (
            <div className={`relative mx-auto rounded-[2.2rem] p-2 border shadow-2xl bg-[var(--kn-ink)] ${className}`} style={{ borderColor: "var(--kn-line)", width: 260 }}>
                <div className="absolute left-1/2 -translate-x-1/2 top-2 h-4 w-24 rounded-full bg-black/80 z-10" />
                <div className="rounded-[1.8rem] overflow-hidden bg-[var(--kn-paper)]">{children}</div>
            </div>
        );
    }

    const chromeTitle = title ?? (type === "desktop" ? "Kotion" : url);
    return (
        <div className={`rounded-xl overflow-hidden border shadow-2xl bg-[var(--kn-paper)] ${className}`} style={{ borderColor: "var(--kn-line)" }}>
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-[var(--kn-paper-2)]" style={{ borderColor: "var(--kn-line)" }}>
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
                {type === "browser" ? (
                    <div className="ml-3 flex-1 flex items-center">
                        <div className="min-w-0 max-w-md flex-1 rounded-md bg-[var(--kn-paper)] border px-2 py-0.5 text-[11px] text-[var(--kn-ink-soft)] truncate" style={{ borderColor: "var(--kn-line)" }}>
                            https://{url}
                        </div>
                    </div>
                ) : (
                    <div className="ml-3 text-[12px] font-medium text-[var(--kn-ink-soft)]">{chromeTitle}</div>
                )}
            </div>
            {children}
        </div>
    );
};
