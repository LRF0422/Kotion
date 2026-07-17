import React from "react";
import { Sparkles } from "@kn/icon";

/**
 * AIMock renders a chat-style panel with model switcher, streaming tokens,
 * skills chips and a citation.
 */
export const AIMock: React.FC = () => {
    return (
        <div className="rounded-lg border overflow-hidden text-sm"
            style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)" }}>
            {/* Header with model switcher */}
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--kn-line)" }}>
                <div className="w-6 h-6 rounded-md grid place-items-center"
                    style={{ background: "var(--scene-ai-500)", color: "white" }}>
                    <Sparkles className="w-3.5 h-3.5" />
                </div>
                <span className="text-[12px] font-medium" style={{ color: "var(--kn-ink)" }}>AI Assistant</span>
                <div className="ml-auto flex items-center gap-1">
                    {["DeepSeek", "Claude", "GPT"].map((m, i) => (
                        <span
                            key={m}
                            className="chip"
                            style={i === 0 ? { background: "var(--scene-ai-100)", color: "var(--scene-ai-600)", padding: "1px 8px" } : { padding: "1px 8px", fontSize: 10 }}
                        >
                            {m}
                        </span>
                    ))}
                </div>
            </div>

            {/* Body */}
            <div className="p-3 space-y-3">
                {/* User message */}
                <div className="flex justify-end">
                    <div className="max-w-[80%] px-3 py-1.5 rounded-lg rounded-tr-sm text-[12px]"
                        style={{ background: "var(--scene-editor-50)", color: "var(--kn-ink)" }}>
                        Summarise this doc into 3 bullets for the release notes.
                    </div>
                </div>

                {/* AI streaming reply */}
                <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-md grid place-items-center flex-shrink-0"
                        style={{ background: "var(--scene-ai-100)", color: "var(--scene-ai-600)" }}>
                        <Sparkles className="w-3 h-3" />
                    </div>
                    <div className="flex-1 space-y-1">
                        <div className="text-[12px]" style={{ color: "var(--kn-ink)" }}>Here are the key highlights:</div>
                        <div className="space-y-1 text-[12px]" style={{ color: "var(--kn-ink-soft)" }}>
                            <div>• Slash commands now support inline AI actions</div>
                            <div>• Bitable adds calendar &amp; timeline views</div>
                            <div>
                                • Real-time cursors are 40% faster
                                <span className="inline-block w-1.5 h-3 ml-1 -mb-0.5 animate-pulse" style={{ background: "var(--scene-ai-500)" }} />
                            </div>
                        </div>

                        {/* Skills */}
                        <div className="flex flex-wrap gap-1 pt-2">
                            {[
                                { label: "Translate", scene: "editor" },
                                { label: "Fix grammar", scene: "collab" },
                                { label: "Add code", scene: "bitable" },
                                { label: "Diagram it", scene: "canvas" },
                            ].map((s) => (
                                <span key={s.label} className="chip" style={{ background: `var(--scene-${s.scene}-50)`, color: `var(--scene-${s.scene}-600)`, padding: "1px 8px", fontSize: 10 }}>
                                    {s.label}
                                </span>
                            ))}
                        </div>

                        {/* Citation */}
                        <div className="mt-2 text-[10px] text-[var(--kn-ink-soft)] italic">
                            Cited from: Q4 Product Roadmap · block #12
                        </div>
                    </div>
                </div>
            </div>

            {/* Input */}
            <div className="border-t px-3 py-2 flex items-center gap-2" style={{ borderColor: "var(--kn-line)" }}>
                <div className="flex-1 h-6 rounded-md border px-2 flex items-center text-[11px] text-[var(--kn-ink-soft)]" style={{ borderColor: "var(--kn-line)" }}>
                    Ask anything · press / for skills
                </div>
                <span className="text-[10px] rounded-md px-2 py-1" style={{ background: "var(--scene-ai-500)", color: "white" }}>Send</span>
            </div>
        </div>
    );
};
