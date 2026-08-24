export interface TemplateCoverEditor {
  state: {
    doc: {
      firstChild: {
        type: { name: string };
        textContent: string;
        nodeSize: number;
      } | null;
      content: { size: number };
      textBetween: (
        from: number,
        to: number,
        blockSeparator?: string,
        leafText?: string,
      ) => string;
    };
  };
}

export const TEMPLATE_COVER_WIDTH = 800;
export const TEMPLATE_COVER_HEIGHT = 450;

const TEMPLATE_COVER_FONT =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';

const TEMPLATE_COVER_PALETTES = [
  ["#0F172A", "#2563EB"],
  ["#042F2E", "#0F766E"],
  ["#2E1065", "#9333EA"],
  ["#431407", "#EA580C"],
  ["#172554", "#4338CA"],
] as const;

const MIME_CANDIDATES = [
  { type: "image/webp", quality: 0.88 },
  { type: "image/jpeg", quality: 0.9 },
  { type: "image/png", quality: undefined },
] as const;

export interface TemplateCoverContent {
  title?: string;
  summary?: string;
}

export interface TemplateCoverFileOptions {
  fileNameSeed?: string;
  createCanvas?: () => HTMLCanvasElement;
  createFile?: (
    parts: BlobPart[],
    name: string,
    options?: FilePropertyBag,
  ) => File;
  now?: () => number;
}

export interface ResolveTemplateCoverInput {
  existingCover?: string[];
  title: string;
  summary: string;
  fileNameSeed?: string;
}

export interface ResolveTemplateCoverResult {
  cover: string[];
  source: "manual" | "generated" | "fallback";
  error?: unknown;
}

export interface ResolveTemplateCoverDependencies {
  uploadFile: (file: File) => Promise<{ name: string }>;
  createCoverFile?: (
    content: Required<TemplateCoverContent>,
    options?: TemplateCoverFileOptions,
  ) => Promise<File>;
}

export const getUploadedCoverNames = <T extends object>(
  files: T[],
  uploadedByFile: Map<T, string>,
): string[] =>
  files
    .map((file) => uploadedByFile.get(file))
    .filter((name): name is string => Boolean(name));

interface SegmenterLike {
  segment: (input: string) => Iterable<{ segment: string }>;
}

interface SegmenterConstructor {
  new (
    locales?: string | string[],
    options?: { granularity: "grapheme" },
  ): SegmenterLike;
}

const toGraphemes = (value: string): string[] => {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterConstructor })
    .Segmenter;
  if (!Segmenter) return Array.from(value);
  return Array.from(
    new Segmenter(undefined, { granularity: "grapheme" }).segment(value),
    (part) => part.segment,
  );
};

export const normalizeTemplateCoverText = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(
      /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g,
      "",
    )
    .replace(/[\s\u00A0]+/g, " ")
    .trim();

export const sanitizeTemplateCoverText = (
  value: unknown,
  maxGraphemes: number,
): string =>
  toGraphemes(normalizeTemplateCoverText(value))
    .slice(0, maxGraphemes)
    .join("");

export const readTemplateCoverContent = (
  editor: TemplateCoverEditor | null | undefined,
  fallbackTitle = "",
): TemplateCoverContent => {
  if (!editor) {
    return {
      title: normalizeTemplateCoverText(fallbackTitle),
      summary: "",
    };
  }

  const doc = editor.state.doc;
  const firstNode = doc.firstChild;
  const hasTitleNode = firstNode?.type.name === "title";
  const title = hasTitleNode ? firstNode.textContent : fallbackTitle;
  const bodyFrom = hasTitleNode ? firstNode.nodeSize : 0;
  const summary = doc.textBetween(bodyFrom, doc.content.size, "\n", " ");

  return {
    title: normalizeTemplateCoverText(title),
    summary: sanitizeTemplateCoverText(summary, 360),
  };
};

export const getTemplateCoverPaletteIndex = (title: string): number => {
  let hash = 0x811c9dc5;
  for (const character of title) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % TEMPLATE_COVER_PALETTES.length;
};

const isBreakOpportunity = (value: string): boolean =>
  /[\s\-–—/.,;:!?，。；：！？、]/u.test(value);

const findLastBreak = (graphemes: string[]): number => {
  for (let index = graphemes.length - 1; index >= 0; index--) {
    if (isBreakOpportunity(graphemes[index])) return index + 1;
  }
  return -1;
};

const fitEllipsis = (
  context: Pick<CanvasRenderingContext2D, "measureText">,
  value: string,
  maxWidth: number,
): string => {
  const ellipsis = "…";
  const graphemes = toGraphemes(value.trimEnd());
  while (
    graphemes.length > 0 &&
    context.measureText(`${graphemes.join("")}${ellipsis}`).width > maxWidth
  ) {
    graphemes.pop();
  }
  return `${graphemes.join("").trimEnd()}${ellipsis}`;
};

