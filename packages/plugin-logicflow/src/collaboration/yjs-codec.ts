import * as Y from "yjs";
import { normalizeLogicFlowData } from "../model/normalize";
import type {
  JsonPrimitive,
  JsonValue,
  Layer,
  LogicFlowDocument,
  LogicFlowEdgeData,
  LogicFlowGroup,
  LogicFlowNodeData,
  Page,
  ScratchpadItem,
} from "../model/types";

export const LOGICFLOW_DIAGRAMS_MAP = "logicflow-diagrams";
export const LOCAL_ORIGIN = Symbol("logicflow-local-origin");

const migratedV2Maps = new WeakSet<Y.Map<unknown>>();

export type LogicFlowDiagramMap = Y.Map<unknown>;
export type LogicFlowDiagramsMap = Y.Map<LogicFlowDiagramMap>;

type JsonObject = Record<string, JsonValue>;
type YJsonValue = JsonPrimitive | Y.Map<unknown> | Y.Array<unknown>;

const ROOT_KEYS = {
  schemaVersion: "schemaVersion",
  title: "title",
  defaultStyles: "defaultStyles",
  pages: "pages",
  pageOrder: "pageOrder",
  scratchpad: "scratchpad",
  scratchpadOrder: "scratchpadOrder",
} as const;

const PAGE_KEYS = {
  name: "name",
  nodes: "nodes",
  nodeOrder: "nodeOrder",
  edges: "edges",
  edgeOrder: "edgeOrder",
  groups: "groups",
  groupOrder: "groupOrder",
  layers: "layers",
  layerOrder: "layerOrder",
  settings: "settings",
} as const;

const LEGACY_KEYS = {
  nodes: "nodes",
  nodeOrder: "nodeOrder",
  edges: "edges",
  edgeOrder: "edgeOrder",
  groups: "groups",
  groupOrder: "groupOrder",
  settings: "settings",
} as const;

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runTransaction(
  sharedType: { readonly doc: Y.Doc | null },
  origin: unknown,
  action: () => void,
): void {
  if (sharedType.doc) sharedType.doc.transact(action, origin);
  else action();
}

function createYValue(value: JsonValue): YJsonValue {
  if (Array.isArray(value)) {
    const result = new Y.Array<unknown>();
    if (value.length) result.insert(0, value.map(createYValue));
    return result;
  }
  if (isJsonObject(value)) {
    const result = new Y.Map<unknown>();
    for (const [key, child] of Object.entries(value)) {
      if (!BLOCKED_KEYS.has(key)) result.set(key, createYValue(child));
    }
    return result;
  }
  return value;
}

function syncYValue(current: unknown, next: JsonValue): YJsonValue | undefined {
  if (Array.isArray(next)) {
    if (!(current instanceof Y.Array)) return createYValue(next);
    syncYArray(current, next);
    return undefined;
  }
  if (isJsonObject(next)) {
    if (!(current instanceof Y.Map)) return createYValue(next);
    syncYMap(current, next);
    return undefined;
  }
  return Object.is(current, next) ? undefined : next;
}

function syncYMap(target: Y.Map<unknown>, value: JsonObject): void {
  const keys = Object.keys(value).filter((key) => !BLOCKED_KEYS.has(key));
  const expected = new Set(keys);
  for (const key of Array.from(target.keys())) {
    if (!expected.has(key)) target.delete(key);
  }
  for (const key of keys) {
    const replacement = syncYValue(target.get(key), value[key]);
    if (replacement !== undefined) target.set(key, replacement);
  }
}

function syncYArray(target: Y.Array<unknown>, value: JsonValue[]): void {
  const sharedLength = Math.min(target.length, value.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const replacement = syncYValue(target.get(index), value[index]);
    if (replacement !== undefined) {
      target.delete(index, 1);
      target.insert(index, [replacement]);
    }
  }
  if (target.length > value.length) {
    target.delete(value.length, target.length - value.length);
  } else if (target.length < value.length) {
    target.insert(target.length, value.slice(target.length).map(createYValue));
  }
}

