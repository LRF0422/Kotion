import React from "react";
import { TabPreview } from "./TabPreview";

const Excalidraw: React.FC = () => (
    <svg viewBox="0 0 320 180" className="w-full h-full">
        <defs>
            <filter id="rough" x="0" y="0">
                <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" />
                <feDisplacementMap in="SourceGraphic" scale="1.2" />
            </filter>
        </defs>
        <g filter="url(#rough)" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="30" y="30" width="90" height="55" rx="4" stroke="var(--scene-canvas-600)" />
            <text x="45" y="63" fontSize="12" fill="var(--kn-ink)" style={{ fontFamily: "ui-serif" }}>Idea</text>

            <rect x="200" y="30" width="90" height="55" rx="4" stroke="var(--scene-editor-600)" />
            <text x="215" y="63" fontSize="12" fill="var(--kn-ink)" style={{ fontFamily: "ui-serif" }}>Draft</text>

            <path d="M120 57 C 150 20, 175 20, 200 57" stroke="var(--kn-ink-soft)" />
            <polygon points="200,57 193,52 193,62" fill="var(--kn-ink-soft)" />

            <ellipse cx="115" cy="140" rx="55" ry="24" stroke="var(--scene-ai-600)" />
            <text x="90" y="145" fontSize="12" fill="var(--kn-ink)" style={{ fontFamily: "ui-serif" }}>Publish</text>

            <path d="M75 85 C 60 105, 80 130, 100 130" stroke="var(--kn-ink-soft)" />
            <polygon points="100,130 93,125 93,135" fill="var(--kn-ink-soft)" />
        </g>
    </svg>
);

const Mermaid: React.FC = () => (
    <div className="text-[11px] font-mono leading-relaxed p-3" style={{ background: "var(--kn-paper-2)", color: "var(--kn-ink-soft)" }}>
        <div>graph LR</div>
        <div className="pl-4"><span style={{ color: "var(--scene-editor-600)" }}>A[Idea]</span> --&gt; <span style={{ color: "var(--scene-ai-600)" }}>B[AI Draft]</span></div>
        <div className="pl-4"><span style={{ color: "var(--scene-ai-600)" }}>B</span> --&gt; <span style={{ color: "var(--scene-collab-600)" }}>C[Review]</span></div>
        <div className="pl-4"><span style={{ color: "var(--scene-collab-600)" }}>C</span> --&gt; <span style={{ color: "var(--scene-bitable-600)" }}>D[Publish]</span></div>
        <div className="mt-2 h-[1px]" style={{ background: "var(--kn-line)" }} />
        <div className="mt-2 grid grid-cols-4 gap-2 items-center">
            {["Idea", "AI Draft", "Review", "Publish"].map((n, i) => (
                <React.Fragment key={n}>
                    <div className="rounded-md py-1 px-2 text-center text-[10px]" style={{ background: `var(--scene-${["editor", "ai", "collab", "bitable"][i]}-100)`, color: `var(--scene-${["editor", "ai", "collab", "bitable"][i]}-600)` }}>
                        {n}
                    </div>
                    {i < 3 && <span className="text-center text-[var(--kn-ink-soft)]">→</span>}
                </React.Fragment>
            )).slice(0, 7)}
        </div>
    </div>
);

const Mindmap: React.FC = () => (
    <svg viewBox="0 0 320 180" className="w-full h-full">
        <g fontFamily="ui-serif" fontSize="11">
            <rect x="140" y="80" width="60" height="26" rx="13" fill="var(--scene-editor-100)" />
            <text x="170" y="97" textAnchor="middle" fill="var(--scene-editor-600)" fontWeight="600">Kotion</text>
            {[
                { x: 40, y: 20, label: "Editor", scene: "editor" },
                { x: 40, y: 145, label: "Bitable", scene: "bitable" },
                { x: 240, y: 20, label: "AI", scene: "ai" },
                { x: 240, y: 145, label: "Canvas", scene: "canvas" },
            ].map((n) => (
                <g key={n.label}>
                    <path d={`M170 93 Q ${(170 + n.x + 30) / 2} ${(93 + n.y + 13) / 2}, ${n.x + 30} ${n.y + 13}`} stroke="var(--kn-line)" strokeWidth="1.5" fill="none" />
                    <rect x={n.x} y={n.y} width="60" height="26" rx="13" fill={`var(--scene-${n.scene}-100)`} />
                    <text x={n.x + 30} y={n.y + 17} textAnchor="middle" fill={`var(--scene-${n.scene}-600)`} fontWeight="600">{n.label}</text>
                </g>
            ))}
        </g>
    </svg>
);

const DrawIO: React.FC = () => (
    <svg viewBox="0 0 320 180" className="w-full h-full">
        <g fontFamily="ui-sans-serif" fontSize="10">
            <rect x="30" y="70" width="70" height="40" fill="var(--scene-editor-100)" stroke="var(--scene-editor-500)" />
            <text x="65" y="94" textAnchor="middle" fill="var(--scene-editor-600)">Client</text>
            <path d="M100 90 L 140 90" stroke="var(--kn-ink-soft)" markerEnd="url(#arr)" />
            <rect x="140" y="70" width="70" height="40" rx="6" fill="var(--scene-collab-100)" stroke="var(--scene-collab-500)" />
            <text x="175" y="94" textAnchor="middle" fill="var(--scene-collab-600)">Hocuspocus</text>
            <path d="M210 90 L 250 90" stroke="var(--kn-ink-soft)" markerEnd="url(#arr)" />
            <rect x="250" y="70" width="60" height="40" rx="20" fill="var(--scene-bitable-100)" stroke="var(--scene-bitable-500)" />
            <text x="280" y="94" textAnchor="middle" fill="var(--scene-bitable-600)">DB</text>
            <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0 0 L 10 5 L 0 10 z" fill="var(--kn-ink-soft)" />
                </marker>
            </defs>
        </g>
    </svg>
);

export const CanvasMock: React.FC = () => (
    <TabPreview
        scene="canvas"
        tabs={[
            { key: "excalidraw", label: "Excalidraw", content: <div className="aspect-[16/9]"><Excalidraw /></div> },
            { key: "drawio", label: "DrawIO", content: <div className="aspect-[16/9]"><DrawIO /></div> },
            { key: "mermaid", label: "Mermaid", content: <Mermaid /> },
            { key: "mindmap", label: "Mindmap", content: <div className="aspect-[16/9]"><Mindmap /></div> },
        ]}
    />
);
