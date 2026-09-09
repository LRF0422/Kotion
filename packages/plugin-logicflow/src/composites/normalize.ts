import type { JsonValue, LogicFlowNodeData } from "../model/types";
import { createContainer } from "./factory";
import { allocateContainerId } from "./ids";
import {
  getContainerChildren,
  getContainerMetadata,
  getContainerParent,
  getContainerZone,
  withContainerMetadata,
  withContainerParent,
  withoutContainerParent,
} from "./metadata";
import { containerRegistry } from "./registry";
import { resolveContainerZone } from "./helpers";

function record(value: unknown): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function finiteDimension(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function extras(node: LogicFlowNodeData, preserveRotation: boolean) {
  return Object.fromEntries(
    Object.entries(node).filter(
      ([key]) =>
        ![
          "id",
          "type",
          "x",
          "y",
          "text",
          "properties",
          "width",
          "height",
          "children",
          ...(preserveRotation ? [] : ["rotate"]),
        ].includes(key),
    ),
  ) as Record<string, JsonValue>;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function wouldCreateCycle(
  rootId: string,
  childId: string,
  childrenByRoot: ReadonlyMap<string, string[]>,
): boolean {
  if (rootId === childId) return true;
  const visited = new Set<string>();
  const queue = [childId];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === rootId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...(childrenByRoot.get(id) ?? []));
  }
  return false;
}

