import type { LogicFlowGraphData, LogicFlowNodeData } from "../model/types";
import {
  getContainerChildren,
  getContainerMetadata,
  getContainerParent,
  getContainerZone,
} from "./metadata";
import { containerRegistry } from "./registry";
import type { ContainerDefinition, ContainerOperation } from "./types";

export interface ContainerInstance {
  definition: ContainerDefinition;
  root: LogicFlowNodeData;
}

export class ContainerGraphIndex {
  readonly nodeById: Map<string, LogicFlowNodeData>;
  private readonly instances = new Map<string, ContainerInstance>();
  private readonly childrenByRoot = new Map<string, string[]>();
  private readonly parentByChild = new Map<string, string>();
  private readonly zoneByChild = new Map<string, string>();

  constructor(graph: Pick<LogicFlowGraphData, "nodes">) {
    this.nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const node of graph.nodes) {
      const metadata = getContainerMetadata(node);
      const definition =
        (metadata && containerRegistry.getById(metadata.definitionId)) ??
        containerRegistry.getByRootType(node.type);
      if (!definition) continue;
      this.instances.set(node.id, { definition, root: node });
      const children = getContainerChildren(node).filter(
        (id) => id !== node.id && this.nodeById.has(id),
      );
      this.childrenByRoot.set(node.id, children);
      for (const childId of children) {
        if (!this.parentByChild.has(childId)) {
          this.parentByChild.set(childId, node.id);
        }
      }
    }
    for (const node of graph.nodes) {
      const parent = getContainerParent(node);
      if (
        parent &&
        this.instances.has(parent) &&
        !this.parentByChild.has(node.id)
      ) {
        this.parentByChild.set(node.id, parent);
      }
      const zone = getContainerZone(node);
      if (zone) this.zoneByChild.set(node.id, zone);
    }
  }

  instanceForRoot(id: string): ContainerInstance | undefined {
    return this.instances.get(id);
  }

  parentFor(id: string): LogicFlowNodeData | undefined {
    const parentId = this.parentByChild.get(id);
    return parentId ? this.nodeById.get(parentId) : undefined;
  }

  directChildren(rootId: string): LogicFlowNodeData[] {
    return (this.childrenByRoot.get(rootId) ?? []).flatMap((id) => {
      const node = this.nodeById.get(id);
      return node ? [node] : [];
    });
  }

  descendants(rootId: string): LogicFlowNodeData[] {
    const result: LogicFlowNodeData[] = [];
    const visited = new Set<string>([rootId]);
    const queue = [...(this.childrenByRoot.get(rootId) ?? [])];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = this.nodeById.get(id);
      if (!node) continue;
      result.push(node);
      queue.push(...(this.childrenByRoot.get(id) ?? []));
    }
    return result;
  }

  zoneFor(id: string): string | undefined {
    return this.zoneByChild.get(id);
  }

  expandRoots(ids: readonly string[], operation: ContainerOperation): string[] {
    const result = new Set<string>();
    for (const id of ids) {
      result.add(id);
      const instance = this.instances.get(id);
      if (!instance) continue;
      const policy = instance.definition.operations[operation] ?? "root-only";
      if (policy === "deny") {
        result.delete(id);
        continue;
      }
      if (policy === "root-and-descendants") {
        this.descendants(id).forEach((node) => result.add(node.id));
      }
    }
    return [...result];
  }

  wouldCreateCycle(rootId: string, childId: string): boolean {
    if (rootId === childId) return true;
    return this.descendants(childId).some((node) => node.id === rootId);
  }
}

export function buildContainerIndex(
  graph: Pick<LogicFlowGraphData, "nodes">,
): ContainerGraphIndex {
  return new ContainerGraphIndex(graph);
}
