import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
    forceCenter,
    forceCollide,
    forceLink,
    forceManyBody,
    forceSimulation,
    type Simulation,
} from "d3-force";
import { useSpacePageService, useNavigator, useParams, useSearchParams, useTranslation } from "@kn/common";
import { useResponsive, Button, Input, cn } from "@kn/ui";
import { Network, Loader2, RefreshCw, Maximize2, X, ZoomIn, ZoomOut, Layers, LocateFixed } from "@kn/icon";
import type { GraphEdge, GraphNode, SimLink, SimNode, ViewTransform } from "./types";

/** Muted, Notion-like palette; spaces are colored by stable index into this list. */
const PALETTE = [
    "#337EA9", "#448361", "#D9730D", "#9065B0", "#C14C8A",
    "#CB912F", "#D44C47", "#787774", "#548164", "#5B97BD",
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

/**
 * Below this *container* width the graph switches to its compact layout. This is
 * deliberately not a viewport breakpoint: the same component renders full-page
 * and inside a ~400px side-dock column, where the viewport is still desktop-wide.
 */
const COMPACT_WIDTH = 520;

/** Zoom used when centering on a focused page. A narrow column needs less. */
const focusZoom = (w: number) => (w < COMPACT_WIDTH ? 1 : 1.3);

/**
 * Force constants scale with the available area. The full-page spacing spreads
 * 80+ nodes far wider than a dock column can show, so a narrow host gets a
 * tighter layout instead of a graph that only makes sense when zoomed out.
 */
const forceTuning = (w: number, h: number) => {
    const narrow = Math.min(w, h) < 480;
    return {
        linkDistance: narrow ? 40 : 70,
        charge: narrow ? -110 : -220,
        collidePad: narrow ? 3 : 6,
    };
};

export interface SpaceGraphProps {
    /** Page to focus on. Overrides the `?focus=` URL param (used when embedded in a sheet). */
    focusId?: string | null;
    /** Space whose nodes get the "current space" outline. Overrides the route `:id`. */
    currentSpaceId?: string;
    /** Called after navigating to a node (e.g. to close the embedding sheet). */
    onNavigate?: () => void;
}

export const SpaceGraph: React.FC<SpaceGraphProps> = ({
    focusId: focusIdProp,
    currentSpaceId,
    onNavigate,
}) => {
    const { t } = useTranslation();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const navigator = useNavigator();
    const spacePageService = useSpacePageService();
    const { isMobile } = useResponsive();

    // Current space for node highlighting: explicit prop wins over the route param.
    const currentId = currentSpaceId ?? params.id;

    // Optional page to focus on (opened from a page's "···" menu → ?focus=<pageId>).
    const focusParam = focusIdProp ?? searchParams.get("focus");
    const [focusId, setFocusId] = useState<string | null>(focusParam);

    // Keep focus in sync when the prop changes (sheet reopened on a different page).
    useEffect(() => {
        setFocusId(focusParam);
    }, [focusParam]);

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
    // Set from a ResizeObserver on the canvas, so the layout follows the host
    // container rather than the viewport (see COMPACT_WIDTH).
    const [compact, setCompact] = useState(false);

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
    // Auto-fit plumbing: the simulation's "end" handler calls the latest fitView.
    // Gated by a flag so a node drag settling doesn't yank the viewport around.
    const fitRef = useRef<() => void>(() => { });
    const shouldFitRef = useRef(true);
    useEffect(() => {
        focusIdRef.current = focusId;
        didCenterRef.current = false;
    }, [focusId]);

    // --- Fetch graph data ---
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        spacePageService.relations.getSpaceGraph()
            .then((data) => {
                if (cancelled) return;
                const rawNodes: GraphNode[] = data.nodes.map((node) => ({
                    id: node.id,
                    title: node.title,
                    spaceId: node.spaceId,
                    spaceName: node.spaceName,
                    icon: node.icon as GraphNode["icon"],
                    status: node.status,
                }));
                const rawEdges: GraphEdge[] = data.edges.map((edge) => ({
                    source: edge.source,
                    target: edge.target,
                    linkKind: edge.linkKind,
                }));

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
    }, [reloadFlag, spacePageService, t]);

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

        // Held so the resize handler can retune them in place instead of
        // rebuilding the whole simulation and losing the current layout.
        const linkForce = forceLink<SimNode, SimLink>(links).id((d) => d.id).strength(0.4);
        const chargeForce = forceManyBody<SimNode>();
        const collideForce = forceCollide<SimNode>();

        const applyTuning = (w: number, h: number) => {
            const { linkDistance, charge, collidePad } = forceTuning(w, h);
            linkForce.distance(linkDistance);
            chargeForce.strength(charge);
            collideForce.radius((d) => radiusOf(d) + collidePad);
        };

        const start = () => {
            const w = el.clientWidth || 800;
            const h = el.clientHeight || 600;
            sizeRef.current = { w, h };
            applyTuning(w, h);

            simRef.current?.stop();
            shouldFitRef.current = true;
            const sim = forceSimulation<SimNode>(nodes)
                .force("link", linkForce)
                .force("charge", chargeForce)
                .force("center", forceCenter(w / 2, h / 2))
                .force("collide", collideForce)
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
                            const k = focusZoom(w);
                            setView({ x: w / 2 - node.x * k, y: h / 2 - node.y * k, k });
                            didCenterRef.current = true;
                        }
                    }
                });
            });

            // Frame the whole graph once the layout settles. Without this the view
            // is left at identity, which strands most nodes outside a small host.
            // Skipped when focusing a page (the tick handler owns the viewport) and
            // after the first settle, so releasing a dragged node doesn't refit.
            sim.on("end", () => {
                if (!shouldFitRef.current || focusIdRef.current) return;
                shouldFitRef.current = false;
                fitRef.current();
            });

            simRef.current = sim;
        };

        start();

        const ro = new ResizeObserver(() => {
            const sim = simRef.current;
            if (!sim) return;
            const w = el.clientWidth;
            const h = el.clientHeight;
            // A collapsing or hidden host reports 0; retuning against the fallback
            // size would scatter the layout for a panel nobody is looking at.
            if (w === 0 || h === 0) return;
            sizeRef.current = { w, h };
            applyTuning(w, h);
            sim.force("center", forceCenter(w / 2, h / 2));
            // Resizing the host (dragging the dock edge, collapsing the sidebar)
            // changes what fits, so allow one more auto-fit.
            shouldFitRef.current = true;
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

    // --- Compact layout detection (host width, not viewport) ---
    // Re-attached once the real tree renders, since `containerRef` only exists
    // past the loading / error / empty branches.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const measure = () => {
            const w = el.clientWidth;
            if (w > 0) setCompact(w < COMPACT_WIDTH);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [loading, error, nodes.length]);

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

    /**
     * Frame every node in the viewport. This is what "reset view" means for a
     * force graph: identity puts the layout's origin at the top-left corner,
     * which in a narrow host leaves most of the graph off-screen.
     */
    const fitView = useCallback(() => {
        const { w, h } = sizeRef.current;
        if (!w || !h) return;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let seen = 0;
        nodes.forEach((n) => {
            if (n.x == null || n.y == null) return;
            const r = radiusOf(n);
            minX = Math.min(minX, n.x - r);
            maxX = Math.max(maxX, n.x + r);
            minY = Math.min(minY, n.y - r);
            maxY = Math.max(maxY, n.y + r);
            seen++;
        });
        if (seen === 0) return;
        // Leaves room for the labels hanging below each node.
        const pad = 28;
        const k = clampZoom(
            Math.min(
                (w - pad * 2) / Math.max(1, maxX - minX),
                (h - pad * 2) / Math.max(1, maxY - minY),
                // A graph small enough to fit shouldn't be blown up past 1:1.
                1,
            ),
        );
        setView({
            x: w / 2 - ((minX + maxX) / 2) * k,
            y: h / 2 - ((minY + maxY) / 2) * k,
            k,
        });
    }, [nodes, radiusOf]);

    useEffect(() => {
        fitRef.current = fitView;
    }, [fitView]);

    const resetView = useCallback(() => {
        fitView();
    }, [fitView]);

    const onNodeClick = useCallback(
        (node: SimNode) => {
            if (movedRef.current) return; // was a drag, not a click
            if (!node.spaceId) return;
            navigator.go({ to: `/space-detail/${node.spaceId}/page/edit/${node.id}` });
            onNavigate?.();
        },
        [navigator, onNavigate],
    );

    const normalizedQuery = query.trim().toLowerCase();
    const matches = useCallback(
        (n: SimNode) => !normalizedQuery || (n.title || "").toLowerCase().includes(normalizedQuery),
        [normalizedQuery],
    );

    // Effective highlight target: live hover wins, else the sticky focused page.
    const hl = hovered ?? focusId;
    // A narrow canvas can't spare the room for a permanent legend overlay, so it
    // gets a toggle button instead. Touch hosts do the same regardless of width.
    const collapsible = compact || isMobile;
    const focusedNode = useMemo(
        () => (focusId ? nodes.find((n) => n.id === focusId) : undefined),
        [focusId, nodes],
    );

    const clearFocus = useCallback(() => {
        setFocusId(null);
        fitView();
    }, [fitView]);

    // Re-center the viewport on the focused page (useful after panning away).
    const locateFocus = useCallback(() => {
        const fid = focusId;
        if (!fid) return;
        const node = nodes.find((n) => n.id === fid);
        if (!node || node.x == null || node.y == null) return;
        const { w, h } = sizeRef.current;
        const k = focusZoom(w);
        setView({ x: w / 2 - node.x * k, y: h / 2 - node.y * k, k });
    }, [focusId, nodes]);

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
            {/* Toolbar. Compact hosts stack it into two rows and drop the title +
                stats, which the host's own panel header already provides. */}
            <div
                className={cn(
                    "flex flex-shrink-0 border-b",
                    compact
                        ? "flex-col items-stretch gap-1.5 px-2 py-1.5"
                        : "items-center gap-2 px-3 py-2",
                )}
            >
                {!compact && (
                    <>
                        <Network className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="hidden md:inline text-sm font-medium">{t("graph.title")}</span>
                        <span className="hidden md:inline text-xs text-muted-foreground">
                            {t("graph.stats", { nodes: nodes.length, edges: links.length })}
                        </span>
                    </>
                )}
                {focusId && (
                    <span
                        className={cn(
                            "flex items-center gap-1 text-xs rounded-md border border-border bg-muted/60 text-foreground pl-2 pr-1 py-0.5",
                            compact ? "min-w-0" : "max-w-[140px] md:max-w-[200px]",
                        )}
                    >
                        <Network className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="truncate">
                            {focusedNode?.title || t("graph.untitled")}
                        </span>
                        <button
                            type="button"
                            className="rounded-sm hover:bg-muted p-0.5 flex-shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={clearFocus}
                            aria-label={t("graph.clearFocus")}
                            title={t("graph.clearFocus")}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                )}
                {!compact && <div className="hidden md:block flex-1" />}
                <div className="flex items-center gap-1 min-w-0">
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("graph.filter")}
                        className={cn(
                            "h-9 md:h-7 min-w-0 text-xs",
                            compact ? "flex-1" : "flex-1 md:flex-none md:w-40",
                        )}
                    />
                    {focusId && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 md:h-7 md:w-7 flex-shrink-0"
                            onClick={locateFocus}
                            title={t("graph.locate")}
                            aria-label={t("graph.locate")}
                        >
                            <LocateFixed className="h-4 w-4" />
                        </Button>
                    )}
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
                    <defs>
                        {/* Faint dot grid that pans/zooms with the graph for a canvas feel. */}
                        <pattern
                            id="graph-dot-grid"
                            width={24}
                            height={24}
                            patternUnits="userSpaceOnUse"
                            patternTransform={`translate(${view.x},${view.y}) scale(${view.k})`}
                        >
                            <circle cx={1} cy={1} r={1} className="fill-muted-foreground/10" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#graph-dot-grid)" />
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
                                    stroke={active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                                    strokeOpacity={active ? 0.55 : hl ? 0.08 : 0.25}
                                    strokeWidth={active ? 1.4 : 1}
                                    strokeLinecap="round"
                                    style={{ transition: "stroke-opacity 150ms ease, stroke 150ms ease" }}
                                />
                            );
                        })}

                        {/* Nodes */}
                        {nodes.map((n) => {
                            if (n.x == null || n.y == null) return null;
                            const r = radiusOf(n);
                            const isCurrentSpace = n.spaceId === currentId;
                            const isFocused = n.id === focusId;
                            const isHovered = hovered === n.id;
                            const dimmed =
                                (!!hl && hl !== n.id && !neighbors.get(hl)?.has(n.id)) ||
                                !matches(n);
                            const color = spaceColor.get(n.spaceId) || PALETTE[0];
                            const rr = isHovered || isFocused ? r * 1.1 : r;
                            const smooth = { transition: "r 150ms ease" } as const;
                            return (
                                <g
                                    key={n.id}
                                    transform={`translate(${n.x},${n.y})`}
                                    style={{
                                        cursor: "pointer",
                                        opacity: dimmed ? 0.15 : 1,
                                        transition: "opacity 150ms ease",
                                    }}
                                    onPointerDown={(e) => onNodePointerDown(e, n)}
                                    onPointerUp={() => onNodeClick(n)}
                                    onPointerEnter={() => setHovered(n.id)}
                                    onPointerLeave={() => setHovered(null)}
                                >
                                    {/* Flat hairline ring marking hover / focus / current space. */}
                                    {(isHovered || isFocused || isCurrentSpace) && (
                                        <circle
                                            r={rr + 4}
                                            fill="none"
                                            stroke={color}
                                            strokeOpacity={isFocused ? 0.8 : 0.45}
                                            strokeWidth={1.5}
                                            strokeDasharray={isFocused ? "3 3" : undefined}
                                            style={smooth}
                                        />
                                    )}
                                    <circle
                                        r={rr}
                                        fill={color}
                                        stroke="hsl(var(--background))"
                                        strokeWidth={1.5}
                                        style={smooth}
                                    />
                                    {(view.k > 0.6 || isHovered || isFocused) && (
                                        <>
                                            <text
                                                y={rr + 13}
                                                textAnchor="middle"
                                                fontSize={10}
                                                fontWeight={isHovered || isFocused ? 600 : 400}
                                                fill="hsl(var(--foreground))"
                                                fillOpacity={isHovered || isFocused ? 1 : 0.75}
                                                stroke="hsl(var(--background))"
                                                strokeWidth={3}
                                                strokeLinejoin="round"
                                                paintOrder="stroke"
                                                className="pointer-events-none select-none"
                                            >
                                                {(n.title || t("graph.untitled")).slice(0, compact ? 12 : 18)}
                                            </text>
                                            {(isHovered || isFocused) && n.spaceName && (
                                                <text
                                                    y={rr + 25}
                                                    textAnchor="middle"
                                                    fontSize={9}
                                                    fill="hsl(var(--muted-foreground))"
                                                    stroke="hsl(var(--background))"
                                                    strokeWidth={3}
                                                    strokeLinejoin="round"
                                                    paintOrder="stroke"
                                                    className="pointer-events-none select-none"
                                                >
                                                    {n.spaceName}
                                                </text>
                                            )}
                                        </>
                                    )}
                                </g>
                            );
                        })}
                    </g>
                </svg>

                {/* Legend — pinned open on a wide canvas, toggled when the host is
                    narrow, where an always-on overlay would cover the graph. */}
                {legend.length > 0 && (!collapsible || showLegend) && (
                    <div
                        className={cn(
                            "absolute overflow-auto rounded-md border border-border bg-background/95 backdrop-blur-sm px-2.5 py-2 shadow-sm",
                            collapsible
                                ? "bottom-2 left-2 right-12 max-h-[35%]"
                                : "top-3 right-3 max-w-[220px] max-h-[40%]",
                        )}
                    >
                        <div className="text-[11px] font-medium text-muted-foreground mb-1">
                            {t("graph.legend")}
                        </div>
                        {legend.map((s) => (
                            <div key={s.id} className="flex items-center gap-2 py-0.5">
                                <span
                                    className="h-2 w-2 rounded-full flex-shrink-0"
                                    style={{ background: s.color }}
                                />
                                <span className={cn("text-xs truncate text-muted-foreground", s.id === currentId && "font-medium text-foreground")}>
                                    {s.name}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Floating canvas controls. Zoom buttons back up pinch-zoom on
                    touch (there is no wheel); the legend toggle appears whenever
                    the legend is collapsible. */}
                <div className="absolute bottom-2 right-2 flex flex-col gap-1.5">
                    {isMobile && (
                        <>
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
                        </>
                    )}
                    {collapsible && legend.length > 0 && (
                        <Button
                            size="icon"
                            variant={showLegend ? "secondary" : "outline"}
                            className={cn(
                                "bg-background/90 backdrop-blur shadow-sm",
                                isMobile ? "h-9 w-9" : "h-7 w-7",
                            )}
                            onClick={() => setShowLegend((s) => !s)}
                            title={t("graph.legend")}
                            aria-label={t("graph.legend")}
                        >
                            <Layers className={isMobile ? "h-4 w-4" : "h-3.5 w-3.5"} />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SpaceGraph;
