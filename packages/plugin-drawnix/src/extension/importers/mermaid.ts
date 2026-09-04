import type { ImportedMindmapNode } from "./markdown";

function stripShape(value: string): string {
  let text = value.trim().replace(/^\|[^|]*\|\s*/, "");
  const identifier = text.match(/^([A-Za-z0-9_.-]+)\s*(.*)$/);
  if (identifier && identifier[2]) text = identifier[2].trim();
  const wrappers: Array<[string, string]> = [
    ["((", "))"],
    ["[[", "]]"],
    ["{{", "}}"],
    ["[", "]"],
    ["(", ")"],
    ["{", "}"],
    ['"', '"'],
  ];
  for (const [start, end] of wrappers) {
    if (text.startsWith(start) && text.endsWith(end)) {
      text = text.slice(start.length, -end.length).trim();
      break;
    }
  }
  return text.replace(/<br\s*\/?\s*>/gi, "\n").trim();
}

function parseReference(value: string): { id: string; label: string } | null {
  const token = value.trim().replace(/^\|[^|]*\|\s*/, "");
  const match = token.match(/^([A-Za-z0-9_.-]+)\s*(.*)$/);
  if (!match) return null;
  return { id: match[1], label: stripShape(token) || match[1] };
}

function parseMindmap(source: string): ImportedMindmapNode | null {
  const lines = source.replace(/\t/g, "    ").split(/\r?\n/);
  const first = lines.findIndex((line) => /^\s*mindmap\s*$/i.test(line));
  const entries = lines
    .slice(first + 1)
    .map((line) => ({
      indent: line.match(/^\s*/)?.[0].length ?? 0,
      value: line.trim(),
    }))
    .filter(
      (entry) =>
        entry.value &&
        !entry.value.startsWith("%%") &&
        !entry.value.startsWith("::"),
    );
  if (entries.length === 0) return null;

  const root: ImportedMindmapNode = {
    text: stripShape(entries[0].value),
    children: [],
  };
  const stack: Array<{ indent: number; node: ImportedMindmapNode }> = [
    { indent: entries[0].indent, node: root },
  ];
  for (const entry of entries.slice(1)) {
    const node: ImportedMindmapNode = {
      text: stripShape(entry.value),
      children: [],
    };
    if (!node.text) continue;
    while (stack.length > 0 && stack[stack.length - 1].indent >= entry.indent)
      stack.pop();
    const parent = stack.at(-1)?.node ?? root;
    parent.children.push(node);
    stack.push({ indent: entry.indent, node });
  }
  return root.text ? root : null;
}

function parseFlowchart(source: string): ImportedMindmapNode | null {
  const labels = new Map<string, string>();
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const arrow = /\s*(?:-->|---|-.->|==>|--o|--x)\s*/;

  const register = (reference: { id: string; label: string }) => {
    if (!labels.has(reference.id) || reference.label !== reference.id) {
      labels.set(reference.id, reference.label);
    }
    if (!adjacency.has(reference.id)) adjacency.set(reference.id, []);
    if (!indegree.has(reference.id)) indegree.set(reference.id, 0);
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (
      !line ||
      /^(?:flowchart|graph)\b/i.test(line) ||
      /^(?:subgraph|end|classDef|style|linkStyle)\b/i.test(line) ||
      line.startsWith("%%")
    ) {
      continue;
    }
    const tokens = line.split(arrow);
    if (tokens.length === 1) {
      const reference = parseReference(tokens[0]);
      if (reference) register(reference);
      continue;
    }
    const references = tokens
      .map(parseReference)
      .filter((item): item is { id: string; label: string } => item !== null);
    references.forEach(register);
    for (let index = 0; index < references.length - 1; index += 1) {
      const sourceNode = references[index];
      const targetNode = references[index + 1];
      const targets = adjacency.get(sourceNode.id)!;
      if (!targets.includes(targetNode.id)) {
        targets.push(targetNode.id);
        indegree.set(targetNode.id, (indegree.get(targetNode.id) ?? 0) + 1);
      }
    }
  }

  if (labels.size === 0) return null;
  const roots = [...labels.keys()].filter(
    (id) => (indegree.get(id) ?? 0) === 0,
  );
  const rootId = roots[0] ?? labels.keys().next().value;
  if (!rootId) return null;
  const visited = new Set<string>();
  const build = (id: string): ImportedMindmapNode => {
    visited.add(id);
    return {
      text: labels.get(id) ?? id,
      children: (adjacency.get(id) ?? [])
        .filter((childId) => !visited.has(childId))
        .map(build),
    };
  };
  const root = build(rootId);
  for (const disconnected of labels.keys()) {
    if (!visited.has(disconnected)) root.children.push(build(disconnected));
  }
  return root;
}

export function parseMermaidMindmap(
  source: string,
): ImportedMindmapNode | null {
  if (/^\s*mindmap\s*$/im.test(source)) return parseMindmap(source);
  if (/^\s*(?:flowchart|graph)\b/im.test(source)) return parseFlowchart(source);
  return null;
}
