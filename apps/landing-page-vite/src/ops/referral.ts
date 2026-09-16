/**
 * 邀请 / 推荐码捕获（P2-7 推荐邀请）。
 *
 * - `?ref=<code>` 首次触达即持久化到 localStorage，复访沿用；
 * - 同一个 code 在每个会话只上报一次 `referral_click`，避免刷新刷量；
 * - 所有存储访问都包在 try/catch 内，隐私模式 / 禁用存储时静默降级；
 * - 产出 `buildReferralLink` 供分享，跳转由后端 `/ops/r/{code}` 负责（302 + 计数）。
 */

import { trackEvent } from "./analytics";

const REF_KEY = "kn.ops.ref";
const REF_MARK_KEY = "kn.ops.ref.tracked";

export interface ReferralRecord {
  code: string;
  /** 首次落库时间戳 */
  at: number;
  /** 首次命中的路径 */
  path: string;
}

const getStorage = (kind: "local" | "session"): Storage | undefined => {
  try {
    if (typeof window === "undefined") return undefined;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
};

const readStorage = (kind: "local" | "session", key: string): string | null => {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const writeStorage = (kind: "local" | "session", key: string, value: string): void => {
  try {
    getStorage(kind)?.setItem(key, value);
  } catch {
    /* 隐私模式等场景忽略 */
  }
};

/** 读取已持久化的邀请码记录（损坏时返回 null）。 */
function readRecord(): ReferralRecord | null {
  const raw = readStorage("local", REF_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReferralRecord> | null;
    if (parsed && typeof parsed.code === "string" && parsed.code !== "") {
      return {
        code: parsed.code,
        at: typeof parsed.at === "number" ? parsed.at : 0,
        path: typeof parsed.path === "string" ? parsed.path : "",
      };
    }
  } catch {
    /* 解析失败按未记录处理 */
  }
  return null;
}

/** 读取当前 URL 上的 `ref` 参数（去空白，空串视为不存在）。 */
function readRefParam(): string | null {
  try {
    const value = new URLSearchParams(window.location.search).get("ref");
    const code = value ? value.trim() : "";
    return code === "" ? null : code;
  } catch {
    return null;
  }
}

/**
 * 捕获并持久化邀请码。应用挂载时调用一次。
 *
 * @returns 当前生效的邀请码（本次 URL 上的优先，其次历史持久化的），没有则 null
 */
export function captureReferral(): string | null {
  if (typeof window === "undefined") return null;

  const incoming = readRefParam();
  const path = window.location.pathname;

  if (!incoming) {
    // 本次没有带来新的 ref：沿用历史记录，不计一次点击
    return readRecord()?.code ?? null;
  }

  const stored = readRecord();
  if (!stored || stored.code !== incoming) {
    // 首触优先：已有 code 时只在带来「新的 code」时覆盖
    const record: ReferralRecord = { code: incoming, at: Date.now(), path };
    writeStorage("local", REF_KEY, JSON.stringify(record));
  }

  // 每个 code 每个会话只上报一次
  if (readStorage("session", REF_MARK_KEY) !== incoming) {
    writeStorage("session", REF_MARK_KEY, incoming);
    trackEvent("referral_click", { code: incoming, location: path });
  }

  return incoming;
}

/** 当前生效的邀请码（仅持久化记录，不读取 URL）。 */
export function getReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  return readRecord()?.code ?? null;
}

/** 生成推荐短链；跳转与计数由后端 `/ops/r/{code}` 处理。 */
export function buildReferralLink(code: string): string {
  return `${window.location.origin}/api/knowledge-system/ops/r/${code}`;
}
