export const LOGICFLOW_SCHEMA_VERSION = 2 as const;
export const DIAGRAM_FRAGMENT_VERSION = 1 as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface LogicFlowText {
  value: string;
  x?: number;
  y?: number;
  editable?: boolean;
  draggable?: boolean;
  [key: string]: JsonValue | undefined;
}

export interface LogicFlowNodeData {
  id: string;
  type: string;
  x: number;
  y: number;
  text?: string | LogicFlowText;
  properties?: Record<string, JsonValue>;
  [key: string]:
    | JsonValue
    | Record<string, JsonValue>
    | LogicFlowText
    | undefined;
}

export interface LogicFlowPoint {
  x: number;
  y: number;
}

export interface LogicFlowEdgeData {
  id: string;
  type: string;
  sourceNodeId: string;
  targetNodeId: string;
  text?: string | LogicFlowText;
  startPoint?: LogicFlowPoint;
  endPoint?: LogicFlowPoint;
  pointsList?: LogicFlowPoint[];
  properties?: Record<string, JsonValue>;
  [key: string]:
    | JsonValue
    | Record<string, JsonValue>
    | LogicFlowText
    | LogicFlowPoint
    | LogicFlowPoint[]
    | undefined;
}

export interface LogicFlowGraphData {
  nodes: LogicFlowNodeData[];
  edges: LogicFlowEdgeData[];
}

export interface LogicFlowGroup {
  id: string;
  name?: string;
  nodeIds: string[];
}

export interface LogicFlowViewport {
  scale: number;
  x: number;
  y: number;
}

export interface LogicFlowSettings {
  grid: boolean;
  snapline: boolean;
  background: "transparent" | "solid";
  viewport?: LogicFlowViewport;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  elementIds: string[];
}

export type LogicFlowLayer = Layer;

export interface Page {
  id: string;
  name: string;
  graph: LogicFlowGraphData;
  groups: LogicFlowGroup[];
  layers: Layer[];
  settings: LogicFlowSettings;
}

export type LogicFlowPage = Page;

/** A local structural subset of Tiptap/ProseMirror JSONContent. */
export interface JSONContent {
  type?: string;
  attrs?: Record<string, JsonValue>;
  content?: JSONContent[];
  marks?: JSONMark[];
  text?: string;
}

export interface JSONMark {
  type: string;
  attrs?: Record<string, JsonValue>;
}

export interface RichCardContent {
  title: JSONContent;
  body: JSONContent;
}

export interface DiagramDefaultStyles {
  node: Record<string, JsonValue>;
  edge: Record<string, JsonValue>;
}

export interface DiagramFragmentLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  elementIds: string[];
}

export interface DiagramFragment {
  version: typeof DIAGRAM_FRAGMENT_VERSION;
  nodes: LogicFlowNodeData[];
  edges: LogicFlowEdgeData[];
  groups: LogicFlowGroup[];
  layers: DiagramFragmentLayer[];
}

export interface ScratchpadItem {
  id: string;
  name: string;
  fragment: DiagramFragment;
}

export interface LogicFlowDocument {
  schemaVersion: typeof LOGICFLOW_SCHEMA_VERSION;
  title: string;
  pages: Page[];
  scratchpad: ScratchpadItem[];
  defaultStyles: DiagramDefaultStyles;
}

/** The persisted v1 shape, retained to make migrations and adapters explicit. */
export interface LogicFlowDocumentV1 {
  schemaVersion?: 1;
  graph: LogicFlowGraphData;
  groups: LogicFlowGroup[];
  settings: LogicFlowSettings;
}

export interface NormalizedLogicFlowData {
  document: LogicFlowDocument;
  migrated: boolean;
  warnings: string[];
  sourceFingerprint: string;
}

export const LOGICFLOW_LIMITS = {
  maxPages: 100,
  maxLayers: 200,
  maxScratchpadItems: 200,
  maxNodes: 1_000,
  maxEdges: 2_000,
  maxGroups: 200,
  maxGroupNodes: 500,
  maxTextLength: 4_000,
  maxRichTextNodes: 2_000,
  maxPropertyDepth: 8,
  maxArrayLength: 500,
  maxObjectKeys: 500,
} as const;
