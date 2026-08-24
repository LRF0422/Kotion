import {
  TEMPLATE_COVER_HEIGHT,
  TEMPLATE_COVER_WIDTH,
  createTemplateCoverFile,
  getTemplateCoverPaletteIndex,
  getUploadedCoverNames,
  readTemplateCoverContent,
  resolveTemplateCover,
  sanitizeTemplateCoverText,
  wrapAndEllipsize,
  type TemplateCoverEditor,
} from "./template-cover";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, extra?: unknown): void {
  if (condition) {
    pass++;
    console.log("  ok   " + name);
  } else {
    fail++;
    console.log(
      "  FAIL " +
        name +
        (extra !== undefined ? "  -> " + JSON.stringify(extra) : ""),
    );
  }
}

interface FakeCanvasResult {
  canvas: HTMLCanvasElement;
  requestedTypes: string[];
  fillTextCalls: string[];
}

const createFakeCanvas = (nullResponses = 0): FakeCanvasResult => {
  const requestedTypes: string[] = [];
  const fillTextCalls: string[] = [];
  let responseCount = 0;
  const gradient = { addColorStop: () => undefined };
  const context = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    textBaseline: "top",
    font: "",
    createLinearGradient: () => gradient,
    fillRect: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    measureText: (value: string) => ({ width: Array.from(value).length * 10 }),
    fillText: (value: string) => {
      fillTextCalls.push(value);
    },
  } as unknown as CanvasRenderingContext2D;

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: BlobCallback, type?: string) => {
      requestedTypes.push(type || "");
      responseCount++;
      callback(
        responseCount <= nullResponses
          ? null
          : new Blob(["image"], { type: type || "image/png" }),
      );
    },
  } as unknown as HTMLCanvasElement;

  return { canvas, requestedTypes, fillTextCalls };
};

const createFakeFile = (
  parts: BlobPart[],
  name: string,
  options?: FilePropertyBag,
): File =>
  ({
    name,
    type: options?.type || "",
    size: (parts[0] as Blob).size,
  }) as File;

