import React from "react";
import { Sparkles } from "@kn/icon";

/**
 * AIMock renders a chat-style panel with a model switcher, streaming
 * tokens, skill chips and a citation — in the collapsed palette.
 */
export const AIMock: React.FC = () => {
    const models = ["DeepSeek", "Claude", "GPT"];
    const skills = ["Translate", "Fix grammar", "Add code", "Diagram it"];

    return (
        <div className="overflow-hidden rounded-md border text-sm" style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)" }}>
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--kn-line)" }}>
                <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: "var(--kn-accent)", color: "#ffffff" }}>
                    <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="text-[12px] font-medium" style={{ color: "var(--kn-ink)" }}>AI Assistant</span>
                <div className="ml-auto flex items-center gap-1">
                    {models.map((m, i) => (
                        <span
                            key={m}
                            className="rounded px-1.5 py-0.5 text-[10px]"
                            style={i === 0
                                ? { background: "var(--kn-tile)", color: "var(--kn-ink)" }
                                : { color: "var(--kn-ink-mute)" }}
                        >
                            {m}
                        </span>
                    ))}
                </div>
            </div>

            {/* Body */}
            <div className="space-y-3 p-3">
                <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-md px-3 py-1.5 text-[12px]" style={{ background: "var(--kn-tile)", color: "var(--kn-ink)" }}>
                        Summarise this doc into 3 bullets for the release notes.
                    </div>
                </div>

                <div className="flex gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ background: "var(--kn-tile)", color: "var(--kn-accent)" }}>
                        <Sparkles className="h-3 w-3" />
                    </span>
                    <div className="flex-1 space-y-1">
                        <div className="text-[12px]" style={{ color: "var(--kn-ink)" }}>Here are the key highlights:</div>
                        <div className="space-y-1 text-[12px]" style={{ color: "var(--kn-ink-soft)" }}>
                            <div>• Slash commands now support inline AI actions</div>
                            <div>• Bitable adds calendar &amp; timeline views</div>
                            <div>
                                • Real-time cursors are 40% faster
                                <span className="ml-1 inline-block h-3 w-1.5 -mb-0.5 animate-pulse" style={{ background: "var(--kn-accent)" }} />
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1 pt-2">
                            {skills.map((label) => (
                                <span key={label} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "var(--kn-tile)", color: "var(--kn-ink-soft)" }}>
                                    {label}
                                </span>
                            ))}
                        </div>

                        <div className="mt-2 font-mono text-[10px] italic" style={{ color: "var(--kn-ink-mute)" }}>
                            Cited from: Q4 Product Roadmap · block #12
                        </div>
                    </div>
                </div>
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: "var(--kn-line)" }}>
                <div className="flex h-6 flex-1 items-center rounded-md border px-2 text-[11px]" style={{ borderColor: "var(--kn-line)", color: "var(--kn-ink-mute)" }}>
                    Ask anything · press / for skills
                </div>
                <span className="rounded-md px-2 py-1 text-[10px]" style={{ background: "var(--kn-ink)", color: "var(--kn-paper)" }}>Send</span>
            </div>
        </div>
    );
};
