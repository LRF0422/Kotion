import React from "react";

/**
 * CollabMock: a small live-cursor illustration with avatars and a comment thread.
 */
export const CollabMock: React.FC = () => {
    return (
        <div className="relative w-full aspect-[5/3] rounded-lg overflow-hidden"
            style={{ background: "var(--scene-collab-50)" }}>
            {/* faux page */}
            <div className="absolute inset-4 rounded-md p-4 space-y-2 border"
                style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)" }}>
                <div className="h-3 w-2/3 rounded" style={{ background: "var(--kn-paper-2)" }} />
                <div className="h-2 w-full rounded" style={{ background: "var(--kn-paper-2)" }} />
                <div className="h-2 w-11/12 rounded" style={{ background: "var(--kn-paper-2)" }} />
                <div className="h-2 w-4/5 rounded" style={{ background: "var(--kn-paper-2)" }} />
                <div className="pt-2 flex items-center gap-1.5">
                    <div className="flex -space-x-1.5">
                        {["A", "B", "C"].map((c, i) => (
                            <span
                                key={c}
                                className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-semibold text-white border-2"
                                style={{
                                    background: ["#f472b6", "#60a5fa", "#34d399"][i],
                                    borderColor: "var(--kn-paper)",
                                }}
                            >
                                {c}
                            </span>
                        ))}
                    </div>
                    <span className="text-[10px] text-[var(--kn-ink-soft)]">3 editing now</span>
                </div>
            </div>

            {/* Alice cursor */}
            <div className="absolute" style={{ top: "38%", left: "48%" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" style={{ color: "#f472b6" }}>
                    <path fill="currentColor" d="M4 2l8 20 3-9 9-3z" />
                </svg>
                <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] text-white" style={{ background: "#f472b6" }}>Alice</span>
            </div>
            {/* Bob cursor */}
            <div className="absolute" style={{ top: "62%", left: "30%" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" style={{ color: "#60a5fa" }}>
                    <path fill="currentColor" d="M4 2l8 20 3-9 9-3z" />
                </svg>
                <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] text-white" style={{ background: "#60a5fa" }}>Bob</span>
            </div>

            {/* comment bubble */}
            <div className="absolute bottom-3 right-3 max-w-[60%] rounded-md border shadow-sm p-2 text-[10px]"
                style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)" }}>
                <div className="font-semibold" style={{ color: "var(--kn-ink)" }}>Chloé</div>
                <div style={{ color: "var(--kn-ink-soft)" }}>Should we add a chart here?</div>
            </div>
        </div>
    );
};
