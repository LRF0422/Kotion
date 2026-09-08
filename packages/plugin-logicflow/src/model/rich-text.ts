import {
  LOGICFLOW_LIMITS,
  type JSONContent,
  type JSONMark,
  type JsonValue,
  type RichCardContent,
} from "./types";

const BLOCK_NODES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
]);
const INLINE_NODES = new Set(["text", "hardBreak"]);
const ALLOWED_ALIGNMENTS = new Set(["left", "center", "right", "justify"]);
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const hasControlCharacters = (value: string): boolean =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
const SAFE_COLOR =
  /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+-]+\)|[a-z]{1,32})$/i;
const SAFE_FONT_SIZE =
  /^(?:\d+(?:\.\d+)?(?:px|rem|em|%)|(?:xx-small|x-small|small|medium|large|x-large|xx-large))$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createEmptyRichTextDocument(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function isAllowedLinkHref(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const href = value.trim();
  if (!href || hasControlCharacters(href)) return false;
  if (
    href.startsWith("#") ||
    href.startsWith("/") ||
    href.startsWith("./") ||
    href.startsWith("../")
  ) {
    return !href.startsWith("//");
  }
  try {
    return ALLOWED_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

function sanitizeTextStyleAttrs(
  value: unknown,
): Record<string, JsonValue> | undefined {
  if (!isRecord(value)) return undefined;
  const attrs: Record<string, JsonValue> = {};
  if (
    typeof value.fontSize === "string" &&
    SAFE_FONT_SIZE.test(value.fontSize.trim())
  ) {
    attrs.fontSize = value.fontSize.trim();
  }
  if (typeof value.color === "string" && SAFE_COLOR.test(value.color.trim())) {
    attrs.color = value.color.trim();
  }
  return Object.keys(attrs).length ? attrs : undefined;
}

function sanitizeMark(value: unknown): JSONMark | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "bold" || value.type === "italic") {
    return { type: value.type };
  }
  if (value.type === "link") {
    if (!isRecord(value.attrs) || !isAllowedLinkHref(value.attrs.href)) {
      return undefined;
    }
    const attrs: Record<string, JsonValue> = {
      href: value.attrs.href.trim(),
    };
    if (value.attrs.target === "_blank" || value.attrs.target === "_self") {
      attrs.target = value.attrs.target;
    }
    if (typeof value.attrs.title === "string") {
      attrs.title = value.attrs.title.slice(0, 500);
    }
    if (value.attrs.target === "_blank") attrs.rel = "noopener noreferrer";
    return { type: "link", attrs };
  }
  if (value.type === "textStyle") {
    const attrs = sanitizeTextStyleAttrs(value.attrs);
    return attrs ? { type: "textStyle", attrs } : undefined;
  }
  if (value.type === "fontSize" && isRecord(value.attrs)) {
    const attrs = sanitizeTextStyleAttrs({ fontSize: value.attrs.fontSize });
    return attrs ? { type: "fontSize", attrs } : undefined;
  }
  if (value.type === "color" && isRecord(value.attrs)) {
    const attrs = sanitizeTextStyleAttrs({ color: value.attrs.color });
    return attrs ? { type: "color", attrs } : undefined;
  }
  return undefined;
}

function allowedChild(parent: string, child: string): boolean {
  if (parent === "doc") return BLOCK_NODES.has(child) && child !== "listItem";
  if (parent === "paragraph" || parent === "heading") {
    return INLINE_NODES.has(child);
  }
  if (parent === "bulletList" || parent === "orderedList") {
    return child === "listItem";
  }
  if (parent === "listItem") {
    return (
      child === "paragraph" ||
      child === "heading" ||
      child === "bulletList" ||
      child === "orderedList"
    );
  }
  return false;
}

function sanitizeNodeAttrs(
  type: string,
  value: unknown,
): Record<string, JsonValue> | undefined {
  if (!isRecord(value)) return undefined;
  const attrs: Record<string, JsonValue> = {};
  if (type === "heading") {
    const level = typeof value.level === "number" ? Math.trunc(value.level) : 1;
    attrs.level = Math.max(1, Math.min(6, level));
  }
  if (
    (type === "paragraph" || type === "heading") &&
    typeof value.textAlign === "string" &&
    ALLOWED_ALIGNMENTS.has(value.textAlign)
  ) {
    attrs.textAlign = value.textAlign;
  }
  if (
    type === "orderedList" &&
    typeof value.start === "number" &&
    Number.isFinite(value.start)
  ) {
    attrs.start = Math.max(1, Math.min(1_000_000, Math.trunc(value.start)));
  }
  return Object.keys(attrs).length ? attrs : undefined;
}

function sanitizeNode(
  value: unknown,
  parent: string,
  budget: { remaining: number },
): JSONContent | undefined {
  if (
    !isRecord(value) ||
    budget.remaining <= 0 ||
    typeof value.type !== "string"
  ) {
    return undefined;
  }
  const type = value.type;
  if (!allowedChild(parent, type)) return undefined;
  budget.remaining -= 1;

  if (type === "text") {
    if (typeof value.text !== "string") return undefined;
    const marks = Array.isArray(value.marks)
      ? value.marks
          .map(sanitizeMark)
          .filter((mark): mark is JSONMark => mark !== undefined)
      : [];
    return {
      type: "text",
      text: value.text.slice(0, LOGICFLOW_LIMITS.maxTextLength),
      ...(marks.length ? { marks } : {}),
    };
  }
  if (type === "hardBreak") return { type: "hardBreak" };

  const attrs = sanitizeNodeAttrs(type, value.attrs);
  const content = Array.isArray(value.content)
    ? value.content
        .map((child) => sanitizeNode(child, type, budget))
        .filter((child): child is JSONContent => child !== undefined)
    : [];
  const node: JSONContent = {
    type,
    ...(attrs ? { attrs } : {}),
    ...(content.length ? { content } : {}),
  };
  if (type === "heading" && !node.attrs) node.attrs = { level: 1 };
  if ((type === "bulletList" || type === "orderedList") && !content.length) {
    return undefined;
  }
  if (type === "listItem" && !content.length) return undefined;
  return node;
}

export function sanitizeJSONContent(value: unknown): JSONContent {
  const budget = { remaining: LOGICFLOW_LIMITS.maxRichTextNodes };
  const input =
    isRecord(value) && value.type === "doc"
      ? value
      : { type: "doc", content: Array.isArray(value) ? value : [value] };
  const content = Array.isArray(input.content)
    ? input.content
        .map((child) => sanitizeNode(child, "doc", budget))
        .filter((child): child is JSONContent => child !== undefined)
    : [];
  return {
    type: "doc",
    content: content.length ? content : [{ type: "paragraph" }],
  };
}

export const sanitizeRichText = sanitizeJSONContent;

export function sanitizeRichCardContent(value: unknown): RichCardContent {
  const source = isRecord(value) ? value : {};
  return {
    title: sanitizeJSONContent(source.title),
    body: sanitizeJSONContent(source.body),
  };
}
