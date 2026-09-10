import { deleteElements } from "../../commands/element-commands";
import { isElementLocked } from "../../commands/selection";
import { createDefaultLogicFlowDocument } from "../../model/data";
import { normalizeLayers } from "../../model/layers";
import {
  isValidLogicFlowId,
  isValidLogicFlowType,
  sanitizeJsonValue,
} from "../../model/normalize";
import { updatePage } from "../../model/pages";
import { serializeLogicFlowDocument } from "../../model/serialize";
import { stableStringify } from "../../model/stable-stringify";
import type {
  JsonValue,
  LogicFlowDocument,
  LogicFlowEdgeData,
  LogicFlowNodeData,
  Page,
} from "../../model/types";
import { LOGICFLOW_LIMITS } from "../../model/types";
import { getShapeDefinition } from "../../shapes/shape-registry";
import {
  computeLayeredLogicFlowLayout,
  type LogicFlowLayoutDirection,
} from "../layout/layered-layout";

export const LOGICFLOW_EDGE_TYPES = ["line", "polyline", "bezier"] as const;
export type LogicFlowEdgeType = (typeof LOGICFLOW_EDGE_TYPES)[number];

export interface SemanticLogicFlowNode {
  id: string;
  label: string;
  type?: string;
  properties?: Record<string, unknown>;
}

export interface SemanticLogicFlowEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  type?: LogicFlowEdgeType;
  properties?: Record<string, unknown>;
}

export interface BuildLogicFlowDocumentInput {
  title?: string;
  pageName?: string;
  nodes: SemanticLogicFlowNode[];
  edges: SemanticLogicFlowEdge[];
  layout?: LogicFlowLayoutDirection;
}

export type LogicFlowGraphEdit =
  | {
      op: "addNode";
      id: string;
      type?: string;
      x?: number;
      y?: number;
      text?: string;
      properties?: Record<string, unknown>;
    }
  | {
      op: "updateNode";
      id: string;
      type?: string;
      x?: number;
      y?: number;
      text?: string | null;
      properties?: Record<string, unknown>;
    }
  | { op: "deleteNode"; id: string }
  | {
      op: "addEdge";
      id: string;
      sourceNodeId: string;
      targetNodeId: string;
      type?: LogicFlowEdgeType;
      text?: string;
      properties?: Record<string, unknown>;
    }
  | {
      op: "updateEdge";
      id: string;
      sourceNodeId?: string;
      targetNodeId?: string;
      type?: LogicFlowEdgeType;
      text?: string | null;
      properties?: Record<string, unknown>;
    }
  | { op: "deleteEdge"; id: string };

export interface ApplyLogicFlowEditsResult {
  document: LogicFlowDocument;
  applied: number;
  changed: boolean;
  cascadeDeletedEdgeIds: string[];
}

