/**
 * 埋点同意状态机（自托管，无第三方依赖）。
 *
 * - 状态持久化在 localStorage: kn.ops.consent（JSON: { state, at, region }）；
 * - 仅 EU/UK/BR 地区弹窗征得同意，未表态前按拒绝处理；其余地区默示同意；
 * - 变更后派发 window 事件 kn:consent-changed，SDK 据此补初始化；
 * - 所有存储/浏览器 API 都 try/catch，SSR 与隐私模式下不抛错。
 */

const CONSENT_KEY = 'kn.ops.consent';
const CONSENT_EVENT = 'kn:consent-changed';

export type ConsentState = 'unknown' | 'granted' | 'denied';

interface ConsentRecord {
  state: 'granted' | 'denied';
  at: number;
  region: string;
}

/** 语言前缀启发式：命中即按需要征得同意处理。 */
const EU_LANGUAGE_PREFIXES = [
  'de',
  'fr',
  'es',
  'it',
  'nl',
  'pl',
  'pt',
  'sv',
  'da',
  'fi',
  'nb',
  'el',
  'cs',
  'ro',
  'hu',
  'sk',
  'bg',
  'hr',
  'lt',
  'lv',
  'et',
  'sl',
  'ga',
  'mt',
  'cy',
  'is',
  'en-gb',
  'pt-br',
];

const getStorage = (): Storage | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

const safeGet = (key: string): string | null => {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string): void => {
  try {
    getStorage()?.setItem(key, value);
  } catch {
    /* 隐私模式 / 配额不足时忽略 */
  }
};

/** DNT / 全局开关：任一命中都视为不允许采集。 */
const isDoNotTrack = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    const navDnt = navigator.doNotTrack;
    const winDnt = (window as unknown as { doNotTrack?: string }).doNotTrack;
    return navDnt === '1' || winDnt === 'yes';
  } catch {
    return false;
  }
};

const isGloballyDisabled = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    return Boolean((window as unknown as { __KN_OPS_DISABLED__?: boolean }).__KN_OPS_DISABLED__);
  } catch {
    return false;
  }
};

const getTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
};

/** 读取当前同意状态，缺失或损坏时按未知处理。 */
export function getConsentState(): ConsentState {
  const raw = safeGet(CONSENT_KEY);
  if (!raw) return 'unknown';
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    return parsed.state === 'granted' || parsed.state === 'denied' ? parsed.state : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 是否允许采集。
 *
 * 策略（与 docs/OPERATIONS_PLAN.md §6 一致）：
 * - DNT / 全局开关命中 → 永不采集；
 * - 用户明确拒绝 → 不采集；
 * - 用户明确同意 → 采集；
 * - 尚未表态（unknown）→ **仅对需要显式同意的地区（EU/UK/BR）默认拒绝**，
 *   其余地区按「默示同意」采集，避免为了合规把全球流量一并关掉。
 */
export function isTrackingAllowed(): boolean {
  if (isDoNotTrack() || isGloballyDisabled()) return false;
  const state = getConsentState();
  if (state === 'granted') return true;
  if (state === 'denied') return false;
  return !requiresConsent();
}

/** 记录用户选择并广播变更事件。 */
export function setConsentState(state: 'granted' | 'denied'): void {
  const record: ConsentRecord = { state, at: Date.now(), region: detectRegion() };
  safeSet(CONSENT_KEY, JSON.stringify(record));
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { state } }));
    }
  } catch {
    /* 派发失败不影响状态持久化 */
  }
}

/** 区域推断：时区优先，语言前缀兜底。 */
export function detectRegion(): string {
  try {
    const language = (typeof navigator !== 'undefined' ? navigator.language : '') || '';
    const lang = language.toLowerCase();
    const zone = getTimeZone();
    if (lang.startsWith('en-gb') || zone === 'Europe/London') return 'UK';
    if (lang.startsWith('pt-br')) return 'BR';
    if (zone.startsWith('Europe/') || zone.startsWith('Atlantic/')) return 'EU';
    if (EU_LANGUAGE_PREFIXES.some((prefix) => lang.startsWith(prefix))) return 'EU';
  } catch {
    /* 推断失败按未知区域处理 */
  }
  return 'OTHER';
}

/** 是否需要显式征得同意（EU / UK / BR 启发式）。 */
export function requiresConsent(): boolean {
  const region = detectRegion();
  return region === 'EU' || region === 'UK' || region === 'BR';
}

/** 订阅同意状态变更，返回取消订阅函数。 */
export function subscribeConsent(cb: (state: ConsentState) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event): void => {
    try {
      const detail = (event as CustomEvent<{ state?: ConsentState }>).detail;
      const state = detail?.state;
      if (state === 'granted' || state === 'denied') cb(state);
    } catch {
      /* 单个订阅者异常不影响其他订阅者 */
    }
  };
  window.addEventListener(CONSENT_EVENT, handler);
  return () => {
    try {
      window.removeEventListener(CONSENT_EVENT, handler);
    } catch {
      /* 忽略 */
    }
  };
}
