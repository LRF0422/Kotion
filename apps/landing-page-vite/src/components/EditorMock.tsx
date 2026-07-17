import React from "react";
import { Sparkles } from "@kn/icon";

/**
 * EditorMock renders a stylised Tiptap editor with:
 *  - toolbar
 *  - a heading + paragraph
 *  - a slash-command popover
 *  - a checklist and code block
 *  - a floating AI bubble
 */
export const EditorMock: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    return (
        <div className="relative w-full" style={{ background: "var(--kn-paper)" }}>
            {/* toolbar */}
            <div className="flex items-center gap-1 px-4 py-2 border-b" style={{ borderColor: "var(--kn-line)" }}>
                {["B", "I", "U", "S"].map((k) => (
                    <span key={k} className="w-6 h-6 grid place-items-center rounded text-[11px] font-semibold text-[var(--kn-ink-soft)] hover:bg-[var(--kn-paper-2)]">
                        {k}
                    </span>
                ))}
                <span className="mx-1 h-4 w-px bg-[var(--kn-line)]" />
                <span className="chip" style={{ padding: "2px 8px", fontSize: 10 }}>H1</span>
                <span className="chip" style={{ padding: "2px 8px", fontSize: 10 }}>H2</span>
                <span className="chip" style={{ padding: "2px 8px", fontSize: 10 }}>Quote</span>
                <span className="ml-auto text-[10px] text-[var(--kn-ink-soft)]">Auto-saved · just now</span>
            </div>

            {/* body */}
            <div className={`px-5 md:px-8 py-6 ${compact ? "text-[12px]" : "text-sm"}`}>
                <div className="font-serif text-2xl md:text-3xl font-semibold tracking-tight leading-tight" style={{ color: "var(--kn-ink)" }}>
                    Q4 Product Roadmap
                </div>
                <div className="mt-1 text-xs text-[var(--kn-ink-soft)]">Last edited by Alice · 3 collaborators online</div>

                <p className="mt-4 text-[var(--kn-ink-soft)] leading-relaxed">
                    A living document for the team. Type <span className="inline-block px-1.5 py-0.5 rounded font-mono text-[11px]" style={{ background: "var(--kn-paper-2)", color: "var(--scene-editor-600)" }}>/</span> to insert anything: charts, canvases, databases, AI blocks.
                </p>

                {/* slash command popover */}
                <div className="mt-3 max-w-xs rounded-lg border shadow-lg overflow-hidden" style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper)" }}>
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--kn-ink-soft)] border-b" style={{ borderColor: "var(--kn-line)" }}>
                        Slash commands
                    </div>
                    {[
                        { icon: "🧠", name: "AI Assistant", desc: "Ask, write, transform" },
                        { icon: "📊", name: "Bitable", desc: "Multi-view database" },
                        { icon: "🎨", name: "Excalidraw", desc: "Hand-drawn canvas" },
                        { icon: "🌊", name: "Mermaid", desc: "Diagram from text" },
                    ].map((row, i) => (
                        <div
                            key={row.name}
                            className="flex items-center gap-2 px-3 py-2 text-[12px]"
                            style={i === 0 ? { background: "var(--scene-editor-50)" } : undefined}
                        >
                            <span className="text-base">{row.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium truncate" style={{ color: "var(--kn-ink)" }}>{row.name}</div>
                                <div className="truncate text-[10px] text-[var(--kn-ink-soft)]">{row.desc}</div>
                            </div>
                            {i === 0 && <span className="text-[10px] text-[var(--scene-editor-600)]">↵</span>}
                        </div>
                    ))}
                </div>

                {/* checklist */}
                <div className="mt-4 space-y-2">
                    {[
                        { done: true, text: "Design system update", tag: "Design", tagColor: "collab" as const },
                        { done: false, text: "API integration for real-time sync", tag: "Backend", tagColor: "editor" as const },
                        { done: false, text: "Performance testing", tag: "QA", tagColor: "canvas" as const },
                    ].map((row) => (
                        <div key={row.text} className="flex items-center gap-2 text-[12px]">
                            <span
                                className="w-4 h-4 rounded border-2 grid place-items-center"
                                style={{
                                    borderColor: row.done ? "var(--scene-collab-500)" : "var(--kn-line)",
                                    background: row.done ? "var(--scene-collab-500)" : "transparent",
                                }}
                            >
                                {row.done && (
                                    <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </span>
                            <span className={`flex-1 ${row.done ? "line-through" : ""}`} style={{ color: row.done ? "var(--kn-ink-soft)" : "var(--kn-ink)" }}>
                                {row.text}
                            </span>
                            <span
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ background: `var(--scene-${row.tagColor}-50)`, color: `var(--scene-${row.tagColor}-600)` }}
                            >
                                {row.tag}
                            </span>
                        </div>
                    ))}
                </div>

                {/* code block */}
                <div className="mt-4 rounded-lg overflow-hidden" style={{ background: "#0d1117" }}>
                    <div className="px-3 py-1.5 border-b border-white/5 flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 font-mono">plugin.ts</span>
                    </div>
                    <pre className="px-3 py-2 text-[11px] font-mono text-gray-300 leading-relaxed">
{`export const aiPlugin: ExtensionWrapper = {
  name: 'ai',
  slashConfig: { name: 'AI', run: openAI },
  tools: [askAI, summarize, translate],
}`}
                    </pre>
                </div>
            </div>

            {/* Floating AI bubble */}
            <div className="absolute right-5 bottom-5 flex items-center gap-2 rounded-full shadow-lg pl-2 pr-3 py-1.5"
                style={{ background: "var(--scene-ai-600)", color: "white" }}>
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">Improve writing…</span>
            </div>
        </div>
    );
};
