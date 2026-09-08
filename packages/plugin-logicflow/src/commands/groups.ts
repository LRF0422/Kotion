import type { Page } from "../model/types";

export function groupNodes(
  page: Page,
  groupId: string,
  nodeIds: readonly string[],
  name?: string,
): Page {
  const existingNodes = new Set(page.graph.nodes.map((node) => node.id));
  const selected = [...new Set(nodeIds)].filter((id) => existingNodes.has(id));
  if (selected.length < 2) return page;
  const selectedSet = new Set(selected);
  const groups = page.groups
    .map((group) => ({
      ...group,
      nodeIds: group.nodeIds.filter((id) => !selectedSet.has(id)),
    }))
    .filter((group) => group.nodeIds.length > 1);
  groups.push({ id: groupId, ...(name ? { name } : {}), nodeIds: selected });
  return { ...page, groups };
}

export function ungroupNodes(page: Page, nodeIds: readonly string[]): Page {
  const selected = new Set(nodeIds);
  const groups = page.groups
    .map((group) => ({
      ...group,
      nodeIds: group.nodeIds.filter((id) => !selected.has(id)),
    }))
    .filter((group) => group.nodeIds.length > 1);
  return { ...page, groups };
}

export function expandGroupedSelection(
  page: Page,
  nodeIds: readonly string[],
): string[] {
  const expanded = new Set(nodeIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of page.groups) {
      if (!group.nodeIds.some((id) => expanded.has(id))) continue;
      for (const id of group.nodeIds) {
        if (!expanded.has(id)) {
          expanded.add(id);
          changed = true;
        }
      }
    }
  }
  return [...expanded];
}