const MAX_BATCH_EDITS = 200;
const MAX_COORDINATE = 10_000_000;
const edgeTypes = new Set<string>(LOGICFLOW_EDGE_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUsableGeneratedId(value: unknown): value is string {
  return (
    isValidLogicFlowId(value) &&
    value.toLocaleLowerCase() !== "undefined" &&
    value.toLocaleLowerCase() !== "null"
  );
}

/**
 * Tolerate the compact deferred-tool call shape used on a tool's first call.
 * Missing/invalid node IDs are generated deterministically, and edge endpoints
 * may reference either the supplied ID or a unique node label.
 */
export function prepareSemanticLogicFlowGraph(
  nodesValue: unknown,
  edgesValue: unknown,
): { nodes: SemanticLogicFlowNode[]; edges: SemanticLogicFlowEdge[] } {
  if (!Array.isArray(nodesValue)) throw new Error("nodes 必须是数组");
  const sourceNodes = nodesValue.map((value, index) => {
    if (!isRecord(value)) throw new Error(`第 ${index + 1} 个节点格式无效`);
    return value;
  });
  const reserved = new Set<string>();
  for (const node of sourceNodes) {
    if (!isUsableGeneratedId(node.id)) continue;
    if (reserved.has(node.id)) throw new Error(`节点 ID "${node.id}" 重复`);
    reserved.add(node.id);
  }

  const aliases = new Map<string, string | null>();
  const registerAlias = (alias: string | undefined, id: string) => {
    if (!alias) return;
    const current = aliases.get(alias);
    if (current === undefined) aliases.set(alias, id);
    else if (current !== id) aliases.set(alias, null);
  };
  const used = new Set(reserved);
  const nodes = sourceNodes.map((source, index): SemanticLogicFlowNode => {
    const suppliedId = typeof source.id === "string" ? source.id : undefined;
    let id = isUsableGeneratedId(suppliedId) ? suppliedId : `node-${index + 1}`;
    let suffix = index + 1;
    while (used.has(id) && id !== suppliedId) {
      suffix += 1;
      id = `node-${suffix}`;
    }
    used.add(id);
    const label =
      typeof source.label === "string"
        ? source.label
        : typeof source.text === "string"
          ? source.text
          : suppliedId || `节点 ${index + 1}`;
    const rawProperties = isRecord(source.properties)
      ? source.properties
      : undefined;
    const color =
      typeof source.color === "string"
        ? source.color
        : typeof rawProperties?.color === "string"
          ? rawProperties.color
          : undefined;
    const properties =
      rawProperties || color
        ? {
            ...(rawProperties ?? {}),
            ...(color && rawProperties?.fill === undefined
              ? { fill: color }
              : {}),
          }
        : undefined;
    const rawType = typeof source.type === "string" ? source.type : undefined;
    const type = rawType === "rectangle" ? "rect" : rawType;
    registerAlias(id, id);
    registerAlias(suppliedId, id);
    registerAlias(label, id);
    return {
      id,
      label,
      ...(type ? { type } : {}),
      ...(properties ? { properties } : {}),
    };
  });

  const sourceEdges = edgesValue === undefined ? [] : edgesValue;
  if (!Array.isArray(sourceEdges)) throw new Error("edges 必须是数组");
  const resolveEndpoint = (value: unknown, name: string): string => {
    if (typeof value !== "string" || !value)
      throw new Error(`${name} 必须引用节点 ID 或唯一节点标签`);
    const resolved = aliases.get(value);
    if (resolved === null)
      throw new Error(`${name} 引用了重复的节点标签 "${value}"`);
    return resolved ?? value;
  };
  const edges = sourceEdges.map((value, index): SemanticLogicFlowEdge => {
    if (!isRecord(value)) throw new Error(`第 ${index + 1} 条连线格式无效`);
    const from = resolveEndpoint(
      value.from ?? value.sourceNodeId,
      `第 ${index + 1} 条连线的 from`,
    );
    const to = resolveEndpoint(
      value.to ?? value.targetNodeId,
      `第 ${index + 1} 条连线的 to`,
    );
    const id = isUsableGeneratedId(value.id) ? value.id : undefined;
    const label =
      typeof value.label === "string"
        ? value.label
        : typeof value.text === "string"
          ? value.text
          : undefined;
    const type =
      typeof value.type === "string"
        ? (value.type as LogicFlowEdgeType)
        : undefined;
    const properties = isRecord(value.properties)
      ? value.properties
      : undefined;
    return {
      ...(id ? { id } : {}),
      from,
      to,
      ...(label !== undefined ? { label } : {}),
      ...(type ? { type } : {}),
      ...(properties ? { properties } : {}),
    };
  });
  return { nodes, edges };
}

function validateElementId(id: string, kind: string): void {
  if (!isValidLogicFlowId(id)) {
    throw new Error(`${kind} ID "${id}" 格式无效`);
  }
}

function validateText(value: string | undefined, kind: string): void {
  if (value !== undefined && value.length > LOGICFLOW_LIMITS.maxTextLength) {
    throw new Error(
      `${kind}文本长度不能超过 ${LOGICFLOW_LIMITS.maxTextLength}`,
    );
  }
}

function validateCoordinate(value: number, name: string): void {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE) {
    throw new Error(`${name} 必须是绝对值不超过 ${MAX_COORDINATE} 的有限数值`);
  }
}

