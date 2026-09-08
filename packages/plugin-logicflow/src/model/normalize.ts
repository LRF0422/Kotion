import {
  createDefaultDiagramStyles,
  createDefaultLogicFlowDocument,
  createDefaultLogicFlowSettings,
  DEFAULT_DOCUMENT_TITLE,
} from "./data";
import { normalizeLayers } from "./layers";
import { stableStringify } from "./stable-stringify";
import {
  DIAGRAM_FRAGMENT_VERSION,
  LOGICFLOW_LIMITS,
  LOGICFLOW_SCHEMA_VERSION,
  type DiagramDefaultStyles,
  type DiagramFragment,
  type JsonValue,
  type LogicFlowDocument,
  type LogicFlowEdgeData,
  type LogicFlowGraphData,
  type LogicFlowGroup,
  type LogicFlowNodeData,
  type LogicFlowPoint,
  type LogicFlowSettings,
  type LogicFlowText,
  type NormalizedLogicFlowData,
  type Page,
  type ScratchpadItem,
} from "./types";

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ID_PATTERN = /^[A-Za-z0-9_.:@+-]{1,200}$/;
const TYPE_PATTERN = /^[A-Za-z0-9_.:@/-]{1,120}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(-10_000_000, Math.min(10_000_000, value))
    : fallback;
}

function parseInput(value: unknown, warnings: string[]): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    warnings.push("LogicFlow JSON 无法解析，已使用空白画布");
    return null;
  }
}

export function sanitizeJsonValue(
  value: unknown,
  depth = 0,
): JsonValue | undefined {
  if (depth > LOGICFLOW_LIMITS.maxPropertyDepth) return undefined;
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string")
    return value.slice(0, LOGICFLOW_LIMITS.maxTextLength);
  if (Array.isArray(value)) {
    return value
      .slice(0, LOGICFLOW_LIMITS.maxArrayLength)
      .map((item) => sanitizeJsonValue(item, depth + 1))
      .filter((item): item is JsonValue => item !== undefined);
  }
  if (!isRecord(value)) return undefined;
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value).slice(
    0,
    LOGICFLOW_LIMITS.maxObjectKeys,
  )) {
    if (BLOCKED_KEYS.has(key)) continue;
    const sanitized = sanitizeJsonValue(item, depth + 1);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function normalizeId(
  value: unknown,
  prefix: string,
  index: number,
  used: Set<string>,
): string {
  const requested =
    typeof value === "string" && ID_PATTERN.test(value)
      ? value
      : `${prefix}-${index + 1}`;
  if (!used.has(requested)) {
    used.add(requested);
    return requested;
  }
  let suffix = 2;
  while (used.has(`${requested}-${suffix}`)) suffix += 1;
  const unique = `${requested}-${suffix}`;
  used.add(unique);
  return unique;
}

function normalizeType(value: unknown, fallback: string): string {
  return typeof value === "string" && TYPE_PATTERN.test(value)
    ? value
    : fallback;
}

function normalizeText(value: unknown): string | LogicFlowText | undefined {
  if (typeof value === "string")
    return value.slice(0, LOGICFLOW_LIMITS.maxTextLength);
  if (!isRecord(value) || typeof value.value !== "string") return undefined;
  const sanitized = sanitizeJsonValue(value);
  if (!isRecord(sanitized)) return undefined;
  return {
    ...(sanitized as Record<string, JsonValue>),
    value: value.value.slice(0, LOGICFLOW_LIMITS.maxTextLength),
    ...(typeof value.x === "number" ? { x: finiteNumber(value.x) } : {}),
    ...(typeof value.y === "number" ? { y: finiteNumber(value.y) } : {}),
    ...(typeof value.editable === "boolean"
      ? { editable: value.editable }
      : {}),
    ...(typeof value.draggable === "boolean"
      ? { draggable: value.draggable }
      : {}),
  } as LogicFlowText;
}

function normalizePoint(value: unknown): LogicFlowPoint | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.x !== "number" || typeof value.y !== "number")
    return undefined;
  return { x: finiteNumber(value.x), y: finiteNumber(value.y) };
}

