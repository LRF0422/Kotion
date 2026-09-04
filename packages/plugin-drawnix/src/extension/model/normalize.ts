import {
  DRAWNIX_SCHEMA_VERSION,
  MINDMAP_LAYOUTS,
  MINDMAP_LIMITS,
  type DrawnixData,
  type LegacyDrawnixData,
  type LegacyPlaitElement,
  type MindmapBranchSide,
  type MindmapDocument,
  type MindmapLayout,
  type MindmapNode,
  type MindmapViewport,
  type NormalizedDrawnixData,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeLayout(value: unknown): MindmapLayout {
  return typeof value === "string" &&
    (MINDMAP_LAYOUTS as readonly string[]).includes(value)
    ? (value as MindmapLayout)
    : "standard";
}

function normalizeSide(value: unknown): MindmapBranchSide | undefined {
  return value === "left" || value === "right" ? value : undefined;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, MINDMAP_LIMITS.maxTextLength);
}

function collectInlineText(value: unknown): string {
  if (!isRecord(value)) return "";
  if (typeof value.text === "string") return value.text;
  if (!Array.isArray(value.children)) return "";
  return value.children.map(collectInlineText).join("");
}

export function extractLegacyTopicText(element: LegacyPlaitElement): string {
  if (!isRecord(element.data)) return "";
  const topic = element.data.topic;
  if (!isRecord(topic) || !Array.isArray(topic.children)) return "";
  const hasBlockChildren = topic.children.some(
    (child) => isRecord(child) && Array.isArray(child.children),
  );
  return normalizeText(
    topic.children.map(collectInlineText).join(hasBlockChildren ? "\n" : ""),
  );
}

function deterministicId(path: number[]): string {
  return `mindmap-${path.join("-") || "root"}`;
}

function normalizeId(
  value: unknown,
  path: number[],
  usedIds: Set<string>,
): string {
  const requested =
    typeof value === "string" && value.trim() ? value : deterministicId(path);
  if (!usedIds.has(requested)) {
    usedIds.add(requested);
    return requested;
  }

  let candidate = deterministicId(path);
  let suffix = 1;
  while (usedIds.has(candidate)) {
    candidate = `${deterministicId(path)}-${suffix++}`;
  }
  usedIds.add(candidate);
  return candidate;
}

interface SanitizeContext {
  usedIds: Set<string>;
  warnings: string[];
  nodeCount: number;
}

function sanitizeSemanticNode(
  value: unknown,
  path: number[],
  depth: number,
  context: SanitizeContext,
): MindmapNode | null {
  if (!isRecord(value)) return null;
  if (
    depth > MINDMAP_LIMITS.maxDepth ||
    context.nodeCount >= MINDMAP_LIMITS.maxNodes
  ) {
    context.warnings.push("思维导图超过大小限制，已截断部分节点");
    return null;
  }

  context.nodeCount += 1;
  const node: MindmapNode = {
    id: normalizeId(value.id, path, context.usedIds),
    text: normalizeText(value.text),
    children: [],
  };

  const side = normalizeSide(value.side);
  if (side) node.side = side;
  if (value.collapsed === true) node.collapsed = true;
  if (isRecord(value.manualOffset)) {
    node.manualOffset = {
      x: finiteNumber(value.manualOffset.x, 0),
      y: finiteNumber(value.manualOffset.y, 0),
    };
  }

  const children = Array.isArray(value.children) ? value.children : [];
  node.children = children
    .map((child, index) =>
      sanitizeSemanticNode(child, [...path, index], depth + 1, context),
    )
    .filter((child): child is MindmapNode => child !== null);

  return node;
}

function sanitizeLegacyNode(
  value: unknown,
  path: number[],
  depth: number,
  context: SanitizeContext,
): MindmapNode | null {
  if (!isRecord(value)) return null;
  if (
    depth > MINDMAP_LIMITS.maxDepth ||
    context.nodeCount >= MINDMAP_LIMITS.maxNodes
  ) {
    context.warnings.push("旧版思维导图超过大小限制，已截断部分节点");
    return null;
  }

  context.nodeCount += 1;
  const element = value as LegacyPlaitElement;
  const node: MindmapNode = {
    id: normalizeId(element.id, path, context.usedIds),
    text: extractLegacyTopicText(element),
    children: [],
  };

  if (element.isCollapsed === true) node.collapsed = true;
  const children = Array.isArray(element.children) ? element.children : [];
  node.children = children
    .map((child, index) =>
      sanitizeLegacyNode(child, [...path, index], depth + 1, context),
    )
    .filter((child): child is MindmapNode => child !== null);

  return node;
}

