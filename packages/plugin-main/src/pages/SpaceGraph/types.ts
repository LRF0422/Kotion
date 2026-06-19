import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

/** A page node returned by GET /knowledge-wiki/space/graph. */
export interface GraphNode {
    /** Page id (snowflake string). */
    id: string;
    title: string;
    /** Space the page belongs to. */
    spaceId: string;
    spaceName?: string;
    icon?: { icon?: string } | null;
    status?: string;
}

/** A directed page→page reference edge. */
export interface GraphEdge {
    source: string;
    target: string;
    linkKind?: string;
}

export interface SpaceGraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

/** Node enriched with d3-force simulation state (x/y/vx/vy/fx/fy + degree). */
export interface SimNode extends GraphNode, SimulationNodeDatum {
    degree: number;
}

/** Link whose source/target start as ids and are resolved to SimNode by d3. */
export type SimLink = SimulationLinkDatum<SimNode> & { linkKind?: string };

/** Pan/zoom transform applied to the rendered graph group. */
export interface ViewTransform {
    x: number;
    y: number;
    k: number;
}
