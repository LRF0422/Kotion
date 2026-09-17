import React from "react";
import { TabPreview } from "./TabPreview";

const Excalidraw: React.FC = () => (
    <svg viewBox="0 0 320 180" className="h-full w-full">
        <g fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="30" y="30" width="90" height="55" rx="4" stroke="var(--kn-ink-soft)" />
            <text x="46" y="63" fontSize="12" fill="var(--kn-ink)" fontFamily="ui-sans-serif, sans-serif">Idea</text>

            <rect x="200" y="30" width="90" height="55" rx="4" stroke="var(--kn-ink-soft)" />
            <text x="216" y="63" fontSize="12" fill="var(--kn-ink)" fontFamily="ui-sans-serif, sans-serif">Draft</text>

            <path d="M120 57 C 150 20, 175 20, 200 57" stroke="var(--kn-ink-mute)" />
            <polygon points="200,57 193,52 193,62" fill="var(--kn-ink-mute)" />

            <ellipse cx="115" cy="140" rx="55" ry="24" stroke="var(--kn-accent)" />
            <text x="88" y="145" fontSize="12" fill="var(--kn-ink)" fontFamily="ui-sans-serif, sans-serif">Publish</text>

            <path d="M75 85 C 60 105, 80 130, 100 130" stroke="var(--kn-ink-mute)" />
            <polygon points="100,130 93,125 93,135" fill="var(--kn-ink-mute)" />
        </g>
    </svg>
);

const Mermaid: React.FC = () => (
    <div className="p-3 font-mono text-[11px] leading-relaxed" style={{ background: "var(--kn-paper-2)", color: "var(--kn-ink-soft)" }}>
        <div>graph LR</div>
        <div className="pl-4">A[Idea] --&gt; B[AI Draft]</div>
        <div className="pl-4">B --&gt; C[Review]</div>
        <div className="pl-4">C --&gt; D[Publish]</div>
        <div className="mt-2 h-px" style={{ background: "var(--kn-line)" }} />
        <div className="mt-2 flex items-center gap-2">
            {["Idea", "AI Draft", "Review", "Publish"].map((n, i) => (
                <React.Fragment key={n}>
                    {i > 0 && <span style={{ color: "var(--kn-ink-mute)" }}>&rarr;</span>}
                    <div
                        className="rounded-md px-2 py-1 text-center text-[10px]"
                        style={i === 1
                            ? { background: "var(--kn-accent-wash)", color: "var(--kn-accent-ink)" }
                            : { background: "var(--kn-tile)", color: "var(--kn-ink-soft)" }}
                    >
                        {n}
                    </div>
                </React.Fragment>
            ))}
        </div>
    </div>
);

const Mindmap: React.FC = () => {
    const nodes = [
        { x: 40, y: 20, label: "Editor" },
        { x: 40, y: 145, label: "Bitable" },
        { x: 240, y: 20, label: "AI" },
        { x: 240, y: 145, label: "Canvas" },
    ];
    return (
        <svg viewBox="0 0 320 180" className="h-full w-full">
            <g fontFamily="ui-sans-serif, sans-serif" fontSize="11">
                <rect x="140" y="80" width="60" height="26" rx="13" fill="var(--kn-accent)" />
                <text x="170" y="97" textAnchor="middle" fill="#ffffff" fontWeight="600">Kotion</text>
                {nodes.map((n) => (
                    <g key={n.label}>
                        <path
                            d={"M170 93 Q " + ((170 + n.x + 30) / 2) + " " + ((93 + n.y + 13) / 2) + ", " + (n.x + 30) + " " + (n.y + 13)}
                            stroke="var(--kn-line-strong)"
                            strokeWidth="1.5"
                            fill="none"
                        />
                        <rect x={n.x} y={n.y} width="60" height="26" rx="13" fill="var(--kn-tile)" stroke="var(--kn-line)" />
                        <text x={n.x + 30} y={n.y + 17} textAnchor="middle" fill="var(--kn-ink-soft)" fontWeight="600">{n.label}</text>
                    </g>
                ))}
            </g>
        </svg>
    );
};

const DrawIO: React.FC = () => (
    <svg viewBox="0 0 320 180" className="h-full w-full">
        <defs>
            <marker id="kn-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 L 10 5 L 0 10 z" fill="var(--kn-ink-mute)" />
            </marker>
        </defs>
        <g fontFamily="ui-sans-serif, sans-serif" fontSize="10">
            <rect x="30" y="70" width="70" height="40" fill="var(--kn-paper-2)" stroke="var(--kn-line-strong)" />
            <text x="65" y="94" textAnchor="middle" fill="var(--kn-ink)">Client</text>
            <path d="M100 90 L 140 90" stroke="var(--kn-ink-mute)" markerEnd="url(#kn-arrow)" />
            <rect x="140" y="70" width="70" height="40" rx="6" fill="var(--kn-tile)" stroke="var(--kn-line-strong)" />
            <text x="175" y="94" textAnchor="middle" fill="var(--kn-ink)">Hocuspocus</text>
            <path d="M210 90 L 250 90" stroke="var(--kn-ink-mute)" markerEnd="url(#kn-arrow)" />
            <rect x="250" y="70" width="60" height="40" rx="20" fill="var(--kn-paper-2)" stroke="var(--kn-line-strong)" />
            <text x="280" y="94" textAnchor="middle" fill="var(--kn-ink)">DB</text>
        </g>
    </svg>
);

export const CanvasMock: React.FC = () => (
    <TabPreview
        tabs={[
            { key: "excalidraw", label: "Excalidraw", content: <div className="aspect-[16/9]"><Excalidraw /></div> },
            { key: "drawio", label: "DrawIO", content: <div className="aspect-[16/9]"><DrawIO /></div> },
            { key: "mermaid", label: "Mermaid", content: <Mermaid /> },
            { key: "mindmap", label: "Mindmap", content: <div className="aspect-[16/9]"><Mindmap /></div> },
        ]}
    />
);
