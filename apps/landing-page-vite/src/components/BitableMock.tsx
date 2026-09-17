import React from "react";
import { TabPreview } from "./TabPreview";

const cellClass = "border-b px-2 py-1 text-[11px]";

const TableView: React.FC = () => (
    <div className="text-xs" style={{ background: "var(--kn-paper)" }}>
        <div className="grid grid-cols-[1.5fr_1fr_1fr_0.7fr] border-b font-medium" style={{ borderColor: "var(--kn-line)", color: "var(--kn-ink-mute)" }}>
            <div className={cellClass}>Task</div>
            <div className={cellClass}>Owner</div>
            <div className={cellClass}>Status</div>
            <div className={cellClass}>Due</div>
        </div>
        {[
            { t: "Design specs", o: "Alice", s: "Done", done: true, d: "Nov 12" },
            { t: "API contract", o: "Bob", s: "In progress", done: false, d: "Nov 18" },
            { t: "QA scenarios", o: "Chloé", s: "Pending", done: false, d: "Nov 25" },
            { t: "Launch email", o: "Dan", s: "In progress", done: false, d: "Dec 01" },
        ].map((r) => (
            <div key={r.t} className="grid grid-cols-[1.5fr_1fr_1fr_0.7fr] border-b" style={{ borderColor: "var(--kn-line)" }}>
                <div className={cellClass + " font-medium"} style={{ color: "var(--kn-ink)" }}>{r.t}</div>
                <div className={cellClass} style={{ color: "var(--kn-ink-soft)" }}>{r.o}</div>
                <div className={cellClass}>
                    <span className="rounded px-1.5 py-0.5 text-[10px]" style={r.done
                        ? { background: "var(--kn-accent-wash)", color: "var(--kn-accent-ink)" }
                        : { background: "var(--kn-tile)", color: "var(--kn-ink-soft)" }}>
                        {r.s}
                    </span>
                </div>
                <div className={cellClass} style={{ color: "var(--kn-ink-soft)" }}>{r.d}</div>
            </div>
        ))}
    </div>
);

const KanbanView: React.FC = () => {
    const cols = [
        { title: "Backlog", cards: ["Roadmap Q1", "Auth flow"] },
        { title: "In progress", cards: ["Bitable calendar", "Mobile menu"] },
        { title: "Done", cards: ["Slash search", "Dark mode"] },
    ];
    return (
        <div className="grid grid-cols-3 gap-2 p-3">
            {cols.map((c) => (
                <div key={c.title} className="rounded-md p-2" style={{ background: "var(--kn-paper-2)" }}>
                    <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: "var(--kn-ink-mute)" }}>{c.title}</div>
                    <div className="space-y-1.5">
                        {c.cards.map((card) => (
                            <div key={card} className="rounded border p-2 text-[11px]" style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)", color: "var(--kn-ink)" }}>
                                {card}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

const GalleryView: React.FC = () => {
    const cards = [
        { label: "Brand system", bars: [8, 14, 10] },
        { label: "User research", bars: [14, 8, 12] },
        { label: "Launch plan", bars: [10, 16, 7] },
        { label: "Metrics", bars: [16, 9, 12] },
        { label: "Partners", bars: [7, 12, 15] },
        { label: "Experiments", bars: [12, 14, 8] },
    ];
    return (
        <div className="grid grid-cols-3 gap-2 p-3">
            {cards.map((c) => (
                <div key={c.label} className="overflow-hidden rounded-md border" style={{ borderColor: "var(--kn-line)" }}>
                    <div className="grid h-10 place-items-center" style={{ background: "var(--kn-tile)" }}>
                        <div className="flex items-end gap-0.5">
                            {c.bars.map((h, i) => (
                                <span key={i} className="w-1 rounded-sm" style={{ height: h, background: i === 1 ? "var(--kn-accent)" : "var(--kn-ink-mute)" }} />
                            ))}
                        </div>
                    </div>
                    <div className="px-2 py-1.5 text-[11px]" style={{ color: "var(--kn-ink)" }}>{c.label}</div>
                </div>
            ))}
        </div>
    );
};

const CalendarView: React.FC = () => {
    const events: Record<number, string> = { 4: "var(--kn-accent)", 10: "var(--kn-ink-mute)", 17: "var(--kn-ink-mute)", 22: "var(--kn-accent)" };
    return (
        <div className="p-3">
            <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[9px]" style={{ color: "var(--kn-ink-mute)" }}>
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={d + i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: 28 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-sm p-0.5 text-[9px]" style={{ background: "var(--kn-paper-2)", color: "var(--kn-ink-mute)" }}>
                        <div>{i + 1}</div>
                        {events[i] && <div className="mt-0.5 h-1 rounded-full" style={{ background: events[i] }} />}
                    </div>
                ))}
            </div>
        </div>
    );
};

export const BitableMock: React.FC = () => {
    return (
        <TabPreview
            tabs={[
                { key: "table", label: "Table", content: <TableView /> },
                { key: "kanban", label: "Kanban", content: <KanbanView /> },
                { key: "gallery", label: "Gallery", content: <GalleryView /> },
                { key: "calendar", label: "Calendar", content: <CalendarView /> },
            ]}
        />
    );
};
