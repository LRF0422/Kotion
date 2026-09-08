import type { LogicFlowDocument, Page } from "../model/types";
import { renderPageSnapshot } from "./render-export";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Unable to read export image"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export interface PdfExportOptions {
  filename?: string;
  dark?: boolean;
  backgroundColor?: string;
  margin?: number;
  onProgress?: (completed: number, total: number, page: Page) => void;
  signal?: AbortSignal;
}

export async function exportDocumentPdf(
  document: LogicFlowDocument,
  options: PdfExportOptions = {},
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const margin = options.margin ?? 10;
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.setProperties({ title: document.title });
  for (let index = 0; index < document.pages.length; index += 1) {
    if (options.signal?.aborted)
      throw new DOMException("Export cancelled", "AbortError");
    const page = document.pages[index];
    if (index > 0) pdf.addPage("a4", "landscape");
    const snapshot = await renderPageSnapshot(page, {
      type: "png",
      dark: options.dark,
      backgroundColor:
        options.backgroundColor ?? (options.dark ? "#0f172a" : "#ffffff"),
      padding: 32,
      scale: 2,
    });
    const image = await blobToDataUrl(snapshot.blob);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const headerHeight = 8;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2 - headerHeight;
    const ratio = Math.min(
      maxWidth / Math.max(1, snapshot.width),
      maxHeight / Math.max(1, snapshot.height),
    );
    const width = Math.max(1, snapshot.width * ratio);
    const height = Math.max(1, snapshot.height * ratio);
    pdf.setFontSize(10);
    pdf.setTextColor(options.dark ? 230 : 30);
    pdf.text(page.name, margin, margin + 3);
    pdf.addImage(
      image,
      "PNG",
      margin + (maxWidth - width) / 2,
      margin + headerHeight + (maxHeight - height) / 2,
      width,
      height,
      undefined,
      "FAST",
    );
    options.onProgress?.(index + 1, document.pages.length, page);
  }
  pdf.save(options.filename ?? `${document.title || "logicflow-diagram"}.pdf`);
}