export function validateDirectLogicFlowShape(type: string): void {
  if (!isValidLogicFlowType(type))
    throw new Error(`形状类型 "${type}" 格式无效`);
  const definition = getShapeDefinition(type);
  if (!definition) throw new Error(`LogicFlow 未注册形状类型 "${type}"`);
  if (definition.containerId) {
    throw new Error(`形状 "${type}" 需要组合工厂，当前 Agent 工具不能直接创建`);
  }
}

function validateEdgeType(type: string): asserts type is LogicFlowEdgeType {
  if (!edgeTypes.has(type)) {
    throw new Error(
      `连线类型 "${type}" 无效，可用类型: ${LOGICFLOW_EDGE_TYPES.join(", ")}`,
    );
  }
}

function sanitizeProperties(
  value: Record<string, unknown> | undefined,
): Record<string, JsonValue> | undefined {
  if (value === undefined) return undefined;
  const sanitized = sanitizeJsonValue(value);
  return isRecord(sanitized)
    ? (sanitized as Record<string, JsonValue>)
    : undefined;
}

function uniqueElementIds(page: Page): Set<string> {
  return new Set([
    ...page.graph.nodes.map((node) => node.id),
    ...page.graph.edges.map((edge) => edge.id),
  ]);
}

function ensureElementUnlocked(page: Page, id: string): void {
  if (isElementLocked(page, id)) throw new Error(`元素 "${id}" 已锁定`);
}

function withoutRoutePoints(edge: LogicFlowEdgeData): LogicFlowEdgeData {
  const { startPoint, endPoint, pointsList, ...rest } = edge;
  void startPoint;
  void endPoint;
  void pointsList;
  return rest;
}