function normalizeViewport(value: unknown): MindmapViewport | undefined {
  if (!isRecord(value)) return undefined;
  const zoom = clamp(
    finiteNumber(value.zoom, 1),
    MINDMAP_LIMITS.minZoom,
    MINDMAP_LIMITS.maxZoom,
  );
  const x = finiteNumber(value.x, finiteNumber(value.offsetX, 0));
  const y = finiteNumber(value.y, finiteNumber(value.offsetY, 0));
  return { x, y, zoom };
}

function createFallbackDocument(): MindmapDocument {
  return {
    schemaVersion: DRAWNIX_SCHEMA_VERSION,
    layout: "standard",
    root: {
      id: "root",
      text: "中心主题",
      children: [],
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function findLegacyRoot(children: unknown): LegacyPlaitElement | null {
  if (!Array.isArray(children)) return null;
  const records = children.filter(isRecord) as LegacyPlaitElement[];
  return (
    records.find((item) => item.isRoot === true || item.type === "mindmap") ??
    records[0] ??
    null
  );
}

function applyLegacyRootSides(
  root: MindmapNode,
  rightNodeCount: unknown,
): MindmapNode {
  const requested = Math.round(
    finiteNumber(rightNodeCount, root.children.length),
  );
  const rightCount = clamp(requested, 0, root.children.length);
  return {
    ...root,
    children: root.children.map((child, index) => ({
      ...child,
      side: index < rightCount ? "right" : "left",
    })),
  };
}

export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const visit = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(visit);
    if (!isRecord(item)) return item;
    if (seen.has(item)) return "[Circular]";
    seen.add(item);
    return Object.keys(item)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = visit(item[key]);
        return result;
      }, {});
  };
  try {
    return JSON.stringify(visit(value));
  } catch {
    return String(value);
  }
}

export function normalizeDrawnixData(
  data: DrawnixData | null | undefined,
): NormalizedDrawnixData {
  const sourceFingerprint = stableStringify(data ?? null);
  const context: SanitizeContext = {
    usedIds: new Set(),
    warnings: [],
    nodeCount: 0,
  };

  if (
    isRecord(data) &&
    data.schemaVersion === DRAWNIX_SCHEMA_VERSION &&
    isRecord(data.root)
  ) {
    const root = sanitizeSemanticNode(data.root, [0], 0, context);
    if (root) {
      const document: MindmapDocument = {
        schemaVersion: DRAWNIX_SCHEMA_VERSION,
        root,
        layout: normalizeLayout(data.layout),
        viewport: normalizeViewport(data.viewport),
      };
      return {
        document,
        migrated:
          stableStringify(document) !==
          stableStringify({
            schemaVersion: data.schemaVersion,
            root: data.root,
            layout: data.layout,
            viewport: normalizeViewport(data.viewport),
          }),
        canWriteBack: true,
        warnings: context.warnings,
        sourceFingerprint,
      };
    }
  }

  const legacy = (isRecord(data) ? data : {}) as LegacyDrawnixData;
  const legacyRoot = findLegacyRoot(legacy.children);
  if (legacyRoot) {
    const normalizedRoot = sanitizeLegacyNode(legacyRoot, [0], 0, context);
    if (normalizedRoot) {
      const root = applyLegacyRootSides(
        normalizedRoot,
        legacyRoot.rightNodeCount,
      );
      return {
        document: {
          schemaVersion: DRAWNIX_SCHEMA_VERSION,
          root,
          layout: normalizeLayout(legacyRoot.layout),
          viewport: normalizeViewport(legacy.viewport),
        },
        migrated: true,
        canWriteBack: true,
        warnings: context.warnings,
        sourceFingerprint,
      };
    }
  }

  return {
    document: createFallbackDocument(),
    migrated: true,
    canWriteBack: data == null || isRecord(data),
    warnings: data == null ? [] : ["思维导图数据无效，已使用默认内容"],
    sourceFingerprint,
  };
}
