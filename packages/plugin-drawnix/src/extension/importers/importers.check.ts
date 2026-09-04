import { parseMarkdownOutline } from "./markdown";
import { parseMermaidMindmap } from "./mermaid";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const markdown = parseMarkdownOutline(
  `# Product\n## Research\n- Interviews\n- Metrics\n## Delivery\n- Launch`,
);
assert(markdown?.text === "Product", "Markdown heading should become root");
assert(
  markdown.children.length === 2,
  "Markdown headings should create root branches",
);
assert(
  markdown.children[0].children.length === 2,
  "Markdown list should nest below heading",
);

const mermaidMindmap = parseMermaidMindmap(
  `mindmap\n  root((Project))\n    Planning\n      Scope\n    Delivery`,
);
assert(mermaidMindmap?.text === "Project", "Mermaid mindmap root should parse");
assert(
  mermaidMindmap.children[0].children[0].text === "Scope",
  "Mermaid indentation should create hierarchy",
);

const flowchart = parseMermaidMindmap(
  `flowchart LR\n  A[Idea] --> B(Plan)\n  A --> C[Build]\n  B --> D[Review]`,
);
assert(flowchart?.text === "Idea", "Flowchart root label should parse");
assert(
  flowchart.children.length === 2,
  "Flowchart edges should create children",
);
assert(
  flowchart.children[0].children[0].text === "Review",
  "Flowchart descendants should parse",
);

console.log("drawnix importer checks passed");
