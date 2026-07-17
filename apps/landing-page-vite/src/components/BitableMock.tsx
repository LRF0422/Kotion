import React from "react";
import { TabPreview } from "./TabPreview";

const cellClass = "px-2 py-1 border-b text-[11px]";

const TableView: React.FC = () => (
    <div className="text-xs" style={{ background: "var(--kn-paper)" }}>
        <div className="grid grid-cols-[1.5fr_1fr_1fr_0.7fr] border-b font-medium text-[var(--kn-ink-soft)]" style={{ borderColor: "var(--kn-line)" }}>
            <div className={cellClass}>Task</div>
            <div className={cellClass}>Owner</div>
            <div className={cellClass}>Status</div>
            <div className={cellClass}>Due</div>
        </div>
        {[
            { t: "Design specs", o: "Alice", s: "Done", c: "collab", d: "Nov 12" },
            { t: "API contract", o: "Bob", s: "In progress", c: "editor", d: "Nov 18" },
            { t: "QA scenarios", o: "Chloé", s: "Pending", c: "canvas", d: "Nov 25" },
            { t: "Launch email", o: "Dan", s: "In progress", c: "editor", d: "Dec 01" },
        ].map((r) => (
            <div key={r.t} className="grid grid-cols-[1.5fr_1fr_1fr_0.7fr] border-b" style={{ borderColor: "var(--kn-line)" }}>
                <div className={`${cellClass} font-medium`} style={{ color: "var(--kn-ink)" }}>{r.t}</div>
                <div className={cellClass}>{r.o}</div>
                <div className={cellClass}>
                    <span className="chip" style={{ background: `var(--scene-${r.c}-50)`, color: `var(--scene-${r.c}-600)`, padding: "1px 8px" }}>{r.s}</span>
                </div>
                <div className={cellClass}>{r.d}</div>
            </div>
        ))}
    </div>
);

const KanbanView: React.FC = () => {
    const cols = [
        { title: "Backlog", scene: "selfhost", cards: ["Roadmap Q1", "Auth flow"] },
        { title: "In progress", scene: "editor", cards: ["Bitable calendar", "Mobile menu"] },
        { title: "Done", scene: "collab", cards: ["Slash search", "Dark mode"] },
    ];
    return (
        <div className="grid grid-cols-3 gap-2 p-3">
            {cols.map((c) => (
                <div key={c.title} className="rounded-md p-2" style={{ background: `var(--scene-${c.scene}-50)` }}>
                    <div className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: `var(--scene-${c.scene}-600)` }}>
                        {c.title}
                    </div>
                    <div className="space-y-1.5">
                        {c.cards.map((card) => (
                            <div key={card} className="rounded p-2 text-[11px] shadow-sm border" style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)", color: "var(--kn-ink)" }}>
                                {card}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

const GalleryView: React.FC = () => (
    <div className="grid grid-cols-3 gap-2 p-3">
        {[
            { emoji: "🎨", label: "Brand system", scene: "canvas" },
            { emoji: "🧭", label: "User research", scene: "editor" },
            { emoji: "🚀", label: "Launch plan", scene: "ai" },
            { emoji: "📊", label: "Metrics", scene: "bitable" },
            { emoji: "🤝", label: "Partners", scene: "collab" },
            { emoji: "🧪", label: "Experiments", scene: "selfhost" },
        ].map((c) => (
            <div key={c.label} className="rounded-md overflow-hidden border" style={{ borderColor: "var(--kn-line)" }}>
                <div className="h-10 grid place-items-center text-lg" style={{ background: `var(--scene-${c.scene}-100)` }}>{c.emoji}</div>
                <div className="px-2 py-1.5 text-[11px]" style={{ color: "var(--kn-ink)" }}>{c.label}</div>
            </div>
        ))}
    </div>
);

const CalendarView: React.FC = () => (
    <div className="p-3">
        <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] mb-1 text-[var(--kn-ink-soft)]">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={`${d}-${i}`}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: 28 }).map((_, i) => {
                const events = i === 4 ? "editor" : i === 10 ? "ai" : i === 17 ? "collab" : i === 22 ? "bitable" : null;
                return (
                    <div key={i} className="aspect-square rounded-sm text-[9px] p-0.5" style={{ background: "var(--kn-paper-2)", color: "var(--kn-ink-soft)" }}>
                        <div>{i + 1}</div>
                        {events && (
                            <div className="mt-0.5 h-1 rounded-full" style={{ background: `var(--scene-${events}-500)` }} />
                        )}
                    </div>
                );
            })}
        </div>
    </div>
);

export const BitableMock: React.FC = () => {
    return (
        <TabPreview
            scene="bitable"
            tabs={[
                { key: "table", label: "Table", content: <TableView /> },
                { key: "kanban", label: "Kanban", content: <KanbanView /> },
                { key: "gallery", label: "Gallery", content: <GalleryView /> },
                { key: "calendar", label: "Calendar", content: <CalendarView /> },
            ]}
        />
    );
};