export function normalizeContainerNodes(
  nodes: LogicFlowNodeData[],
  maxNodes: number,
  warnings: string[] = [],
): { nodes: LogicFlowNodeData[]; migrated: boolean } {
  const originalById = new Map(nodes.map((node) => [node.id, node]));
  const usedIds = new Set(nodes.map((node) => node.id));
  const consumed = new Set<string>();
  const output: LogicFlowNodeData[] = [];
  let seedCapacity = Math.max(0, maxNodes - nodes.length);
  let changed = false;

  for (const node of nodes) {
    if (consumed.has(node.id)) continue;
    let migrated = false;
    for (const definition of containerRegistry.getAll()) {
      const adapter = definition.legacyMigrations?.find((item) =>
        item.matches(node),
      );
      if (!adapter) continue;
      const result = adapter.migrate(node, originalById);
      result.consumeIds?.forEach((id) => consumed.add(id));
      const seeds = result.seeds.slice(0, seedCapacity);
      if (seeds.length < result.seeds.length) {
        warnings.push(`容器 ${node.id} 的初始子节点超过节点上限，已截断`);
      }
      seedCapacity -= seeds.length;
      const properties = record(node.properties);
      const materialized = createContainer(definition, {
        id: node.id,
        x: node.x,
        y: node.y,
        width: finiteDimension(
          node.width,
          finiteDimension(properties.width, definition.defaultSize.width),
        ),
        height: finiteDimension(
          node.height,
          finiteDimension(properties.height, definition.defaultSize.height),
        ),
        properties,
        extras: extras(node, definition.capabilities.rotatable),
        seeds,
        usedIds,
      });
      if (
        !definition.capabilities.rotatable &&
        typeof node.rotate === "number" &&
        node.rotate !== 0
      ) {
        warnings.push(`容器 ${node.id} 不支持旋转，已重置为 0`);
      }
      output.push(materialized.root, ...materialized.children);
      changed = true;
      migrated = true;
      break;
    }
    if (migrated) continue;

    const definition = containerRegistry.getByRootType(node.type);
    const metadata = getContainerMetadata(node);
    if (definition && !metadata) {
      const seeds = (definition.initialSeeds ?? []).slice(0, seedCapacity);
      seedCapacity -= seeds.length;
      const properties = record(node.properties);
      const materialized = createContainer(definition, {
        id: node.id,
        x: node.x,
        y: node.y,
        width: finiteDimension(
          node.width,
          finiteDimension(properties.width, definition.defaultSize.width),
        ),
        height: finiteDimension(
          node.height,
          finiteDimension(properties.height, definition.defaultSize.height),
        ),
        properties,
        extras: extras(node, definition.capabilities.rotatable),
        seeds,
        usedIds,
      });
      output.push(materialized.root, ...materialized.children);
      changed = true;
      continue;
    }
    output.push(node);
  }

  const filtered = output.filter((node) => !consumed.has(node.id));
  const byId = new Map(filtered.map((node) => [node.id, node]));
  const childrenByRoot = new Map<string, string[]>();
  const ownerByChild = new Map<string, string>();
  const futureRoots = new Set<string>();

  for (const root of filtered) {
    const metadata = getContainerMetadata(root);
    const definition =
      (metadata && containerRegistry.getById(metadata.definitionId)) ??
      containerRegistry.getByRootType(root.type);
    if (!definition || !metadata) continue;
    if (metadata.version > definition.version) {
      warnings.push(`容器 ${root.id} 使用了更高版本，已保留原数据`);
      const children = getContainerChildren(root).filter((id) => byId.has(id));
      childrenByRoot.set(root.id, children);
      children.forEach((id) => ownerByChild.set(id, root.id));
      futureRoots.add(root.id);
      continue;
    }
    let current = root;
    let version = metadata.version;
    while (version < definition.version) {
      const migration = definition.versionMigrations?.find(
        (item) => item.from === version && item.to === version + 1,
      );
      if (!migration) break;
      current = migration.migrate(current);
      version += 1;
      changed = true;
    }
    if (current !== root) {
      Object.assign(root, current);
    }
    const children: string[] = [];
    for (const childId of getContainerChildren(root)) {
      if (
        !byId.has(childId) ||
        childId === root.id ||
        children.includes(childId)
      ) {
        changed = true;
        continue;
      }
      if (ownerByChild.has(childId)) {
        changed = true;
        warnings.push(`节点 ${childId} 被多个容器引用，已保留首个父容器`);
        continue;
      }
      children.push(childId);
      ownerByChild.set(childId, root.id);
    }
    childrenByRoot.set(root.id, children);
  }

  for (const [rootId, children] of childrenByRoot) {
    if (futureRoots.has(rootId)) continue;
    const root = byId.get(rootId)!;
    const metadata = getContainerMetadata(root)!;
    const definition = containerRegistry.getById(metadata.definitionId)!;
    const validChildren = children.filter((childId) => {
      if (wouldCreateCycle(rootId, childId, childrenByRoot)) {
        changed = true;
        warnings.push(`容器 ${rootId} 的循环引用已移除`);
        ownerByChild.delete(childId);
        return false;
      }
      return true;
    });
    if (!sameIds(validChildren, getContainerChildren(root))) changed = true;
    root.properties = withContainerMetadata(
      root.properties,
      {
        definitionId: definition.id,
        version: definition.version,
        scaleChildren: definition.capabilities.scaleChildren,
      },
      validChildren,
    );
    for (const childId of validChildren) {
      const child = byId.get(childId)!;
      const zone = resolveContainerZone(definition, root, child);
      const zoneId = zone?.id;
      if (
        getContainerParent(child) !== rootId ||
        getContainerZone(child) !== zoneId
      ) {
        changed = true;
      }
      child.properties = withContainerParent(child.properties, rootId, zoneId);
    }
  }

  for (const node of filtered) {
    const parent = getContainerParent(node);
    if (parent && ownerByChild.get(node.id) !== parent) {
      node.properties = withoutContainerParent(node.properties);
      changed = true;
    }
  }

  const deduped: LogicFlowNodeData[] = [];
  const seen = new Set<string>();
  for (const node of filtered) {
    if (seen.has(node.id)) {
      changed = true;
      continue;
    }
    seen.add(node.id);
    deduped.push(node);
  }
  return { nodes: deduped.slice(0, maxNodes), migrated: changed };
}