function mergeProperties(
  current: Record<string, JsonValue> | undefined,
  patch: Record<string, unknown> | undefined,
): Record<string, JsonValue> | undefined {
  if (patch === undefined) return current;
  return sanitizeProperties({ ...(current ?? {}), ...patch });
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function nodeDimensions(
  type: string,
  node: Record<string, unknown> = {},
): { width: number; height: number } {
  const definition = getShapeDefinition(type);
  const properties = isRecord(node.properties) ? node.properties : {};
  const radius = positiveNumber(properties.r) ?? positiveNumber(node.r);
  const rx = positiveNumber(properties.rx) ?? positiveNumber(node.rx);
  const ry = positiveNumber(properties.ry) ?? positiveNumber(node.ry);
  return {
    width:
      positiveNumber(node.width) ??
      positiveNumber(properties.width) ??
      (radius !== undefined ? radius * 2 : undefined) ??
      (rx !== undefined ? rx * 2 : undefined) ??
      definition?.width ??
      120,
    height:
      positiveNumber(node.height) ??
      positiveNumber(properties.height) ??
      (radius !== undefined ? radius * 2 : undefined) ??
      (ry !== undefined ? ry * 2 : undefined) ??
      definition?.height ??
      60,
  };
}

function resolveAddedNodePosition(
  page: Page,
  type: string,
  x: number | undefined,
  y: number | undefined,
  properties: Record<string, unknown> | undefined,
): { x: number; y: number } {
  if (x !== undefined && y !== undefined) return { x, y };
  const size = nodeDimensions(type, { properties });
  if (!page.graph.nodes.length) {
    return { x: x ?? 160, y: y ?? 120 };
  }
  const bounds = page.graph.nodes.map((node) => {
    const dimensions = nodeDimensions(node.type, node);
    return {
      left: node.x - dimensions.width / 2,
      bottom: node.y + dimensions.height / 2,
    };
  });
  const left = Math.min(...bounds.map((item) => item.left));
  const bottom = Math.max(...bounds.map((item) => item.bottom));
  return {
    x: x ?? left + size.width / 2,
    y: y ?? bottom + size.height / 2 + 80,
  };
}

function resolveSemanticEdges(
  nodes: SemanticLogicFlowNode[],
  edges: SemanticLogicFlowEdge[],
): Array<SemanticLogicFlowEdge & { id: string; type: LogicFlowEdgeType }> {
  const used = new Set(nodes.map((node) => node.id));
  return edges.map((edge, index) => {
    const type = edge.type ?? "polyline";
    validateEdgeType(type);
    let id = edge.id;
    if (id) {
      validateElementId(id, "连线");
      if (used.has(id)) throw new Error(`元素 ID "${id}" 重复`);
    } else {
      let suffix = index + 1;
      id = `edge-${suffix}`;
      while (used.has(id)) {
        suffix += 1;
        id = `edge-${suffix}`;
      }
    }
    used.add(id);
    return { ...edge, id, type };
  });
}

export function validateSemanticLogicFlowGraph(
  nodes: SemanticLogicFlowNode[],
  edges: SemanticLogicFlowEdge[],
): void {
  if (!nodes.length) throw new Error("nodes 数组不能为空");
  if (nodes.length > LOGICFLOW_LIMITS.maxNodes) {
    throw new Error(`节点数量不能超过 ${LOGICFLOW_LIMITS.maxNodes}`);
  }
  if (edges.length > LOGICFLOW_LIMITS.maxEdges) {
    throw new Error(`连线数量不能超过 ${LOGICFLOW_LIMITS.maxEdges}`);
  }

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    validateElementId(node.id, "节点");
    if (nodeIds.has(node.id)) throw new Error(`节点 ID "${node.id}" 重复`);
    nodeIds.add(node.id);
    validateText(node.label, "节点");
    validateDirectLogicFlowShape(node.type ?? "rect");
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new Error(`连线 ${edge.from} -> ${edge.to} 引用了不存在的节点`);
    }
    validateText(edge.label, "连线");
  }
  resolveSemanticEdges(nodes, edges);
}

export function buildLogicFlowDocumentFromGraph(
  input: BuildLogicFlowDocumentInput,
): LogicFlowDocument {
  validateSemanticLogicFlowGraph(input.nodes, input.edges);
  const direction = input.layout ?? "vertical";
  const edges = resolveSemanticEdges(input.nodes, input.edges);
  const layout = computeLayeredLogicFlowLayout(input.nodes, edges, direction);
  const document = createDefaultLogicFlowDocument();
  const page = document.pages[0];
  const graph = {
    nodes: layout.nodes.map((node): LogicFlowNodeData => {
      const definition = getShapeDefinition(node.type)!;
      const properties = sanitizeProperties({
        ...(definition.defaultProperties ?? {}),
        ...(input.nodes.find((candidate) => candidate.id === node.id)
          ?.properties ?? {}),
      });
      return {
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        text: node.label,
        ...(properties && Object.keys(properties).length ? { properties } : {}),
      };
    }),
    edges: edges.map(
      (edge): LogicFlowEdgeData => ({
        id: edge.id,
        type: edge.type,
        sourceNodeId: edge.from,
        targetNodeId: edge.to,
        ...(edge.label !== undefined ? { text: edge.label } : {}),
        ...(sanitizeProperties(edge.properties)
          ? { properties: sanitizeProperties(edge.properties) }
          : {}),
      }),
    ),
  };
  const next = updatePage(
    { ...document, title: input.title?.trim() || document.title },
    page.id,
    {
      name: input.pageName?.trim() || page.name,
      graph,
      layers: normalizeLayers(page.layers, graph),
    },
  );
  return serializeLogicFlowDocument(next);
}

