export interface ImportedMindmapNode {
  text: string;
  children: ImportedMindmapNode[];
}

interface OutlineItem {
  depth: number;
  text: string;
}

function cleanText(value: string): string {
  return value
    .replace(/\s+#+\s*$/, "")
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/^__(.*)__$/, "$1")
    .trim();
}

export function parseMarkdownOutline(
  source: string,
): ImportedMindmapNode | null {
  const items: OutlineItem[] = [];
  let lastHeadingDepth = -1;

  for (const rawLine of source.replace(/\t/g, "    ").split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const heading = rawLine.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      lastHeadingDepth = heading[1].length - 1;
      items.push({ depth: lastHeadingDepth, text: cleanText(heading[2]) });
      continue;
    }

    const list = rawLine.match(/^(\s*)(?:[-+*]|\d+[.)])\s+(.+)$/);
    if (list) {
      const indentation = Math.floor(list[1].length / 2);
      items.push({
        depth: Math.max(0, lastHeadingDepth + 1) + indentation,
        text: cleanText(list[2]),
      });
      continue;
    }

    items.push({
      depth: Math.max(0, lastHeadingDepth + 1),
      text: cleanText(rawLine),
    });
  }

  const usable = items.filter((item) => item.text);
  if (usable.length === 0) return null;
  const minimumDepth = Math.min(...usable.map((item) => item.depth));
  usable.forEach((item) => {
    item.depth -= minimumDepth;
  });

  const root: ImportedMindmapNode = { text: usable[0].text, children: [] };
  const stack: Array<{ depth: number; node: ImportedMindmapNode }> = [
    { depth: usable[0].depth, node: root },
  ];

  for (const item of usable.slice(1)) {
    const node: ImportedMindmapNode = { text: item.text, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].depth >= item.depth)
      stack.pop();
    const parent = stack.at(-1)?.node ?? root;
    parent.children.push(node);
    stack.push({ depth: item.depth, node });
  }

  return root;
}
