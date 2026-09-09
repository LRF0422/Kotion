import type { LogicFlowGraphData } from "../model/types";
import {
  getContainerChildren,
  getContainerMetadata,
  getContainerParent,
  withContainerMetadata,
  withoutContainerParent,
} from "./metadata";

export function removeContainerReferences(
  graph: LogicFlowGraphData,
  deletedIds: ReadonlySet<string>,
): LogicFlowGraphData {
  return {
    ...graph,
    nodes: graph.nodes
      .filter((node) => !deletedIds.has(node.id))
      .map((node) => {
        const metadata = getContainerMetadata(node);
        if (metadata) {
          return {
            ...node,
            properties: withContainerMetadata(
              node.properties,
              metadata,
              getContainerChildren(node).filter((id) => !deletedIds.has(id)),
            ),
          };
        }
        const parent = getContainerParent(node);
        return parent && deletedIds.has(parent)
          ? { ...node, properties: withoutContainerParent(node.properties) }
          : node;
      }),
  };
}
