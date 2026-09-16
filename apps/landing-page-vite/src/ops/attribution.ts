/**
 * 出站归因传递（landing → demo）。
 *
 * - 复用 analytics SDK 写入的访客 / 会话标识；
 * - 把当前 URL 上的 UTM 与 ref 参数改写成 kn_* 前缀，附带在出站链接上；
 * - 已存在的同名参数不覆盖；同源或不可解析的 URL 原样返回。
 */

const VISITOR_KEY = 'kn.ops.visitor';
const SESSION_KEY = 'kn.ops.session';

/** 出站归因参数统一前缀。 */
export const HANDOFF_PREFIX = 'kn_';

export interface HandoffParams {
  kn_vid: string;
  kn_sid: string;
  kn_utm_source?: string;
  kn_utm_medium?: string;
  kn_utm_campaign?: string;
  kn_utm_content?: string;
  kn_utm_term?: string;
  kn_ref?: string;
}

const getStorage = (kind: 'local' | 'session'): Storage | undefined => {
  try {
    if (typeof window === 'undefined') return undefined;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
};

const readStorage = (storage: Storage | undefined, key: string): string | null => {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
};

/** 访客标识（首次访问时由 SDK 写入 localStorage）。 */
export function getVisitorId(): string {
  return readStorage(getStorage('local'), VISITOR_KEY) ?? '';
}

/** 会话标识；SDK 写入 sessionStorage，这里同时兼容 localStorage 中的同名字段。 */
export function getSessionId(): string {
  const raw =
    readStorage(getStorage('session'), SESSION_KEY) ?? readStorage(getStorage('local'), SESSION_KEY);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as { id?: string };
    return typeof parsed.id === 'string' ? parsed.id : '';
  } catch {
    return '';
  }
}

/** 组装出站归因参数：身份 + 当前 URL 上的 UTM / ref。 */
export function buildHandoffParams(): HandoffParams {
  const params: HandoffParams = { kn_vid: getVisitorId(), kn_sid: getSessionId() };
  if (typeof window === 'undefined') return params;
  try {
    const search = new URLSearchParams(window.location.search);
    params.kn_utm_source = search.get('utm_source') || undefined;
    params.kn_utm_medium = search.get('utm_medium') || undefined;
    params.kn_utm_campaign = search.get('utm_campaign') || undefined;
    params.kn_utm_content = search.get('utm_content') || undefined;
    params.kn_utm_term = search.get('utm_term') || undefined;
    params.kn_ref = search.get('ref') || undefined;
  } catch {
    /* URL 解析失败时只保留身份参数 */
  }
  return params;
}

/**
 * 为外部 http(s) 链接追加归因参数（不覆盖已有同名参数）。
 * 同源链接、非 http(s) 协议与不可解析的 URL 原样返回。
 */
export function appendHandoff(url: string, extra?: Record<string, string | undefined>): string {
  if (typeof window === 'undefined') return url;
  try {
    const target = new URL(url, window.location.origin);
    if (target.origin === window.location.origin) return url;
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return url;
    const params: Record<string, string | undefined> = { ...buildHandoffParams(), ...extra };
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      if (!target.searchParams.has(key)) target.searchParams.set(key, value);
    }
    return target.toString();
  } catch {
    return url;
  }
}