function normalizedExtras(
  value: Record<string, unknown>,
  omitted: Set<string>,
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (omitted.has(key) || BLOCKED_KEYS.has(key)) continue;
    const sanitized = sanitizeJsonValue(item);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function normalizeNodes(
  value: unknown,
  warnings: string[],
  used = new Set<string>(),
): LogicFlowNodeData[] {
  if (!Array.isArray(value)) return [];
  if (value.length > LOGICFLOW_LIMITS.maxNodes)
    warnings.push(`节点数量超过 ${LOGICFLOW_LIMITS.maxNodes}，已截断`);
  return value
    .slice(0, LOGICFLOW_LIMITS.maxNodes)
    .map((item, index): LogicFlowNodeData | null => {
      if (!isRecord(item)) return null;
      const id = normalizeId(item.id, "node", index, used);
      const text = normalizeText(item.text);
      const properties = sanitizeJsonValue(item.properties);
      return {
        ...normalizedExtras(
          item,
          new Set(["id", "type", "x", "y", "text", "properties"]),
        ),
        id,
        type: normalizeType(item.type, "rect"),
        x: finiteNumber(item.x),
        y: finiteNumber(item.y),
        ...(text !== undefined ? { text } : {}),
        ...(isRecord(properties)
          ? { properties: properties as Record<string, JsonValue> }
          : {}),
      };
    })
    .filter((node): node is LogicFlowNodeData => node !== null);
}

function normalizeEdges(
  value: unknown,
  nodeIds: Set<string>,
  warnings: string[],
  used = new Set<string>(),
): LogicFlowEdgeData[] {
  if (!Array.isArray(value)) return [];
  if (value.length > LOGICFLOW_LIMITS.maxEdges)
    warnings.push(`连线数量超过 ${LOGICFLOW_LIMITS.maxEdges}，已截断`);
  let dropped = 0;
  const edges = value
    .slice(0, LOGICFLOW_LIMITS.maxEdges)
    .map((item, index): LogicFlowEdgeData | null => {
      if (!isRecord(item)) return null;
      if (
        typeof item.sourceNodeId !== "string" ||
        typeof item.targetNodeId !== "string" ||
        !nodeIds.has(item.sourceNodeId) ||
        !nodeIds.has(item.targetNodeId)
      ) {
        dropped += 1;
        return null;
      }
      const text = normalizeText(item.text);
      const properties = sanitizeJsonValue(item.properties);
      const startPoint = normalizePoint(item.startPoint);
      const endPoint = normalizePoint(item.endPoint);
      const pointsList = Array.isArray(item.pointsList)
        ? item.pointsList
            .map(normalizePoint)
            .filter((point): point is LogicFlowPoint => point !== undefined)
            .slice(0, LOGICFLOW_LIMITS.maxArrayLength)
        : undefined;
      return {
        ...normalizedExtras(
          item,
          new Set([
            "id",
            "type",
            "sourceNodeId",
            "targetNodeId",
            "text",
            "properties",
            "startPoint",
            "endPoint",
            "pointsList",
          ]),
        ),
        id: normalizeId(item.id, "edge", index, used),
        type: normalizeType(item.type, "polyline"),
        sourceNodeId: item.sourceNodeId,
        targetNodeId: item.targetNodeId,
        ...(text !== undefined ? { text } : {}),
        ...(isRecord(properties)
          ? { properties: properties as Record<string, JsonValue> }
          : {}),
        ...(startPoint ? { startPoint } : {}),
        ...(endPoint ? { endPoint } : {}),
        ...(pointsList?.length ? { pointsList } : {}),
      };
    })
    .filter((edge): edge is LogicFlowEdgeData => edge !== null);
  if (dropped) warnings.push(`已移除 ${dropped} 条引用不存在节点的连线`);
  return edges;
}

function normalizeGraph(
  value: unknown,
  warnings: string[],
): LogicFlowGraphData {
  const source = isRecord(value) ? value : {};
  const usedElementIds = new Set<string>();
  const nodes = normalizeNodes(source.nodes, warnings, usedElementIds);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = normalizeEdges(source.edges, nodeIds, warnings, usedElementIds);
  return { nodes, edges };
}

function normalizeGroups(
  value: unknown,
  nodeIds: Set<string>,
  warnings: string[],
): LogicFlowGroup[] {
  if (!Array.isArray(value)) return [];
  if (value.length > LOGICFLOW_LIMITS.maxGroups)
    warnings.push(`分组数量超过 ${LOGICFLOW_LIMITS.maxGroups}，已截断`);
  const used = new Set<string>();
  return value
    .slice(0, LOGICFLOW_LIMITS.maxGroups)
    .map((item, index): LogicFlowGroup | null => {
      if (!isRecord(item)) return null;
      const nodeIdsInGroup = Array.isArray(item.nodeIds)
        ? [
            ...new Set(
              item.nodeIds.filter(
                (id): id is string => typeof id === "string" && nodeIds.has(id),
              ),
            ),
          ].slice(0, LOGICFLOW_LIMITS.maxGroupNodes)
        : [];
      return {
        id: normalizeId(item.id, "group", index, used),
        ...(typeof item.name === "string" && item.name.trim()
          ? { name: item.name.slice(0, 200) }
          : {}),
        nodeIds: nodeIdsInGroup,
      };
    })
    .filter((group): group is LogicFlowGroup => group !== null);
}

function normalizeSettings(value: unknown): LogicFlowSettings {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultLogicFlowSettings();
  const viewport = isRecord(source.viewport)
    ? {
        scale: Math.max(
          0.1,
          Math.min(4, finiteNumber(source.viewport.scale, 1)),
        ),
        x: finiteNumber(source.viewport.x),
        y: finiteNumber(source.viewport.y),
      }
    : undefined;
  return {
    grid: typeof source.grid === "boolean" ? source.grid : defaults.grid,
    snapline:
      typeof source.snapline === "boolean"
        ? source.snapline
        : defaults.snapline,
    background: source.background === "solid" ? "solid" : "transparent",
    ...(viewport ? { viewport } : {}),
  };
}

function normalizePage(
  value: unknown,
  index: number,
  usedPageIds: Set<string>,
  warnings: string[],
): Page {
  const source = isRecord(value) ? value : {};
  const graphSource = isRecord(source.graph) ? source.graph : {};
  const graph = normalizeGraph(graphSource, warnings);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  return {
    id: normalizeId(source.id, "page", index, usedPageIds),
    name:
      typeof source.name === "string" && source.name.trim()
        ? source.name.slice(0, 200)
        : `Page-${index + 1}`,
    graph,
    groups: normalizeGroups(source.groups, nodeIds, warnings),
    layers: normalizeLayers(source.layers, graph),
    settings: normalizeSettings(source.settings),
  };
}

function normalizeFragment(
  value: unknown,
  warnings: string[],
): DiagramFragment {
  const source = isRecord(value) ? value : {};
  const graph = normalizeGraph(
    { nodes: source.nodes, edges: source.edges },
    warnings,
  );
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  return {
    version: DIAGRAM_FRAGMENT_VERSION,
    nodes: graph.nodes,
    edges: graph.edges,
    groups: normalizeGroups(source.groups, nodeIds, warnings),
    layers: normalizeLayers(source.layers, graph),
  };
}

function normalizeScratchpad(
  value: unknown,
  warnings: string[],
): ScratchpadItem[] {
  if (!Array.isArray(value)) return [];
  if (value.length > LOGICFLOW_LIMITS.maxScratchpadItems)
    warnings.push(
      `暂存项数量超过 ${LOGICFLOW_LIMITS.maxScratchpadItems}，已截断`,
    );
  const used = new Set<string>();
  return value
    .slice(0, LOGICFLOW_LIMITS.maxScratchpadItems)
    .map((item, index): ScratchpadItem | null => {
      if (!isRecord(item) || !isRecord(item.fragment)) return null;
      return {
        id: normalizeId(item.id, "scratchpad", index, used),
        name:
          typeof item.name === "string" && item.name.trim()
            ? item.name.slice(0, 200)
            : `Fragment-${index + 1}`,
        fragment: normalizeFragment(item.fragment, warnings),
      };
    })
    .filter((item): item is ScratchpadItem => item !== null);
}

function normalizeDefaultStyles(value: unknown): DiagramDefaultStyles {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultDiagramStyles();
  const node = sanitizeJsonValue(source.node);
  const edge = sanitizeJsonValue(source.edge);
  return {
    node: isRecord(node) ? (node as Record<string, JsonValue>) : defaults.node,
    edge: isRecord(edge) ? (edge as Record<string, JsonValue>) : defaults.edge,
  };
}

function v1PageSource(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const graph = isRecord(source.graph)
    ? source.graph
    : { nodes: source.nodes, edges: source.edges };
  return {
    id: "page-1",
    name: "Page-1",
    graph,
    groups: source.groups,
    settings: source.settings,
    layers: source.layers,
  };
}

export function normalizeLogicFlowData(
  value: unknown,
): NormalizedLogicFlowData {
  const warnings: string[] = [];
  const parsed = parseInput(value, warnings);
  const source = isRecord(parsed) ? parsed : {};
  const isV2 =
    source.schemaVersion === LOGICFLOW_SCHEMA_VERSION &&
    Array.isArray(source.pages);
  const pageSources: unknown[] = isV2
    ? (source.pages as unknown[])
    : [v1PageSource(source)];
  if (pageSources.length > LOGICFLOW_LIMITS.maxPages)
    warnings.push(`页面数量超过 ${LOGICFLOW_LIMITS.maxPages}，已截断`);
  const usedPageIds = new Set<string>();
  let pages = pageSources
    .slice(0, LOGICFLOW_LIMITS.maxPages)
    .map((page, index) => normalizePage(page, index, usedPageIds, warnings));
  if (!pages.length) pages = [createDefaultLogicFlowDocument().pages[0]];

  const document: LogicFlowDocument = {
    schemaVersion: LOGICFLOW_SCHEMA_VERSION,
    title:
      typeof source.title === "string" && source.title.trim()
        ? source.title.slice(0, 500)
        : DEFAULT_DOCUMENT_TITLE,
    pages,
    scratchpad: normalizeScratchpad(source.scratchpad, warnings),
    defaultStyles: normalizeDefaultStyles(source.defaultStyles),
  };
  return {
    document,
    migrated: !isV2,
    warnings,
    sourceFingerprint: stableStringify(parsed),
  };
}

export function migrateLogicFlowDocument(value: unknown): LogicFlowDocument {
  return normalizeLogicFlowData(value).document;
}