function getOrCreateMap(parent: Y.Map<unknown>, key: string): Y.Map<unknown> {
  const current = parent.get(key);
  if (current instanceof Y.Map) return current;
  const created = new Y.Map<unknown>();
  parent.set(key, created);
  return created;
}

function getOrCreateArray(
  parent: Y.Map<unknown>,
  key: string,
): Y.Array<unknown> {
  const current = parent.get(key);
  if (current instanceof Y.Array) return current;
  const created = new Y.Array<unknown>();
  parent.set(key, created);
  return created;
}

function syncStringArray(target: Y.Array<unknown>, values: string[]): void {
  const current = target
    .toArray()
    .filter((value): value is string => typeof value === "string");
  if (
    current.length === values.length &&
    current.every((value, index) => value === values[index])
  )
    return;
  if (target.length) target.delete(0, target.length);
  if (values.length) target.insert(0, values);
}

function syncCollection<T extends { id: string }>(
  parent: Y.Map<unknown>,
  mapKey: string,
  orderKey: string,
  values: T[],
  writer: (target: Y.Map<unknown>, value: T) => void = (target, value) =>
    syncYMap(target, value as unknown as JsonObject),
): void {
  const collection = getOrCreateMap(parent, mapKey);
  const order = getOrCreateArray(parent, orderKey);
  const ids = new Set(values.map((value) => value.id));
  for (const id of Array.from(collection.keys())) {
    if (!ids.has(id)) collection.delete(id);
  }
  for (const value of values) {
    const existing = collection.get(value.id);
    const target = existing instanceof Y.Map ? existing : new Y.Map<unknown>();
    if (!(existing instanceof Y.Map)) collection.set(value.id, target);
    writer(target, value);
  }
  syncStringArray(
    order,
    values.map((value) => value.id),
  );
}

function decodeYValue(value: unknown): unknown {
  if (value instanceof Y.Map) {
    const result: Record<string, unknown> = {};
    for (const [key, child] of value.entries()) {
      if (!BLOCKED_KEYS.has(key)) result[key] = decodeYValue(child);
    }
    return result;
  }
  if (value instanceof Y.Array) return value.toArray().map(decodeYValue);
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  return undefined;
}