export const wrapAndEllipsize = (
  context: Pick<CanvasRenderingContext2D, "measureText">,
  value: string,
  maxWidth: number,
  maxLines: number,
): string[] => {
  if (!value || maxLines <= 0) return [];

  const graphemes = toGraphemes(value);
  const lines: string[] = [];
  let current: string[] = [];
  let lastBreak = -1;
  let index = 0;
  let truncated = false;

  while (index < graphemes.length) {
    const next = graphemes[index];
    const candidate = [...current, next].join("");

    if (
      current.length === 0 ||
      context.measureText(candidate).width <= maxWidth
    ) {
      current.push(next);
      if (isBreakOpportunity(next)) lastBreak = current.length;
      index++;
      continue;
    }

    if (lastBreak > 0) {
      const line = current.slice(0, lastBreak).join("").trim();
      lines.push(line || current.slice(0, lastBreak).join(""));
      current = current.slice(lastBreak);
      while (current[0] && /\s/u.test(current[0])) current.shift();
      lastBreak = findLastBreak(current);
    } else {
      lines.push(current.join("").trimEnd());
      current = [];
      lastBreak = -1;
    }

    if (lines.length === maxLines) {
      truncated = true;
      break;
    }
  }

  if (!truncated && current.length > 0) {
    if (lines.length < maxLines) {
      lines.push(current.join("").trim());
    } else {
      truncated = true;
    }
  }

  if (index < graphemes.length) truncated = true;
  if (truncated && lines.length > 0) {
    lines[lines.length - 1] = fitEllipsis(
      context,
      lines[lines.length - 1],
      maxWidth,
    );
  }

  return lines.filter(Boolean);
};

const drawDecorations = (context: CanvasRenderingContext2D) => {
  context.save();
  context.globalAlpha = 0.12;
  context.fillStyle = "#FFFFFF";
  context.beginPath();
  context.arc(740, 55, 170, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(690, 430, 220, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.globalAlpha = 0.18;
  context.strokeStyle = "#FFFFFF";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(710, 285, 115, 0, Math.PI * 2);
  context.stroke();
  context.restore();
};

export const drawTemplateCover = (
  context: CanvasRenderingContext2D,
  content: Required<TemplateCoverContent>,
) => {
  const title =
    sanitizeTemplateCoverText(content.title, 160) || "Untitled Template";
  const summary = sanitizeTemplateCoverText(content.summary, 360);
  const [gradientStart, gradientEnd] =
    TEMPLATE_COVER_PALETTES[getTemplateCoverPaletteIndex(title)];
  const gradient = context.createLinearGradient(
    0,
    0,
    TEMPLATE_COVER_WIDTH,
    TEMPLATE_COVER_HEIGHT,
  );
  gradient.addColorStop(0, gradientStart);
  gradient.addColorStop(1, gradientEnd);

  context.fillStyle = gradient;
  context.fillRect(0, 0, TEMPLATE_COVER_WIDTH, TEMPLATE_COVER_HEIGHT);
  drawDecorations(context);

  context.textBaseline = "top";
  context.fillStyle = "rgba(255, 255, 255, 0.78)";
  context.font = `700 14px ${TEMPLATE_COVER_FONT}`;
  context.fillText("KNOWLEDGE REPO · TEMPLATE", 56, 44);

  context.fillStyle = "#FFFFFF";
  context.font = `700 52px ${TEMPLATE_COVER_FONT}`;
  const titleLines = wrapAndEllipsize(context, title, 600, 2);
  titleLines.forEach((line, index) => {
    context.fillText(line, 56, 108 + index * 64);
  });

  if (summary) {
    context.fillStyle = "rgba(255, 255, 255, 0.78)";
    context.font = `400 24px ${TEMPLATE_COVER_FONT}`;
    const summaryTop = 108 + titleLines.length * 64 + 26;
    const summaryLines = wrapAndEllipsize(context, summary, 620, 3);
    summaryLines.forEach((line, index) => {
      context.fillText(line, 56, summaryTop + index * 38);
    });
  }

  context.fillStyle = "rgba(255, 255, 255, 0.62)";
  context.font = `600 13px ${TEMPLATE_COVER_FONT}`;
  context.fillText("KN", 56, 407);
};

const encodeCanvas = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

const extensionForMime = (mimeType: string): string => {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
};

const safeFileNameSeed = (value: string): string => {
  const cleaned = value
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "page";
};

export const createTemplateCoverFile = async (
  content: Required<TemplateCoverContent>,
  options: TemplateCoverFileOptions = {},
): Promise<File> => {
  const createCanvas =
    options.createCanvas ?? (() => document.createElement("canvas"));
  const createFile =
    options.createFile ??
    ((parts, name, fileOptions) => new File(parts, name, fileOptions));
  const now = options.now ?? Date.now;
  const canvas = createCanvas();
  canvas.width = TEMPLATE_COVER_WIDTH;
  canvas.height = TEMPLATE_COVER_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");

  drawTemplateCover(context, content);

  let blob: Blob | null = null;
  for (const candidate of MIME_CANDIDATES) {
    blob = await encodeCanvas(canvas, candidate.type, candidate.quality);
    if (blob) break;
  }
  if (!blob) throw new Error("Canvas could not be encoded");

  const mimeType = blob.type || "image/webp";
  const extension = extensionForMime(mimeType);
  const seed = safeFileNameSeed(options.fileNameSeed ?? "page");
  return createFile([blob], `template-cover-${seed}-${now()}.${extension}`, {
    type: mimeType,
    lastModified: now(),
  });
};

export const resolveTemplateCover = async (
  input: ResolveTemplateCoverInput,
  dependencies: ResolveTemplateCoverDependencies,
): Promise<ResolveTemplateCoverResult> => {
  const existingCover = (input.existingCover ?? []).filter(Boolean);
  if (existingCover.length > 0) {
    return { cover: existingCover, source: "manual" };
  }

  try {
    const createCoverFile =
      dependencies.createCoverFile ?? createTemplateCoverFile;
    const file = await createCoverFile(
      { title: input.title, summary: input.summary },
      { fileNameSeed: input.fileNameSeed },
    );
    const uploaded = await dependencies.uploadFile(file);
    if (!uploaded?.name)
      throw new Error("Cover upload returned no object name");
    return { cover: [uploaded.name], source: "generated" };
  } catch (error) {
    return { cover: [], source: "fallback", error };
  }
};
