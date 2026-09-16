/**
 * 落地页自托管埋点 SDK（无第三方依赖）。
 *
 * - 会话与访客标识写入 sessionStorage / localStorage；
 * - 首次归因（referrer + UTM）持久化，保证复访也能归因到渠道；
 * - 事件先入队，按批量 + 定时 + 页面隐藏时上报到 /api/ops/collect；
 * - 尊重 DNT / GPC，任何异常都不得影响页面本身。
 */

import { isTrackingAllowed, subscribeConsent } from './consent';
import { validateEvent, type EventName } from './events';

export type TrackProps = Record<string, string | number | boolean | null | undefined>;

export interface TrackContext {
  path?: string;
  title?: string;
}

export interface OpenExternalOptions {
  /** 埋点里的点击位置，如 header / hero / final-cta */
  location: string;
  /** 埋点里的目标，如 demo / github / desktop */
  target: string;
  /** 额外事件属性 */
  props?: TrackProps;
  /** 出站 UTM 参数覆盖 */
  medium?: string;
  campaign?: string;
  content?: string;
}

interface QueuedEvent {
  name: string;
  path: string;
  title: string;
  ts: number;
  props?: TrackProps;
}

const SITE_ID = 'kotion-landing';
// 网关按服务前缀路由并 StripPrefix：公开端点需带 /knowledge-system 前缀
const COLLECT_ENDPOINT = '/api/knowledge-system/ops/collect';
const SESSION_KEY = 'kn.ops.session';
const VISITOR_KEY = 'kn.ops.visitor';
const ATTRIBUTION_KEY = 'kn.ops.attribution';
const SESSION_TTL = 30 * 60 * 1000;
const FLUSH_INTERVAL = 8000;
const MAX_BATCH = 20;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

let sessionId = '';
let visitorId = '';
let attribution: Record<string, string> = {};
let queue: QueuedEvent[] = [];
let timer: number | undefined;
let initialized = false;
let disabled = false;
let consentGateBound = false;

const safeGet = (storage: Storage | undefined, key: string): string | null => {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
};

const safeSet = (storage: Storage | undefined, key: string, value: string): void => {
  try {
    storage?.setItem(key, value);
  } catch {
    /* 隐私模式等场景忽略 */
  }
};

