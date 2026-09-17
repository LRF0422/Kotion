import React from "react";

/**
 * CollabMock: a live-cursor illustration with avatars and a comment
 * thread. Cursor colours are muted so they read as annotation, not brand.
 */
export const CollabMock: React.FC = () => {
    const avatars = ["#b8452c", "#5b584e", "#8c887c"];
    return (
        <div className="relative aspect-[5/3] w-full overflow-hidden rounded-md" style={{ background: "var(--kn-paper-2)" }}>
            <div className="absolute inset-4 space-y-2 rounded-md border p-4" style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)" }}>
                <div className="h-3 w-2/3 rounded" style={{ background: "var(--kn-paper-3)" }} />
                <div className="h-2 w-full rounded" style={{ background: "var(--kn-paper-3)" }} />
                <div className="h-2 w-11/12 rounded" style={{ background: "var(--kn-paper-3)" }} />
                <div className="h-2 w-4/5 rounded" style={{ background: "var(--kn-paper-3)" }} />
                <div className="flex items-center gap-1.5 pt-2">
                    <div className="flex -space-x-1.5">
                        {["A", "B", "C"].map((c, i) => (
                            <span
                                key={c}
                                className="grid h-6 w-6 place-items-center rounded-full border-2 text-[10px] font-semibold text-white"
                                style={{ background: avatars[i], borderColor: "var(--kn-paper)" }}
                            >
                                {c}
                            </span>
                        ))}
                    </div>
                    <span className="text-[10px]" style={{ color: "var(--kn-ink-mute)" }}>3 editing now</span>
                </div>
            </div>

            <div className="absolute" style={{ top: "38%", left: "48%" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" style={{ color: "#b8452c" }}>
                    <path fill="currentColor" d="M4 2l8 20 3-9 9-3z" />
                </svg>
                <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] text-white" style={{ background: "#b8452c" }}>Alice</span>
            </div>
            <div className="absolute" style={{ top: "62%", left: "30%" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" style={{ color: "#5b584e" }}>
                    <path fill="currentColor" d="M4 2l8 20 3-9 9-3z" />
                </svg>
                <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] text-white" style={{ background: "#5b584e" }}>Bob</span>
            </div>

            <div className="absolute bottom-3 right-3 max-w-[60%] rounded-md border p-2 text-[10px]" style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)" }}>
                <div className="font-semibold" style={{ color: "var(--kn-ink)" }}>Chloé</div>
                <div style={{ color: "var(--kn-ink-soft)" }}>Should we add a chart here?</div>
            </div>
        </div>
    );
};
