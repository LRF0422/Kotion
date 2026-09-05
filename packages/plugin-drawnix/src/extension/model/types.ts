export const DRAWNIX_SCHEMA_VERSION = 2 as const;

export const MINDMAP_LAYOUTS = [
  "standard",
  "right",
  "left",
  "downward",
  "upward",
] as const;

export type MindmapLayout = (typeof MINDMAP_LAYOUTS)[number];
export type MindmapBranchSide = "left" | "right";

export interface MindmapPoint {
  x: number;
  y: number;
}

export interface MindmapViewport extends MindmapPoint {
  zoom: number;
}

export interface MindmapNodeStyle {
  fontSize?: number;
  textColor?: string;
  borderColor?: string;
  backgroundColor?: string;
}

export interface MindmapNode {
  id: string;
  text: string;
  children: MindmapNode[];
  side?: MindmapBranchSide;
  collapsed?: boolean;
  manualOffset?: MindmapPoint;
  style?: MindmapNodeStyle;
  href?: string;
}

export interface MindmapDocument {
  schemaVersion: typeof DRAWNIX_SCHEMA_VERSION;
  root: MindmapNode;
  layout: MindmapLayout;
  viewport?: MindmapViewport;
}

export interface LegacyPlaitElement {
  id?: unknown;
  type?: unknown;
  isRoot?: unknown;
  rightNodeCount?: unknown;
  layout?: unknown;
  isCollapsed?: unknown;
  data?: unknown;
  children?: unknown;
  width?: unknown;
  height?: unknown;
  points?: unknown;
  fill?: unknown;
  strokeColor?: unknown;
  [key: string]: unknown;
}

export interface LegacyDrawnixViewport {
  zoom?: unknown;
  offsetX?: unknown;
  offsetY?: unknown;
  x?: unknown;
  y?: unknown;
}

export interface LegacyDrawnixData {
  children?: unknown;
  viewport?: LegacyDrawnixViewport | null;
  [key: string]: unknown;
}

export interface PersistedDrawnixData extends MindmapDocument {
  children: LegacyPlaitElement[];
  viewport?: MindmapViewport & {
    offsetX: number;
    offsetY: number;
  };
}

export type DrawnixData = LegacyDrawnixData | PersistedDrawnixData;

export interface MindmapNodeData {
  id: string;
  text: string;
  children?: MindmapNodeData[];
  style?: MindmapNodeStyle;
  href?: string;
}

export interface NormalizedDrawnixData {
  document: MindmapDocument;
  migrated: boolean;
  canWriteBack: boolean;
  warnings: string[];
  sourceFingerprint: string;
}

export const MINDMAP_LIMITS = {
  maxNodes: 500,
  maxDepth: 24,
  maxTextLength: 2_000,
  minFontSize: 10,
  maxFontSize: 48,
  minZoom: 0.2,
  maxZoom: 2.5,
} as const;