function readOrderedCollection<T>(
  parent: Y.Map<unknown>,
  mapKey: string,
  orderKey: string,
  reader: (id: string, value: Y.Map<unknown>) => T | undefined = (_id, value) =>
    decodeYValue(value) as T,
): T[] {
  const collection = parent.get(mapKey);
  if (!(collection instanceof Y.Map)) return [];
  const order = parent.get(orderKey);
  const orderedIds = order instanceof Y.Array ? order.toArray() : [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of orderedIds) {
    if (typeof id !== "string" || seen.has(id) || !collection.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  ids.push(
    ...Array.from(collection.keys())
      .filter((id) => !seen.has(id))
      .sort(),
  );
  return ids.flatMap((id) => {
    const value = collection.get(id);
    if (!(value instanceof Y.Map)) return [];
    const decoded = reader(id, value);
    return decoded === undefined ? [] : [decoded];
  });
}

function writePage(target: Y.Map<unknown>, page: Page): void {
  if (target.get(PAGE_KEYS.name) !== page.name)
    target.set(PAGE_KEYS.name, page.name);
  syncCollection(
    target,
    PAGE_KEYS.nodes,
    PAGE_KEYS.nodeOrder,
    page.graph.nodes,
  );
  syncCollection(
    target,
    PAGE_KEYS.edges,
    PAGE_KEYS.edgeOrder,
    page.graph.edges,
  );
  syncCollection(target, PAGE_KEYS.groups, PAGE_KEYS.groupOrder, page.groups);
  syncCollection(target, PAGE_KEYS.layers, PAGE_KEYS.layerOrder, page.layers);
  syncYMap(
    getOrCreateMap(target, PAGE_KEYS.settings),
    page.settings as unknown as JsonObject,
  );
}

function readPage(id: string, source: Y.Map<unknown>): Page {
  return {
    id,
    name:
      typeof source.get(PAGE_KEYS.name) === "string"
        ? (source.get(PAGE_KEYS.name) as string)
        : id,
    graph: {
      nodes: readOrderedCollection<LogicFlowNodeData>(
        source,
        PAGE_KEYS.nodes,
        PAGE_KEYS.nodeOrder,
      ),
      edges: readOrderedCollection<LogicFlowEdgeData>(
        source,
        PAGE_KEYS.edges,
        PAGE_KEYS.edgeOrder,
      ),
    },
    groups: readOrderedCollection<LogicFlowGroup>(
      source,
      PAGE_KEYS.groups,
      PAGE_KEYS.groupOrder,
    ),
    layers: readOrderedCollection<Layer>(
      source,
      PAGE_KEYS.layers,
      PAGE_KEYS.layerOrder,
    ),
    settings: decodeYValue(source.get(PAGE_KEYS.settings)) as Page["settings"],
  };
}

function writeDocument(
  target: LogicFlowDiagramMap,
  document: LogicFlowDocument,
): void {
  if (target.get(ROOT_KEYS.schemaVersion) !== document.schemaVersion)
    target.set(ROOT_KEYS.schemaVersion, document.schemaVersion);
  if (target.get(ROOT_KEYS.title) !== document.title)
    target.set(ROOT_KEYS.title, document.title);
  syncYMap(
    getOrCreateMap(target, ROOT_KEYS.defaultStyles),
    document.defaultStyles as unknown as JsonObject,
  );
  syncCollection(
    target,
    ROOT_KEYS.pages,
    ROOT_KEYS.pageOrder,
    document.pages,
    writePage,
  );
  syncCollection(
    target,
    ROOT_KEYS.scratchpad,
    ROOT_KEYS.scratchpadOrder,
    document.scratchpad,
  );
  for (const key of Object.values(LEGACY_KEYS)) {
    if (target.has(key)) target.delete(key);
  }
}

function legacySnapshot(source: LogicFlowDiagramMap): unknown {
  return {
    schemaVersion: 1,
    graph: {
      nodes: readOrderedCollection<LogicFlowNodeData>(
        source,
        LEGACY_KEYS.nodes,
        LEGACY_KEYS.nodeOrder,
      ),
      edges: readOrderedCollection<LogicFlowEdgeData>(
        source,
        LEGACY_KEYS.edges,
        LEGACY_KEYS.edgeOrder,
      ),
    },
    groups: readOrderedCollection<LogicFlowGroup>(
      source,
      LEGACY_KEYS.groups,
      LEGACY_KEYS.groupOrder,
    ),
    settings: decodeYValue(source.get(LEGACY_KEYS.settings)),
  };
}

function hasV2Pages(source: LogicFlowDiagramMap): boolean {
  return source.get(ROOT_KEYS.pages) instanceof Y.Map;
}

function v2Snapshot(diagramMap: LogicFlowDiagramMap) {
  return {
    schemaVersion: diagramMap.get(ROOT_KEYS.schemaVersion),
    title: diagramMap.get(ROOT_KEYS.title),
    defaultStyles: decodeYValue(diagramMap.get(ROOT_KEYS.defaultStyles)),
    pages: readOrderedCollection<Page>(
      diagramMap,
      ROOT_KEYS.pages,
      ROOT_KEYS.pageOrder,
      readPage,
    ),
    scratchpad: readOrderedCollection<ScratchpadItem>(
      diagramMap,
      ROOT_KEYS.scratchpad,
      ROOT_KEYS.scratchpadOrder,
      (_id, value) => decodeYValue(value) as ScratchpadItem,
    ),
  };
}

export function migrateLogicFlowDiagramMap(
  diagramMap: LogicFlowDiagramMap,
  origin: unknown = "logicflow-v2-migration",
): boolean {
  if (hasV2Pages(diagramMap)) {
    if (migratedV2Maps.has(diagramMap)) return false;
    const normalized = normalizeLogicFlowData(v2Snapshot(diagramMap));
    migratedV2Maps.add(diagramMap);
    if (!normalized.migrated) return false;
    runTransaction(diagramMap, origin, () =>
      writeDocument(diagramMap, normalized.document),
    );
    return true;
  }
  if (!diagramMap.has(LEGACY_KEYS.nodes) && diagramMap.size !== 0) return false;
  const normalized = normalizeLogicFlowData(
    diagramMap.size === 0 ? null : legacySnapshot(diagramMap),
  ).document;
  runTransaction(diagramMap, origin, () =>
    writeDocument(diagramMap, normalized),
  );
  return true;
}

export function getDiagramMap(
  diagrams: LogicFlowDiagramsMap,
  diagramId: string,
): LogicFlowDiagramMap | undefined {
  const value = diagrams.get(diagramId);
  return value instanceof Y.Map ? value : undefined;
}

export function getOrCreateDiagramMap(
  diagrams: LogicFlowDiagramsMap,
  diagramId: string,
  origin: unknown = LOCAL_ORIGIN,
): LogicFlowDiagramMap {
  const current = getDiagramMap(diagrams, diagramId);
  if (current) return current;
  let created: LogicFlowDiagramMap | undefined;
  runTransaction(diagrams, origin, () => {
    const concurrent = getDiagramMap(diagrams, diagramId);
    if (concurrent) created = concurrent;
    else {
      created = new Y.Map<unknown>();
      diagrams.set(diagramId, created);
    }
  });
  return created as LogicFlowDiagramMap;
}

export function readLogicFlowDocument(
  diagramMap: LogicFlowDiagramMap,
): LogicFlowDocument {
  if (!hasV2Pages(diagramMap))
    return normalizeLogicFlowData(legacySnapshot(diagramMap)).document;
  return normalizeLogicFlowData(v2Snapshot(diagramMap)).document;
}

export function seedLogicFlowDocument(
  diagramMap: LogicFlowDiagramMap,
  snapshot: unknown,
  origin: unknown = LOCAL_ORIGIN,
): boolean {
  if (diagramMap.size !== 0) {
    migrateLogicFlowDiagramMap(diagramMap);
    return false;
  }
  const document = normalizeLogicFlowData(snapshot).document;
  let seeded = false;
  runTransaction(diagramMap, origin, () => {
    if (diagramMap.size !== 0) return;
    writeDocument(diagramMap, document);
    seeded = true;
  });
  return seeded;
}

export function replaceLogicFlowDocument(
  diagramMap: LogicFlowDiagramMap,
  snapshot: unknown,
  origin: unknown = LOCAL_ORIGIN,
): LogicFlowDocument {
  const document = normalizeLogicFlowData(snapshot).document;
  runTransaction(diagramMap, origin, () => writeDocument(diagramMap, document));
  return document;
}

export const importLogicFlowDocument = replaceLogicFlowDocument;
export const syncLogicFlowDocument = replaceLogicFlowDocument;

export function readLogicFlowDiagram(
  diagrams: LogicFlowDiagramsMap,
  diagramId: string,
): LogicFlowDocument {
  const diagramMap = getDiagramMap(diagrams, diagramId);
  return diagramMap
    ? readLogicFlowDocument(diagramMap)
    : normalizeLogicFlowData(null).document;
}

export function seedLogicFlowDiagram(
  diagrams: LogicFlowDiagramsMap,
  diagramId: string,
  snapshot: unknown,
  origin: unknown = LOCAL_ORIGIN,
): boolean {
  const map = getOrCreateDiagramMap(diagrams, diagramId, origin);
  return seedLogicFlowDocument(map, snapshot, origin);
}

export function replaceLogicFlowDiagram(
  diagrams: LogicFlowDiagramsMap,
  diagramId: string,
  snapshot: unknown,
  origin: unknown = LOCAL_ORIGIN,
): LogicFlowDocument {
  const map = getOrCreateDiagramMap(diagrams, diagramId, origin);
  return replaceLogicFlowDocument(map, snapshot, origin);
}

export const importLogicFlowDiagram = replaceLogicFlowDiagram;