export function applyLogicFlowGraphEdits(
  document: LogicFlowDocument,
  pageId: string,
  edits: LogicFlowGraphEdit[],
): ApplyLogicFlowEditsResult {
  if (!edits.length) throw new Error("edits 数组不能为空");
  if (edits.length > MAX_BATCH_EDITS) {
    throw new Error(`单次最多执行 ${MAX_BATCH_EDITS} 个流程图编辑`);
  }

  const original = serializeLogicFlowDocument(document);
  const target = original.pages.find((page) => page.id === pageId);
  if (!target) throw new Error(`未找到 pageId 为 "${pageId}" 的页面`);
  let page: Page = target;
  const cascadeDeletedEdgeIds: string[] = [];

  for (const edit of edits) {
    const ids = uniqueElementIds(page);
    switch (edit.op) {
      case "addNode": {
        validateElementId(edit.id, "节点");
        if (ids.has(edit.id)) throw new Error(`元素 ID "${edit.id}" 已存在`);
        if (page.graph.nodes.length >= LOGICFLOW_LIMITS.maxNodes)
          throw new Error(`节点数量不能超过 ${LOGICFLOW_LIMITS.maxNodes}`);
        const type = edit.type ?? "rect";
        validateDirectLogicFlowShape(type);
        const position = resolveAddedNodePosition(
          page,
          type,
          edit.x,
          edit.y,
          edit.properties,
        );
        validateCoordinate(position.x, "x");
        validateCoordinate(position.y, "y");
        validateText(edit.text, "节点");
        const definition = getShapeDefinition(type)!;
        const properties = sanitizeProperties({
          ...(definition.defaultProperties ?? {}),
          ...(edit.properties ?? {}),
        });
        const node: LogicFlowNodeData = {
          id: edit.id,
          type,
          x: position.x,
          y: position.y,
          ...(edit.text !== undefined ? { text: edit.text } : {}),
          ...(properties && Object.keys(properties).length
            ? { properties }
            : {}),
        };
        const graph = {
          ...page.graph,
          nodes: [...page.graph.nodes, node],
        };
        page = { ...page, graph, layers: normalizeLayers(page.layers, graph) };
        break;
      }
      case "updateNode": {
        const index = page.graph.nodes.findIndex((node) => node.id === edit.id);
        if (index < 0) throw new Error(`未找到节点 "${edit.id}"`);
        ensureElementUnlocked(page, edit.id);
        if (edit.type !== undefined) validateDirectLogicFlowShape(edit.type);
        if (edit.x !== undefined) validateCoordinate(edit.x, "x");
        if (edit.y !== undefined) validateCoordinate(edit.y, "y");
        validateText(edit.text ?? undefined, "节点");
        const current = page.graph.nodes[index];
        const next: LogicFlowNodeData = {
          ...current,
          ...(edit.type !== undefined ? { type: edit.type } : {}),
          ...(edit.x !== undefined ? { x: edit.x } : {}),
          ...(edit.y !== undefined ? { y: edit.y } : {}),
          ...(edit.text !== undefined
            ? edit.text === null
              ? { text: undefined }
              : { text: edit.text }
            : {}),
          ...(edit.properties !== undefined
            ? {
                properties: mergeProperties(
                  current.properties,
                  edit.properties,
                ),
              }
            : {}),
        };
        const moved = edit.x !== undefined || edit.y !== undefined;
        const graph = {
          nodes: page.graph.nodes.map((node, nodeIndex) =>
            nodeIndex === index ? next : node,
          ),
          edges: moved
            ? page.graph.edges.map((edge) =>
                edge.sourceNodeId === edit.id || edge.targetNodeId === edit.id
                  ? withoutRoutePoints(edge)
                  : edge,
              )
            : page.graph.edges,
        };
        page = { ...page, graph };
        break;
      }
      case "deleteNode": {
        if (!page.graph.nodes.some((node) => node.id === edit.id))
          throw new Error(`未找到节点 "${edit.id}"`);
        ensureElementUnlocked(page, edit.id);
        cascadeDeletedEdgeIds.push(
          ...page.graph.edges
            .filter(
              (edge) =>
                edge.sourceNodeId === edit.id || edge.targetNodeId === edit.id,
            )
            .map((edge) => edge.id),
        );
        page = deleteElements(page, [edit.id]);
        break;
      }
      case "addEdge": {
        validateElementId(edit.id, "连线");
        if (ids.has(edit.id)) throw new Error(`元素 ID "${edit.id}" 已存在`);
        if (page.graph.edges.length >= LOGICFLOW_LIMITS.maxEdges)
          throw new Error(`连线数量不能超过 ${LOGICFLOW_LIMITS.maxEdges}`);
        const nodeIds = new Set(page.graph.nodes.map((node) => node.id));
        if (
          !nodeIds.has(edit.sourceNodeId) ||
          !nodeIds.has(edit.targetNodeId)
        ) {
          throw new Error(
            `连线 ${edit.sourceNodeId} -> ${edit.targetNodeId} 引用了不存在的节点`,
          );
        }
        const type = edit.type ?? "polyline";
        validateEdgeType(type);
        validateText(edit.text, "连线");
        const edge: LogicFlowEdgeData = {
          id: edit.id,
          type,
          sourceNodeId: edit.sourceNodeId,
          targetNodeId: edit.targetNodeId,
          ...(edit.text !== undefined ? { text: edit.text } : {}),
          ...(sanitizeProperties(edit.properties)
            ? { properties: sanitizeProperties(edit.properties) }
            : {}),
        };
        const graph = {
          ...page.graph,
          edges: [...page.graph.edges, edge],
        };
        page = { ...page, graph, layers: normalizeLayers(page.layers, graph) };
        break;
      }
      case "updateEdge": {
        const index = page.graph.edges.findIndex((edge) => edge.id === edit.id);
        if (index < 0) throw new Error(`未找到连线 "${edit.id}"`);
        ensureElementUnlocked(page, edit.id);
        if (edit.type !== undefined) validateEdgeType(edit.type);
        validateText(edit.text ?? undefined, "连线");
        const current = page.graph.edges[index];
        const sourceNodeId = edit.sourceNodeId ?? current.sourceNodeId;
        const targetNodeId = edit.targetNodeId ?? current.targetNodeId;
        const nodeIds = new Set(page.graph.nodes.map((node) => node.id));
        if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) {
          throw new Error(
            `连线 ${sourceNodeId} -> ${targetNodeId} 引用了不存在的节点`,
          );
        }
        let next: LogicFlowEdgeData = {
          ...current,
          sourceNodeId,
          targetNodeId,
          ...(edit.type !== undefined ? { type: edit.type } : {}),
          ...(edit.text !== undefined
            ? edit.text === null
              ? { text: undefined }
              : { text: edit.text }
            : {}),
          ...(edit.properties !== undefined
            ? {
                properties: mergeProperties(
                  current.properties,
                  edit.properties,
                ),
              }
            : {}),
        };
        if (
          sourceNodeId !== current.sourceNodeId ||
          targetNodeId !== current.targetNodeId ||
          edit.type !== undefined
        ) {
          next = withoutRoutePoints(next);
        }
        page = {
          ...page,
          graph: {
            ...page.graph,
            edges: page.graph.edges.map((edge, edgeIndex) =>
              edgeIndex === index ? next : edge,
            ),
          },
        };
        break;
      }
      case "deleteEdge": {
        if (!page.graph.edges.some((edge) => edge.id === edit.id))
          throw new Error(`未找到连线 "${edit.id}"`);
        ensureElementUnlocked(page, edit.id);
        page = deleteElements(page, [edit.id]);
        break;
      }
      default: {
        const exhaustive: never = edit;
        throw new Error(`不支持的编辑操作: ${String(exhaustive)}`);
      }
    }
  }

  const next = serializeLogicFlowDocument(updatePage(original, pageId, page));
  return {
    document: next,
    applied: edits.length,
    changed: stableStringify(original) !== stableStringify(next),
    cascadeDeletedEdgeIds: [...new Set(cascadeDeletedEdgeIds)],
  };
}