const newId = (prefix: string): string => {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 24)
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}-${random}`;
};

const isDisabled = (): boolean => {
  // 同意门控优先：未授权（或 DNT / 全局开关命中）直接禁用
  if (!isTrackingAllowed()) return true;
  if (disabled) return true;
  const globalFlag = (window as unknown as { __KN_OPS_DISABLED__?: boolean }).__KN_OPS_DISABLED__;
  if (globalFlag) return true;
  const dnt = navigator.doNotTrack || (window as unknown as { doNotTrack?: string }).doNotTrack;
  return dnt === '1' || dnt === 'yes';
};

/** 读取当前 URL 上的 UTM 参数（仅包含非空值）。 */
export function readUtm(search: string = window.location.search): Record<string, string> {
  const params = new URLSearchParams(search);
  const result: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) result[key] = value;
  }
  return result;
}

/** 首次归因：referrer + UTM，持久到 localStorage，复访沿用。 */
function resolveAttribution(): Record<string, string> {
  const current = readUtm();
  const stored = safeGet(window.localStorage, ATTRIBUTION_KEY);
  if (stored) {
    const parsed = (() => {
      try {
        return JSON.parse(stored) as Record<string, string>;
      } catch {
        return null;
      }
    })();
    if (parsed && Object.keys(parsed).length > 0) {
      // 已有归因：仅当本次带 UTM 时覆盖，保证最后一次投放可归因
      if (Object.keys(current).length > 0) {
        const merged = { ...parsed, ...current, referrer: document.referrer || parsed.referrer || '' };
        safeSet(window.localStorage, ATTRIBUTION_KEY, JSON.stringify(merged));
        return merged;
      }
      return parsed;
    }
  }
  const fresh: Record<string, string> = { ...current };
  if (document.referrer) fresh.referrer = document.referrer;
  if (Object.keys(fresh).length > 0) {
    safeSet(window.localStorage, ATTRIBUTION_KEY, JSON.stringify(fresh));
  }
  return fresh;
}

function resolveSession(): string {
  const raw = safeGet(window.sessionStorage, SESSION_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { id: string; last: number };
      if (parsed.id && Date.now() - parsed.last < SESSION_TTL) {
        safeSet(window.sessionStorage, SESSION_KEY, JSON.stringify({ id: parsed.id, last: Date.now() }));
        return parsed.id;
      }
    } catch {
      /* 重新生成 */
    }
  }
  const id = newId('s');
  safeSet(window.sessionStorage, SESSION_KEY, JSON.stringify({ id, last: Date.now() }));
  return id;
}

function resolveVisitor(): string {
  const existing = safeGet(window.localStorage, VISITOR_KEY);
  if (existing) return existing;
  const id = newId('v');
  safeSet(window.localStorage, VISITOR_KEY, id);
  return id;
}

function scheduleFlush(): void {
  if (timer !== undefined) return;
  timer = window.setTimeout(() => {
    timer = undefined;
    flushAnalytics();
  }, FLUSH_INTERVAL);
}

function buildPayload(events: QueuedEvent[]) {
  return JSON.stringify({
    siteId: SITE_ID,
    sessionId,
    visitorId,
    referrer: attribution.referrer || document.referrer || undefined,
    language: navigator.language,
    utm: {
      source: attribution.utm_source,
      medium: attribution.utm_medium,
      campaign: attribution.utm_campaign,
      content: attribution.utm_content,
      term: attribution.utm_term,
    },
    events,
  });
}

/** 立即上报队列。页面隐藏时使用 sendBeacon 保证送达。 */
export function flushAnalytics(useBeacon = false): void {
  if (!initialized || disabled || queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  const body = buildPayload(batch);

  try {
    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(COLLECT_ENDPOINT, blob);
      if (ok) return;
    }
    void fetch(COLLECT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* 采集失败不影响页面 */
  }
}

/** 初始化：只应调用一次。 */
export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  disabled = isDisabled();
  if (disabled) return;

  sessionId = resolveSession();
  visitorId = resolveVisitor();
  attribution = resolveAttribution();

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAnalytics(true);
  });
  window.addEventListener('pagehide', () => flushAnalytics(true));
}

/**
 * 同意门控：未授权时不采集，用户后续授权后补一次初始化。
 * 注意：initAnalytics() 以 initialized 做幂等保护，首次在“未授权”状态下调用会把
 * 实例标记为已初始化且 disabled；因此授权回调里需要先复位这两个标记，
 * 采集才会真正生效。
 */
export function initOpsConsentGated(): void {
  if (consentGateBound || typeof window === 'undefined') return;
  if (isTrackingAllowed()) return;
  consentGateBound = true;
  subscribeConsent((state) => {
    if (state !== 'granted') return;
    if (initialized && disabled) {
      initialized = false;
      disabled = false;
    }
    initAnalytics();
  });
}

/** 记录一个自定义事件。 */
export function track(name: string, props?: TrackProps, context?: TrackContext): void {
  if (!initialized) initAnalytics();
  if (disabled || !name) return;
  queue.push({
    name,
    path: context?.path ?? window.location.pathname,
    title: context?.title ?? document.title,
    ts: Date.now(),
    props,
  });
  if (queue.length >= MAX_BATCH) {
    flushAnalytics();
  } else {
    scheduleFlush();
  }
}

/** 记录一个已注册的标准事件：先做 schema 校验，未通过不入队。 */
export function trackEvent(name: EventName, props?: TrackProps, context?: TrackContext): void {
  const result = validateEvent(name, props);
  if (!result.ok) {
    if (import.meta.env.DEV) {
      console.warn('[ops] 事件校验失败', result.errors);
    }
    return;
  }
  if (import.meta.env.DEV && result.warnings.length > 0) {
    console.warn('[ops] 事件属性未注册', result.warnings);
  }
  track(name, props, context);
}

/** 记录页面浏览。 */
export function trackPageview(path?: string, title?: string): void {
  track('pageview', undefined, { path, title });
}

/**
 * 为出站链接补上 UTM 参数（不覆盖已有同名参数）。
 */
export function buildTrackedUrl(url: string, params: TrackProps = {}): string {
  try {
    const target = new URL(url, window.location.origin);
    if (target.origin === window.location.origin) return url;
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '' && !target.searchParams.has(key)) {
        target.searchParams.set(key, String(value));
      }
    }
    return target.toString();
  } catch {
    return url;
  }
}

/**
 * 记录 CTA 点击并打开出站链接（自动带 UTM）。
 */
export function openExternal(url: string, options: OpenExternalOptions): void {
  const { location, target, props, medium, campaign, content } = options;
  track('cta_click', { location, target, ...props });
  const tracked = buildTrackedUrl(url, {
    utm_source: 'kotion-landing',
    utm_medium: medium ?? 'landing',
    utm_campaign: campaign ?? 'site',
    utm_content: content ?? location,
  });
  window.open(tracked, '_blank', 'noopener,noreferrer');
}

/** 站内跳转前的 CTA 埋点。 */
export function trackCta(location: string, target: string, props?: TrackProps): void {
  track('cta_click', { location, target, ...props });
}

export const analyticsConfig = { siteId: SITE_ID, endpoint: COLLECT_ENDPOINT } as const;
