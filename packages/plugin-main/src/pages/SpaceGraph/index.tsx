import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
    forceCenter,
    forceCollide,
    forceLink,
    forceManyBody,
    forceSimulation,
    type Simulation,
} from "d3-force";
import { useApi, useNavigator, useParams, useSearchParams, useTranslation } from "@kn/common";
import { useResponsive, Button, Input, cn } from "@kn/ui";
import { Network, Loader2, RefreshCw, Maximize2, X, ZoomIn, ZoomOut, Layers } from "@kn/icon";
import { APIS } from "../../api";
import type { GraphEdge, GraphNode, SimLink, SimNode, ViewTransform } from "./types";

/** Distinct-enough palette; spaces are colored by stable index into this list. */
const PALETTE = [
    "#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#3b82f6",
];

const MIN_RADIUS = 6;
const MAX_RADIUS = 18;

/** Resolve a sim link endpoint (id string before layout, SimNode after). */
const endId = (e: string | SimNode | number): string =>
    typeof e === "object" ? (e as SimNode).id : String(e);

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const clampZoom = (k: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
const pointerDist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

export const SpaceGraph: React.FC = () => {
    const { t } = useTranslation();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const navigator = useNavigator();
    const { isMobile } = useResponsive();

    // Optional page to focus on (opened from a page's "···" menu → ?focus=<pageId>).
    const focusParam = searchParams.get("focus");
    const [focusId, setFocusId] = useState<string | null>(focusParam);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nodes, setNodes] = useState<SimNode[]>([]);
    const [links, setLinks] = useState<SimLink[]>([]);
    const [query, setQuery] = useState("");
    const [hovered, setHovered] = useState<string | null>(null);
    const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, k: 1 });
    const [reloadFlag, setReloadFlag] = useState(0);
    // On mobile the legend is hidden by default and toggled via a floating button.
    const [showLegend, setShowLegend] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
    const sizeRef = useRef({ w: 0, h: 0 });
    const rafRef = useRef<number | null>(null);
    // Re-render on each throttled simulation tick without recreating state arrays.
    const [, bumpTick] = useReducer((n: number) => n + 1, 0);

    // Interaction refs (kept off React state to avoid re-render storms while dragging).
    const dragNodeRef = useRef<SimNode | null>(null);
    const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
    const movedRef = useRef(false);
    // Active pointers on the background, keyed by pointerId, for two-finger pinch-zoom.
    const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const pinchRef = useRef<{ dist: number; cx: number; cy: number; view: ViewTransform } | null>(null);
    // Focus centering: read inside the tick loop; only auto-center once per focus.
    const focusIdRef = useRef<string | null>(focusId);
    const didCenterRef = useRef(false);
    useEffect(() => {
        focusIdRef.current = focusId;
        didCenterRef.current = false;
    }, [focusId]);

    // --- Fetch graph data ---
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        useApi(APIS.GET_SPACE_GRAPH)
            .then((res) => {
                if (cancelled) return;
                const data = res.data || {};
                const rawNodes: GraphNode[] = data.nodes || [];
                const rawEdges: GraphEdge[] = data.edges || [];

                // Degree (in+out) drives node radius.
                const degree: Record<string, number> = {};
                const validIds = new Set(rawNodes.map((n) => n.id));
                const safeEdges = rawEdges.filter(
                    (e) => validIds.has(e.source) && validIds.has(e.target),
                );
                safeEdges.forEach((e) => {
                    degree[e.source] = (degree[e.source] || 0) + 1;
                    degree[e.target] = (degree[e.target] || 0) + 1;
                });

                setNodes(
                    rawNodes.map((n) => ({ ...n, degree: degree[n.id] || 0 })),
                );
                setLinks(
                    safeEdges.map((e) => ({
                        source: e.source,
                        target: e.target,
                        linkKind: e.linkKind,
                    })),
                );
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Failed to load space graph:", err);
                setError(t("graph.error"));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [reloadFlag, t]);

    // Stable color per space id.
    const spaceColor = useMemo(() => {
        const map = new Map<string, string>();
        let i = 0;
        nodes.forEach((n) => {
            if (n.spaceId && !map.has(n.spaceId)) {
                map.set(n.spaceId, PALETTE[i % PALETTE.length]);
                i += 1;
            }
        });
        return map;
    }, [nodes]);

    const legend = useMemo(() => {
        const seen = new Map<string, string>();
        nodes.forEach((n) => {
            if (n.spaceId && !seen.has(n.spaceId)) {
                seen.set(n.spaceId, n.spaceName || n.spaceId);
            }
        });
        return Array.from(seen.entries()).map(([id, name]) => ({
            id,
            name,
            color: spaceColor.get(id) || PALETTE[0],
        }));
    }, [nodes, spaceColor]);

    // Adjacency for hover highlighting.
    const neighbors = useMemo(() => {
        const map = new Map<string, Set<string>>();
        links.forEach((l) => {
            const s = endId(l.source as any);
            const tg = endId(l.target as any);
            if (!map.has(s)) map.set(s, new Set());
            if (!map.has(tg)) map.set(tg, new Set());
            map.get(s)!.add(tg);
            map.get(tg)!.add(s);
        });
        return map;
    }, [links]);

    const radiusOf = useCallback((n: SimNode) => {
        return Math.min(MAX_RADIUS, MIN_RADIUS + Math.sqrt(n.degree) * 2.5);
    }, []);

    // --- Build / tear down the force simulation when data or size changes ---
    useEffect(() => {
        const el = containerRef.current;
        if (!el || nodes.length === 0) return;

        const start = () => {
            const w = el.clientWidth || 800;
            const h = el.clientHeight || 600;
            sizeRef.current = { w, h };

            simRef.current?.stop();
            const sim = forceSimulation<SimNode>(nodes)
                .force(
                    "link",
                    forceLink<SimNode, SimLink>(links)
                        .id((d) => d.id)
                        .distance(70)
                        .strength(0.4),
                )
                .force("charge", forceManyBody().strength(-220))
                .force("center", forceCenter(w / 2, h / 2))
                .force("collide", forceCollide<SimNode>((d) => radiusOf(d) + 6))
                .alpha(1)
                .alphaDecay(0.045);

            sim.on("tick", () => {
                if (rafRef.current != null) return;
                rafRef.current = requestAnimationFrame(() => {
                    rafRef.current = null;
                    bumpTick();
                    // Once the focused node has coordinates, recenter the view on it.
                    const fid = focusIdRef.current;
                    if (fid && !didCenterRef.current) {
                        const node = nodes.find((n) => n.id === fid);
                        if (node && node.x != null && node.y != null) {
                            const { w, h } = sizeRef.current;
                            const k = 1.3;
                            setView({ x: w / 2 - node.x * k, y: h / 2 - node.y * k, k });
                            didCenterRef.current = true;
                        }
                    }
                });
            });
            simRef.current = sim;
        };

        start();

        const ro = new ResizeObserver(() => {
            const sim = simRef.current;
            if (!sim) return;
            const w = el.clientWidth || 800;
            const h = el.clientHeight || 600;
            sizeRef.current = { w, h };
            sim.force("center", forceCenter(w / 2, h / 2));
            sim.alpha(0.3).restart();
        });
        ro.observe(el);

        return () => {
            ro.disconnect();
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            simRef.current?.stop();
            simRef.current = null;
        };
    }, [nodes, links, radiusOf]);

    // --- Pointer interactions: node drag, background pan ---
    const screenToGraph = useCallback(
        (clientX: number, clientY: number) => {
            const rect = containerRef.current?.getBoundingClientRect();
            const px = clientX - (rect?.left || 0);
            const py = clientY - (rect?.top || 0);
            return { x: (px - view.x) / view.k, y: (py - view.y) / view.k };
        },
        [view],
    );

    const onNodePointerDown = useCallback(
        (e: React.PointerEvent, node: SimNode) => {
            e.stopPropagation();
            (e.target as Element).setPointerCapture?.(e.pointerId);
            movedRef.current = false;
            dragNodeRef.current = node;
            simRef.current?.alphaTarget(0.3).restart();
        },
        [],
    );

    const onBackgroundPointerDown = useCallback(
        (e: React.PointerEvent) => {
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            movedRef.current = false;
            if (pointersRef.current.size >= 2) {
                // Second finger down → enter pinch-zoom, cancel any single-finger pan.
                const [a, b] = [...pointersRef.current.values()];
                pinchRef.current = {
                    dist: pointerDist(a, b) || 1,
                    cx: (a.x + b.x) / 2,
                    cy: (a.y + b.y) / 2,
                    view,
                };
                panRef.current = null;
            } else {
                panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
            }
        },
        [view],
    );

    const onPointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (dragNodeRef.current) {
                const p = screenToGraph(e.clientX, e.clientY);
                dragNodeRef.current.fx = p.x;
                dragNodeRef.current.fy = p.y;
                movedRef.current = true;
                bumpTick();
                return;
            }
            if (pointersRef.current.has(e.pointerId)) {
                pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            }
            if (pinchRef.current && pointersRef.current.size >= 2) {
                // Scale around the gesture's start midpoint, keeping that point fixed.
                const [a, b] = [...pointersRef.current.values()];
                const factor = pointerDist(a, b) / pinchRef.current.dist;
                const rect = containerRef.current?.getBoundingClientRect();
                const px = pinchRef.current.cx - (rect?.left || 0);
                const py = pinchRef.current.cy - (rect?.top || 0);
                const k0 = pinchRef.current.view.k;
                const k = clampZoom(k0 * factor);
                const x = px - ((px - pinchRef.current.view.x) * k) / k0;
                const y = py - ((py - pinchRef.current.view.y) * k) / k0;
                movedRef.current = true;
                setView({ x, y, k });
                return;
            }
            if (panRef.current) {
                const dx = e.clientX - panRef.current.x;
                const dy = e.clientY - panRef.current.y;
                if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
                setView((v) => ({ ...v, x: panRef.current!.vx + dx, y: panRef.current!.vy + dy }));
            }
        },
        [screenToGraph],
    );

    const endInteraction = useCallback((e?: React.PointerEvent) => {
        if (e) pointersRef.current.delete(e.pointerId);
        if (pointersRef.current.size < 2) pinchRef.current = null;
        if (dragNodeRef.current) {
            // Release the node so it rejoins the simulation.
            dragNodeRef.current.fx = null;
            dragNodeRef.current.fy = null;
            dragNodeRef.current = null;
            simRef.current?.alphaTarget(0);
        }
        panRef.current = null;
    }, []);

    // Zoom around the viewport center (used by the on-screen +/- controls).
    const zoomBy = useCallback((factor: number) => {
        const { w, h } = sizeRef.current;
        const cx = (w || containerRef.current?.clientWidth || 0) / 2;
        const cy = (h || containerRef.current?.clientHeight || 0) / 2;
        setView((v) => {
            const k = clampZoom(v.k * factor);
            const x = cx - ((cx - v.x) * k) / v.k;
            const y = cy - ((cy - v.y) * k) / v.k;
            return { x, y, k };
        });
    }, []);

    // Wheel zoom centered on the cursor.
    const onWheel = useCallback((e: React.WheelEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const px = e.clientX - (rect?.left || 0);
        const py = e.clientY - (rect?.top || 0);
        setView((v) => {
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const k = Math.min(4, Math.max(0.2, v.k * factor));
            // Keep the point under the cursor fixed.
            const x = px - ((px - v.x) * k) / v.k;
            const y = py - ((py - v.y) * k) / v.k;
            return { x, y, k };
        });
    }, []);

    const resetView = useCallback(() => {
        setView({ x: 0, y: 0, k: 1 });
        simRef.current?.alpha(0.5).restart();
    }, []);

    const onNodeClick = useCallback(
        (node: SimNode) => {
            if (movedRef.current) return; // was a drag, not a click
            if (!node.spaceId) return;
            navigator.go({ to: `/space-detail/${node.spaceId}/page/edit/${node.id}` });
        },
        [navigator],
    );

    const normalizedQuery = query.trim().toLowerCase();
    const matches = useCallback(
        (n: SimNode) => !normalizedQuery || (n.title || "").toLowerCase().includes(normalizedQuery),
        [normalizedQuery],
    );

    // Effective highlight target: live hover wins, else the sticky focused page.
    const hl = hovered ?? focusId;
    const focusedNode = useMemo(
        () => (focusId ? nodes.find((n) => n.id === focusId) : undefined),
        [focusId, nodes],
    );

    const clearFocus = useCallback(() => {
        setFocusId(null);
        setView({ x: 0, y: 0, k: 1 });
        simRef.current?.alpha(0.4).restart();
    }, []);

    // --- Render states ---
    if (loading) {
        return (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {t("graph.loading")}
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Network className="h-10 w-10 opacity-40" />
                <p>{error}</p>
                <Button size="sm" variant="outline" onClick={() => setReloadFlag((f) => f + 1)}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    {t("graph.retry")}
                </Button>
            </div>
        );
    }

    if (nodes.length === 0) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Network className="h-12 w-12 opacity-30" />
                <p className="text-sm font-medium">{t("graph.empty")}</p>
                <p className="text-xs">{t("graph.emptyHint")}</p>
            </div>
        );
    }

    return (
        <div className="h-full w-full flex flex-col overflow-hidden bg-background">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0">
                <Network className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="hidden md:inline text-sm font-medium">{t("graph.title")}</span>
                <span className="hidden md:inline text-xs text-muted-foreground">
                    {t("graph.stats", { nodes: nodes.length, edges: links.length })}
                </span>
                {focusId && (
                    <span className="flex items-center gap-1 text-xs rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 pl-2 pr-1 py-0.5 max-w-[140px] md:max-w-[200px]">
                        <Network className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">
                            {focusedNode?.title || t("graph.untitled")}
                        </span>
                        <button
                            type="button"
                            className="rounded-full hover:bg-indigo-100 p-0.5 flex-shrink-0"
                            onClick={clearFocus}
                            aria-label={t("graph.clearFocus")}
                            title={t("graph.clearFocus")}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                )}
                <div className="hidden md:block flex-1" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("graph.filter")}
                    className="h-9 md:h-7 flex-1 md:flex-none md:w-40 min-w-0 text-xs"
                />
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 md:h-7 md:w-7 flex-shrink-0"
                    onClick={resetView}
                    title={t("graph.reset")}
                >
                    <Maximize2 className="h-4 w-4" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 md:h-7 md:w-7 flex-shrink-0"
                    onClick={() => setReloadFlag((f) => f + 1)}
                    title={t("graph.refresh")}
                >
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </div>

            {/* Canvas */}
            <div
                ref={containerRef}
                className="relative flex-1 min-h-0 overflow-hidden cursor-grab active:cursor-grabbing touch-none"
                onPointerDown={onBackgroundPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endInteraction}
                onPointerLeave={endInteraction}
                onPointerCancel={endInteraction}
                onWheel={onWheel}
            >
                <svg width="100%" height="100%" className="block">
                    <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
                        {/* Edges */}
                        {links.map((l, i) => {
                            const s = l.source as SimNode;
                            const tg = l.target as SimNode;
                            if (!s || !tg || s.x == null || tg.x == null) return null;
                            const active =
                                !!hl && (endId(l.source as any) === hl || endId(l.target as any) === hl);
                            return (
                                <line
                                    key={i}
                                    x1={s.x}
                                    y1={s.y!}
                                    x2={tg.x}
                                    y2={tg.y!}
                                    stroke={active ? "#6366f1" : "#cbd5e1"}
                                    strokeOpacity={hl && !active ? 0.15 : 0.5}
                                    strokeWidth={active ? 1.5 : 1}
                                />
                            );
                        })}

                        {/* Nodes */}
                        {nodes.map((n) => {
                            if (n.x == null || n.y == null) return null;
                            const r = radiusOf(n);
                            const isCurrentSpace = n.spaceId === params.id;
                            const isFocused = n.id === focusId;
                            const dimmed =
                                (!!hl && hl !== n.id && !neighbors.get(hl)?.has(n.id)) ||
                                !matches(n);
                            const color = spaceColor.get(n.spaceId) || PALETTE[0];
                            return (
                                <g
                                    key={n.id}
                                    transform={`translate(${n.x},${n.y})`}
                                    style={{ cursor: "pointer", opacity: dimmed ? 0.2 : 1 }}
                                    onPointerDown={(e) => onNodePointerDown(e, n)}
                                    onPointerUp={() => onNodeClick(n)}
                                    onPointerEnter={() => setHovered(n.id)}
                                    onPointerLeave={() => setHovered(null)}
                                >
                                    {isFocused && (
                                        <circle
                                            r={r + 5}
                                            fill="none"
                                            stroke="#6366f1"
                                            strokeWidth={2}
                                            strokeDasharray="3 2"
                                        />
                                    )}
                                    <circle
                                        r={r}
                                        fill={color}
                                        stroke={isFocused ? "#6366f1" : isCurrentSpace ? "#111827" : "#fff"}
                                        strokeWidth={isFocused ? 3 : isCurrentSpace ? 2.5 : 1.5}
                                    />
                                    {(view.k > 0.6 || hl === n.id || isFocused) && (
                                        <text
                                            y={r + 11}
                                            textAnchor="middle"
                                            fontSize={10}
                                            fill="currentColor"
                                            className="text-foreground pointer-events-none select-none"
                                        >
                                            {(n.title || t("graph.untitled")).slice(0, 18)}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </g>
                </svg>

                {/* Legend — always shown on desktop; toggled on mobile. */}
                {legend.length > 0 && (!isMobile || showLegend) && (
                    <div
                        className={cn(
                            "absolute overflow-auto rounded-md border bg-background/90 backdrop-blur px-2 py-1.5 shadow-sm",
                            isMobile
                                ? "bottom-2 left-2 right-14 max-h-[35%]"
                                : "top-2 right-2 max-w-[220px] max-h-[40%]",
                        )}
                    >
                        <div className="text-[11px] font-medium text-muted-foreground mb-1">
                            {t("graph.legend")}
                        </div>
                        {legend.map((s) => (
                            <div key={s.id} className="flex items-center gap-1.5 py-0.5">
                                <span
                                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                                    style={{ background: s.color }}
                                />
                                <span className={cn("text-xs truncate", s.id === params.id && "font-semibold")}>
                                    {s.name}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Floating touch controls (mobile only): zoom + legend toggle.
                    Wheel-zoom doesn't exist on touch, so these back up pinch-zoom. */}
                <div className="absolute bottom-2 right-2 flex flex-col gap-1.5 md:hidden">
                    <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9 bg-background/90 backdrop-blur shadow-sm"
                        onClick={() => zoomBy(1.3)}
                        title={t("graph.zoomIn")}
                        aria-label={t("graph.zoomIn")}
                    >
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9 bg-background/90 backdrop-blur shadow-sm"
                        onClick={() => zoomBy(1 / 1.3)}
                        title={t("graph.zoomOut")}
                        aria-label={t("graph.zoomOut")}
                    >
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    {legend.length > 0 && (
                        <Button
                            size="icon"
                            variant={showLegend ? "secondary" : "outline"}
                            className="h-9 w-9 bg-background/90 backdrop-blur shadow-sm"
                            onClick={() => setShowLegend((s) => !s)}
                            title={t("graph.legend")}
                            aria-label={t("graph.legend")}
                        >
                            <Layers className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SpaceGraph;
