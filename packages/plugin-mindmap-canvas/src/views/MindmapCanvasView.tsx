import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { MindmapDataPayload, MindmapNodeData, createDefaultMindmap } from "../nodes/default-data";

type CanvasNode = MindmapNodeData;

const NODE_RADIUS = 32;
const PADDING = 24;

const cloneData = (data?: MindmapDataPayload): MindmapDataPayload => ({
    nodes: data?.nodes ? data.nodes.map((n: MindmapNodeData) => ({ ...n })) : createDefaultMindmap().nodes,
});

export const MindmapCanvasView = (props: NodeViewProps) => {
    const { node, updateAttributes, editor } = props;
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [payload, setPayload] = useState<MindmapDataPayload>(() => cloneData(node.attrs.data));
    const [selectedId, setSelectedId] = useState<string>("root");
    const isEditable = editor.isEditable;

    const nodes = payload.nodes;

    const resizeCanvas = () => {
        const el = containerRef.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        setSize({ width, height });
        const canvas = canvasRef.current;
        if (canvas) {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            const ctx = canvas.getContext("2d");
            if (ctx) ctx.scale(dpr, dpr);
        }
    };

    useEffect(() => {
        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);
        return () => window.removeEventListener("resize", resizeCanvas);
    }, []);

    useEffect(() => {
        updateAttributes({
            ...node.attrs,
            data: payload,
        });
    }, [payload]);

    useEffect(() => {
        draw();
    }, [nodes, size]);

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, size.width, size.height);

        const getNode = (id: string) => nodes.find((n: CanvasNode) => n.id === id);

        ctx.lineWidth = 2;
        ctx.strokeStyle = "#cbd5e1";

        nodes.forEach((child: CanvasNode) => {
            if (!child.parentId) return;
            const parent = getNode(child.parentId);
            if (!parent) return;
            ctx.beginPath();
            ctx.moveTo(parent.x, parent.y);
            ctx.lineTo(child.x, child.y);
            ctx.stroke();
        });

        nodes.forEach((n: CanvasNode) => {
            const isSelected = selectedId === n.id;
            ctx.beginPath();
            ctx.fillStyle = isSelected ? "#2563eb" : "#0f172a";
            ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
            ctx.fill();

            ctx.font = "14px Inter, system-ui, -apple-system, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#fff";
            const text = n.label || "节点";
            const wrapped = wrapText(ctx, text, NODE_RADIUS * 2 - 10);
            wrapped.forEach((line, index) => {
                ctx.fillText(line, n.x, n.y + (index - (wrapped.length - 1) / 2) * 16);
            });
        });
    };

    const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
        const words = text.split(" ");
        const lines: string[] = [];
        let current = "";
        words.forEach((w) => {
            const test = current ? `${current} ${w}` : w;
            if (ctx.measureText(test).width > maxWidth) {
                if (current) lines.push(current);
                current = w;
            } else {
                current = test;
            }
        });
        if (current) lines.push(current);
        return lines;
    };

    const findNodeAt = (x: number, y: number) => {
        return nodes.find((n: CanvasNode) => {
            const dx = n.x - x;
            const dy = n.y - y;
            return Math.sqrt(dx * dx + dy * dy) <= NODE_RADIUS + PADDING / 2;
        });
    };

    const handleCanvasClick = (e: any) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const target = findNodeAt(x, y);
        if (target) setSelectedId(target.id);
    };

    const updatePayload = (updater: (draft: MindmapDataPayload) => MindmapDataPayload) => {
        setPayload((prev: MindmapDataPayload) => updater(cloneData(prev)));
    };

    const addChild = () => {
        const parent = nodes.find((n: CanvasNode) => n.id === selectedId) || nodes[0];
        const siblings = nodes.filter((n: CanvasNode) => n.parentId === parent.id);
        const side = parent.side === "left" ? "left" : parent.side === "right" ? "right" : siblings.length % 2 === 0 ? "left" : "right";
        const offsetX = side === "left" ? -160 : 160;
        const offsetY = (siblings.length - Math.floor(siblings.length / 2)) * 60 - 30;

        const newNode: CanvasNode = {
            id: nanoid(6),
            label: "新节点",
            x: parent.x + offsetX,
            y: parent.y + offsetY,
            parentId: parent.id,
            side,
        };

        updatePayload((draft) => ({ ...draft, nodes: [...draft.nodes, newNode] }));
        setSelectedId(newNode.id);
    };

    const addSibling = () => {
        const current = nodes.find((n: CanvasNode) => n.id === selectedId);
        if (!current || !current.parentId) return addChild();
        const parent = nodes.find((n: CanvasNode) => n.id === current.parentId);
        if (!parent) return;
        const siblings = nodes.filter((n: CanvasNode) => n.parentId === parent.id);
        const side = current.side;
        const offsetX = side === "left" ? -160 : 160;
        const offsetY = (siblings.length - Math.floor(siblings.length / 2)) * 60 - 30;

        const newNode: CanvasNode = {
            id: nanoid(6),
            label: "兄弟节点",
            x: parent.x + offsetX,
            y: parent.y + offsetY,
            parentId: parent.id,
            side,
        };
        updatePayload((draft) => ({ ...draft, nodes: [...draft.nodes, newNode] }));
        setSelectedId(newNode.id);
    };

    const deleteNode = () => {
        if (selectedId === "root") return;
        const toRemove = new Set<string>();
        const collect = (id: string) => {
            toRemove.add(id);
            nodes.filter((n: CanvasNode) => n.parentId === id).forEach((child: CanvasNode) => collect(child.id));
        };
        collect(selectedId);
        const remaining = nodes.filter((n) => !toRemove.has(n.id));
        setSelectedId("root");
        updatePayload((draft) => ({ ...draft, nodes: remaining }));
    };

    const onLabelChange = (value: string) => {
        updatePayload((draft: MindmapDataPayload) => ({
            ...draft,
            nodes: draft.nodes.map((n) => (n.id === selectedId ? { ...n, label: value } : n)),
        }));
    };

    const resetLayout = () => {
        setSelectedId("root");
        setPayload(cloneData(createDefaultMindmap()));
    };

    const selectedNode = useMemo(() => nodes.find((n: CanvasNode) => n.id === selectedId), [nodes, selectedId]);

    return (
        <NodeViewWrapper className="w-full">
            <div ref={containerRef} className="w-full h-[420px] border border-slate-200 rounded-lg shadow-sm bg-white">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
                    <span className="text-sm font-medium text-slate-700">Canvas 思维导图</span>
                    {isEditable && (
                        <div className="ml-auto flex items-center gap-2">
                            <button className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100" onClick={addChild}>
                                添加子节点
                            </button>
                            <button className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100" onClick={addSibling}>
                                添加兄弟节点
                            </button>
                            <button className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100" onClick={deleteNode}>
                                删除节点
                            </button>
                            <button className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100" onClick={resetLayout}>
                                重置布局
                            </button>
                        </div>
                    )}
                </div>
                {isEditable && selectedNode && (
                    <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                        <span className="text-xs text-slate-600">当前节点:</span>
                        <input
                            className="text-sm px-2 py-1 border border-slate-200 rounded w-60"
                            value={selectedNode.label}
                            onChange={(e: any) => onLabelChange(e.target.value)}
                        />
                        <span className="text-xs text-slate-500 ml-2">点击画布选择节点，支持添加/删除</span>
                    </div>
                )}
                <div className="h-[340px]">
                    <canvas ref={canvasRef} className="h-full w-full" onClick={handleCanvasClick} />
                </div>
            </div>
        </NodeViewWrapper>
    );
};
