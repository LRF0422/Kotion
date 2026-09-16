/**
 * 落地页文案外置：从后端 CMS 读取已发布文案并合并进 i18n。
 *
 * - 资源键与 i18n 的 translation 键一致，例如 "home.hero-cta-primary"；
 * - 合并采用覆盖语义（deep + overwrite），未覆盖的键继续使用内置 resources.ts；
 * - 请求超时或失败时静默回退，绝不阻塞首屏。
 */
import { i18n } from "@kn/common";

const CONTENT_ENDPOINT = "/api/knowledge-system/ops/content";
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

/** 拉取某语言的已发布文案并合并进 i18n。 */
export async function loadRemoteCopy(locale: string): Promise<RemoteCopyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${CONTENT_ENDPOINT}?locale=${encodeURIComponent(locale)}`, {
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