async function main(): Promise<void> {
  console.log("\ntext normalization and layout");

  const cleaned = sanitizeTemplateCoverText("  A\u0000\n B\u200B  👩‍💻  ", 100);
  check(
    "control and zero-width characters are removed without breaking emoji",
    cleaned === "A B 👩‍💻",
    cleaned,
  );

  const measure = {
    measureText: (value: string) =>
      ({ width: Array.from(value).length * 10 }) as TextMetrics,
  };
  const wrapped = wrapAndEllipsize(
    measure,
    "项目复盘模板 contains a deliberately long summary",
    80,
    2,
  );
  check(
    "text is limited to the requested line count",
    wrapped.length === 2,
    wrapped,
  );
  check(
    "truncated text ends with an ellipsis",
    wrapped[1]?.endsWith("…") === true,
    wrapped,
  );

  const palette = getTemplateCoverPaletteIndex("项目复盘模板");
  check(
    "the same title always selects the same palette",
    palette === getTemplateCoverPaletteIndex("项目复盘模板"),
  );
  check(
    "the palette index stays in range",
    palette >= 0 && palette < 5,
    palette,
  );

  const firstFile = {};
  const secondFile = {};
  const uploadedNames = new Map([
    [firstFile, "first.webp"],
    [secondFile, "second.webp"],
  ]);
  check(
    "removing one selected file also removes its uploaded object name",
    getUploadedCoverNames([secondFile], uploadedNames).join(",") ===
      "second.webp",
  );

  console.log("\neditor content extraction");

  let bodyFrom = -1;
  const editor = {
    state: {
      doc: {
        firstChild: {
          type: { name: "title" },
          textContent: " 当前页面标题 ",
          nodeSize: 9,
        },
        content: { size: 40 },
        textBetween: (from: number) => {
          bodyFrom = from;
          return " 第一段\n第二段 ";
        },
      },
    },
  } as TemplateCoverEditor;
  const content = readTemplateCoverContent(editor, "fallback");
  check(
    "the title comes from the title node",
    content.title === "当前页面标题",
    content,
  );
  check("the body starts after the title node", bodyFrom === 9, bodyFrom);
  check(
    "the summary is normalized without repeating the title",
    content.summary === "第一段 第二段",
    content,
  );

  const longTitle = "长".repeat(200);
  if (editor.state.doc.firstChild)
    editor.state.doc.firstChild.textContent = longTitle;
  check(
    "content extraction does not truncate the template name",
    readTemplateCoverContent(editor).title === longTitle,
  );

  console.log("\ncanvas encoding");

  const fakeCanvas = createFakeCanvas(1);
  const encoded = await createTemplateCoverFile(
    { title: "项目复盘模板", summary: "目标、过程、结果与后续行动。" },
    {
      fileNameSeed: "page/42",
      createCanvas: () => fakeCanvas.canvas,
      createFile: createFakeFile,
      now: () => 1234,
    },
  );
  check(
    "the generated canvas uses the fixed 16:9 dimensions",
    fakeCanvas.canvas.width === TEMPLATE_COVER_WIDTH &&
      fakeCanvas.canvas.height === TEMPLATE_COVER_HEIGHT,
  );
  check(
    "encoding falls back from WebP to JPEG",
    fakeCanvas.requestedTypes.join(",") === "image/webp,image/jpeg",
    fakeCanvas.requestedTypes,
  );
  check(
    "the file extension follows the actual MIME type",
    encoded.name === "template-cover-page-42-1234.jpg",
    encoded.name,
  );
  check(
    "the cover includes brand, title and summary text",
    fakeCanvas.fillTextCalls.includes("KNOWLEDGE REPO · TEMPLATE") &&
      fakeCanvas.fillTextCalls.includes("项目复盘模板") &&
      fakeCanvas.fillTextCalls.includes("目标、过程、结果与后续行动。"),
    fakeCanvas.fillTextCalls,
  );

  const failedCanvas = createFakeCanvas(3);
  let encodingFailed = false;
  try {
    await createTemplateCoverFile(
      { title: "Title", summary: "Summary" },
      { createCanvas: () => failedCanvas.canvas, createFile: createFakeFile },
    );
  } catch {
    encodingFailed = true;
  }
  check("all null toBlob responses produce a generation error", encodingFailed);
  check(
    "WebP, JPEG and PNG are all attempted before failing",
    failedCanvas.requestedTypes.join(",") === "image/webp,image/jpeg,image/png",
    failedCanvas.requestedTypes,
  );

  console.log("\ncover resolution");

  let createCalls = 0;
  let uploadCalls = 0;
  const manual = await resolveTemplateCover(
    {
      existingCover: ["manual/object.webp"],
      title: "Title",
      summary: "Summary",
    },
    {
      createCoverFile: async () => {
        createCalls++;
        return createFakeFile([new Blob(["image"])], "unused.webp", {
          type: "image/webp",
        });
      },
      uploadFile: async () => {
        uploadCalls++;
        return { name: "unused" };
      },
    },
  );
  check(
    "a manual cover is preserved unchanged",
    manual.source === "manual" && manual.cover[0] === "manual/object.webp",
    manual,
  );
  check(
    "a manual cover skips generation and upload",
    createCalls === 0 && uploadCalls === 0,
    { createCalls, uploadCalls },
  );

  const generated = await resolveTemplateCover(
    { title: "Title", summary: "Summary", fileNameSeed: "42" },
    {
      createCoverFile: async () =>
        createFakeFile([new Blob(["image"])], "generated.webp", {
          type: "image/webp",
        }),
      uploadFile: async () => {
        uploadCalls++;
        return { name: "templates/generated-cover.webp" };
      },
    },
  );
  check(
    "an automatically uploaded cover stores the stable object name",
    generated.source === "generated" &&
      generated.cover[0] === "templates/generated-cover.webp",
    generated,
  );

  const fallback = await resolveTemplateCover(
    { title: "Title", summary: "Summary" },
    {
      createCoverFile: async () => {
        throw new Error("canvas unavailable");
      },
      uploadFile: async () => ({ name: "unused" }),
    },
  );
  check(
    "generation failure falls back without throwing",
    fallback.source === "fallback" &&
      fallback.cover.length === 0 &&
      fallback.error instanceof Error,
    fallback,
  );

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
