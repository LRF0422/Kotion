/**
 * 落地页文案外置：从后端 CMS 读取文案并合并进 i18n。
 *
 * - 资源键与 i18n 的 translation 键一致，例如 "home.hero-cta-primary"；
 * - 合并采用覆盖语义（deep + overwrite），未覆盖的键继续使用内置 resources.ts；
 * - 预览模式（`?kn_preview=`）下改读草稿，便于发布前校验；
 * - 请求超时或失败时静默回退，绝不阻塞首屏。
 */
import { i18n } from "@kn/common";
import { getPreviewToken } from "./preview";

const CONTENT_ENDPOINT = "/api/knowledge-system/ops/content";
const PREVIEW_CONTENT_ENDPOINT = "/api/knowledge-system/ops/preview/content";
const TIMEOUT_MS = 2000;

export interface RemoteCopyResult {
  locale: string;
  applied: number;
}

function flattenEntries(entries: unknown): Record<string, string> {
  const flat: Record<string, string> = {};
  if (!entries || typeof entries !== "object") return flat;
  for (const value of Object.values(entries as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
      if (typeof text === "string") flat[key] = text;
    }
  }
  return flat;
}

/**
 * 拉取某语言的文案并合并进 i18n。
 *
 * 预览模式下（URL 带 `kn_preview`）改读 `/ops/preview/content`，
 * 拿到的是**草稿**而不是已发布内容，因此运营可以在发布前看到效果；
 * 预览态同时会在 `main.tsx` 里关闭埋点，避免污染线上数据。
 */
export async function loadRemoteCopy(locale: string): Promise<RemoteCopyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const previewToken = getPreviewToken();
  const endpoint = previewToken
    ? `${PREVIEW_CONTENT_ENDPOINT}?token=${encodeURIComponent(previewToken)}&locale=${encodeURIComponent(locale)}`
    : `${CONTENT_ENDPOINT}?locale=${encodeURIComponent(locale)}`;
  try {
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { locale, applied: 0 };
    const json = (await res.json()) as { data?: { entries?: unknown } };
    const flat = flattenEntries(json?.data?.entries);
    const applied = Object.keys(flat).length;
    if (applied > 0) {
      i18n.addResourceBundle(locale, "translation", flat, true, true);
    }
    return { locale, applied };
  } catch {
    return { locale, applied: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** 预加载当前支持的语言，便于切换语言时直接命中覆盖。 */
export async function preloadRemoteCopy(locales: string[] = ["zh", "en"]): Promise<void> {
  await Promise.all(locales.map((locale) => loadRemoteCopy(locale).catch(() => undefined)));
}
