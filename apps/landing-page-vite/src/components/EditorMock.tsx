import React from "react";
import { Sparkles, Database, Palette, GitBranch } from "@kn/icon";

/**
 * EditorMock renders a stylised Tiptap editor with a toolbar, a heading,
 * a slash-command popover, a checklist and a code block. Icons are real
 * components (no emoji) and the palette is the collapsed ink + accent set.
 */
export const EditorMock: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const commands = [
        { icon: <Sparkles className="h-3.5 w-3.5" />, name: "AI Assistant", desc: "Ask, write, transform" },
        { icon: <Database className="h-3.5 w-3.5" />, name: "Bitable", desc: "Multi-view database" },
        { icon: <Palette className="h-3.5 w-3.5" />, name: "Excalidraw", desc: "Hand-drawn canvas" },
        { icon: <GitBranch className="h-3.5 w-3.5" />, name: "Mermaid", desc: "Diagram from text" },
    ];
    const rows = [
        { done: true, text: "Design system update", tag: "Design" },
        { done: false, text: "API integration for real-time sync", tag: "Backend" },
        { done: false, text: "Performance testing", tag: "QA" },
    ];

    return (
        <div className="relative w-full" style={{ background: "var(--kn-paper)" }}>
            {/* toolbar */}
            <div className="flex items-center gap-1 border-b px-4 py-2" style={{ borderColor: "var(--kn-line)" }}>
                {["B", "I", "U", "S"].map((k) => (
                    <span key={k} className="grid h-6 w-6 place-items-center rounded text-[11px] font-semibold" style={{ color: "var(--kn-ink-soft)" }}>
                        {k}
                    </span>
                ))}
                <span className="mx-1 h-4 w-px" style={{ background: "var(--kn-line)" }} />
                <span className="chip px-2 py-0.5 text-[10px]">H1</span>
                <span className="chip px-2 py-0.5 text-[10px]">H2</span>
                <span className="chip px-2 py-0.5 text-[10px]">Quote</span>
                <span className="ml-auto font-mono text-[10px]" style={{ color: "var(--kn-ink-mute)" }}>Auto-saved</span>
            </div>

            {/* body */}
            <div className={"px-5 py-6 md:px-8 " + (compact ? "text-[12px]" : "text-sm")}>
                <div className="text-xl font-semibold tracking-[-0.02em] md:text-2xl" style={{ color: "var(--kn-ink)" }}>
                    Q4 Product Roadmap
                </div>
                <div className="mt-1 font-mono text-[10px]" style={{ color: "var(--kn-ink-mute)" }}>
                    Last edited by Alice · 3 collaborators online
                </div>

                <p className="mt-4 leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                    A living document for the team. Type{" "}
                    <span className="inline-block rounded px-1.5 py-0.5 font-mono text-[11px]" style={{ background: "var(--kn-paper-2)", color: "var(--kn-accent-ink)" }}>
                        /
                    </span>{" "}
                    to insert anything: charts, canvases, databases, AI blocks.
                </p>

                {/* slash command popover */}
                <div className="mt-3 max-w-xs overflow-hidden rounded-md border" style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper)" }}>
                    <div className="border-b px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em]" style={{ borderColor: "var(--kn-line)", color: "var(--kn-ink-mute)" }}>
                        Slash commands
                    </div>
                    {commands.map((row, i) => (
                        <div
                            key={row.name}
                            className="flex items-center gap-2 px-3 py-2 text-[12px]"
                            style={i === 0 ? { background: "var(--kn-paper-2)" } : undefined}
                        >
                            <span style={{ color: i === 0 ? "var(--kn-accent)" : "var(--kn-ink-soft)" }}>{row.icon}</span>
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-medium" style={{ color: "var(--kn-ink)" }}>{row.name}</div>
                                <div className="truncate text-[10px]" style={{ color: "var(--kn-ink-mute)" }}>{row.desc}</div>
                            </div>
                            {i === 0 && <span className="text-[10px]" style={{ color: "var(--kn-ink-mute)" }}>Enter</span>}
                        </div>
                    ))}
                </div>

                {/* checklist */}
                <div className="mt-4 space-y-2">
                    {rows.map((row) => (
                        <div key={row.text} className="flex items-center gap-2 text-[12px]">
                            <span
                                className="grid h-4 w-4 place-items-center rounded-[4px] border"
                                style={{
                                    borderColor: row.done ? "var(--kn-accent)" : "var(--kn-line-strong)",
                                    background: row.done ? "var(--kn-accent)" : "transparent",
                                }}
                            >
                                {row.done && (
                                    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </span>
                            <span className={row.done ? "flex-1 line-through" : "flex-1"} style={{ color: row.done ? "var(--kn-ink-mute)" : "var(--kn-ink)" }}>
                                {row.text}
                            </span>
                            <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "var(--kn-tile)", color: "var(--kn-ink-soft)" }}>
                                {row.tag}
                            </span>
                        </div>
                    ))}
                </div>

                {/* code block */}
                <div className="mt-4 overflow-hidden rounded-md" style={{ background: "#101010" }}>
                    <div className="flex items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                        <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>plugin.ts</span>
                    </div>
                    <pre className="px-3 py-2 font-mono text-[11px] leading-relaxed" style={{ color: "#d6d3ca" }}>
{["export const aiPlugin: ExtensionWrapper = {", "  name: 'ai',", "  slashConfig: { name: 'AI', run: openAI },", "  tools: [askAI, summarize, translate],", "}"].join("\n")}
                    </pre>
                </div>
            </div>

            {/* Floating AI bubble */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3" style={{ background: "var(--kn-accent)", color: "#ffffff" }}>
                <Sparkles className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Improve writing</span>
            </div>
        </div>
    );
};
