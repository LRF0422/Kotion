import type { JSONContent, RichCardContent } from "../model/types";
import {
  createEmptyRichTextDocument,
  sanitizeRichCardContent as sanitizeModelRichCardContent,
} from "../model/rich-text";

export type RichCardLineKind = "title" | "body" | "bullet" | "number";

export interface RichCardSvgLine {
  text: string;
  kind: RichCardLineKind;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: number;
  marker?: string;
}

export function createDefaultRichCardContent(): RichCardContent {
  return {
    title: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Card title" }],
        },
      ],
    },
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Add details" }],
        },
      ],
    },
  };
}

export function sanitizeRichCardContent(value: unknown): RichCardContent {
  return sanitizeModelRichCardContent(value);
}

export function jsonContentToPlainText(
  content: JSONContent | undefined,
): string {
  if (!content) return "";
  if (content.type === "text") return content.text ?? "";
  if (content.type === "hardBreak") return "\n";
  const childText = (content.content ?? [])
    .map((child) => jsonContentToPlainText(child))
    .join("");
  if (
    content.type === "paragraph" ||
    content.type === "heading" ||
    content.type === "listItem"
  ) {
    return `${childText}\n`;
  }
  return childText;
}

export function richCardToPlainText(value: unknown): string {
  const content = sanitizeRichCardContent(value);
  return [
    jsonContentToPlainText(content.title),
    jsonContentToPlainText(content.body),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function richCardSearchText(value: unknown): string {
  return richCardToPlainText(value).toLocaleLowerCase();
}

type LogicalLine = {
  text: string;
  kind: RichCardLineKind;
  marker?: string;
};

function collectLines(
  node: JSONContent,
  output: LogicalLine[],
  kind: RichCardLineKind,
  listIndex?: number,
): void {
  if (node.type === "bulletList" || node.type === "orderedList") {
    (node.content ?? []).forEach((child, index) =>
      collectLines(
        child,
        output,
        node.type === "orderedList" ? "number" : "bullet",
        index + (typeof node.attrs?.start === "number" ? node.attrs.start : 1),
      ),
    );
    return;
  }
  if (node.type === "listItem") {
    const text = jsonContentToPlainText(node).replace(/\s+/g, " ").trim();
    if (text)
      output.push({
        text,
        kind,
        marker: kind === "number" ? `${listIndex ?? 1}.` : "•",
      });
    return;
  }
  if (node.type === "paragraph" || node.type === "heading") {
    const text = jsonContentToPlainText(node).replace(/\s+/g, " ").trim();
    if (text) output.push({ text, kind });
    return;
  }
  (node.content ?? []).forEach((child) =>
    collectLines(child, output, kind, listIndex),
  );
}

function wrapLine(line: LogicalLine, maxCharacters: number): LogicalLine[] {
  const words = line.text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const result: LogicalLine[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || !current) {
      current = candidate;
      continue;
    }
    result.push({ ...line, text: current });
    current = word;
  }
  if (current) result.push({ ...line, text: current });
  return result.map((item, index) => ({
    ...item,
    marker: index === 0 ? item.marker : undefined,
  }));
}

export function layoutRichCardSvgLines(
  value: unknown,
  width: number,
  height: number,
): RichCardSvgLine[] {
  const content = sanitizeRichCardContent(value);
  const title: LogicalLine[] = [];
  const body: LogicalLine[] = [];
  collectLines(content.title, title, "title");
  collectLines(content.body, body, "body");
  const horizontalPadding = Math.max(12, Math.min(20, width * 0.08));
  const titleSize = Math.max(13, Math.min(18, width / 14));
  const bodySize = Math.max(10, Math.min(13, width / 19));
  const maxTitleChars = Math.max(
    8,
    Math.floor((width - horizontalPadding * 2) / (titleSize * 0.58)),
  );
  const maxBodyChars = Math.max(
    10,
    Math.floor((width - horizontalPadding * 2 - 12) / (bodySize * 0.55)),
  );
  const titleLines = title
    .flatMap((line) => wrapLine(line, maxTitleChars))
    .slice(0, 2);
  const bodyLines = body.flatMap((line) => wrapLine(line, maxBodyChars));
  const output: RichCardSvgLine[] = [];
  let y = horizontalPadding + titleSize / 2;
  for (const line of titleLines) {
    output.push({
      ...line,
      x: horizontalPadding,
      y,
      fontSize: titleSize,
      fontWeight: 700,
    });
    y += titleSize * 1.25;
  }
  y += titleLines.length ? 9 : 0;
  for (const line of bodyLines) {
    if (y + bodySize > height - horizontalPadding) break;
    output.push({
      ...line,
      x: horizontalPadding + (line.marker ? 13 : 0),
      y,
      fontSize: bodySize,
      fontWeight: 400,
    });
    y += bodySize * 1.45;
  }
  return output;
}

export function emptyRichCardContent(): RichCardContent {
  return {
    title: createEmptyRichTextDocument(),
    body: createEmptyRichTextDocument(),
  };
}
