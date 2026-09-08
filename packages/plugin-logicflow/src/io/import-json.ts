import { normalizeLogicFlowData } from "../model/normalize";
import type { LogicFlowDocument } from "../model/types";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export async function readLogicFlowJsonFile(file: File): Promise<{
  document: LogicFlowDocument;
  warnings: string[];
}> {
  if (file.size > MAX_IMPORT_BYTES)
    throw new Error("LogicFlow JSON 文件不能超过 5 MB");
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("LogicFlow JSON 格式无效");
  }
  const normalized = normalizeLogicFlowData(parsed);
  const source =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  const hasGraph = Boolean(
    Array.isArray(source.pages) ||
    (source.graph && typeof source.graph === "object") ||
    Array.isArray(source.nodes) ||
    Array.isArray(source.edges),
  );
  if (!hasGraph) throw new Error("文件中没有 LogicFlow graph 数据");
  return { document: normalized.document, warnings: normalized.warnings };
}
