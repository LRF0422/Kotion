/**
 * 运营配置（SEO / 区块 / 推广位 / 精选位）统一读取入口。
 *
 * - 单次 fetch + 按语言缓存，同一语言的并发请求会被去重；
 * - 2500ms 超时；任何失败都退化成「空配置」，绝不抛错、绝不阻塞首屏；
 * - `subscribeConfig` 让组件在异步加载完成后重新渲染（先渲染内置默认值）；
 * - 同时提供推广位的共享工具：页面匹配、频次/关闭状态、主题内联样式。
 */

const CONFIG_ENDPOINT = "/api/knowledge-system/ops/config";
const TIMEOUT_MS = 2500;

export interface OpsSeoPayload {
    title?: string;
    description?: string;
    keywords?: string;
    canonical?: string;
    robots?: string;
    ogImage?: string;
    ogTitle?: string;
    ogDescription?: string;
    jsonLd?: string;
}

export interface SectionItem {
    sectionKey: string;
    position: number;
    enabled: boolean;
    props?: Record<string, unknown>;
}

export type PromotionType = "announcement" | "exit_intent" | "sticky_cta";

export type PromotionTheme = "default" | "accent" | "warn";

export interface PromotionItem {
    id: string;
    type: PromotionType;
    title?: string;
    body?: string;
    ctaLabel?: string;
    ctaHref?: string;
    pages?: string[];
    frequency?: number;
    theme?: PromotionTheme;
}

export interface FeaturedItem {
    targetType: "template" | "plugin";
    targetId: string;
    name?: string;
    badge?: string;
    blurb?: string;
    position: number;
}

export interface OpsConfig {
    seo: Record<string, OpsSeoPayload>;
    sections: Record<string, SectionItem[]>;
    promotions: PromotionItem[];
    featured: FeaturedItem[];
}

/** 空配置：接口不可达或返回异常时的安全回退。 */
export function emptyOpsConfig(): OpsConfig {
    return { seo: {}, sections: {}, promotions: [], featured: [] };
}

/* ------------------------------------------------------------------ */
/* 解析（全部按「未知输入」处理，脏数据直接丢弃而不是抛错）            */
/* ------------------------------------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const asOptionalString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;

const asNumber = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback: boolean): boolean =>
    typeof value === "boolean" ? value : fallback;

const asStringArray = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const items = value.filter((item): item is string => typeof item === "string");
    return items.length > 0 ? items : undefined;
};

/** 兼容 `{ code, data: {...} }` 与裸对象两种返回形状。 */
const unwrap = (raw: unknown): Record<string, unknown> => {
    if (!isRecord(raw)) return {};
    return isRecord(raw.data) ? raw.data : raw;
};

function normalizeSeo(raw: unknown): Record<string, OpsSeoPayload> {
    const result: Record<string, OpsSeoPayload> = {};
    if (!isRecord(raw)) return result;
    for (const [path, value] of Object.entries(raw)) {
        if (!isRecord(value)) continue;
        result[path] = {
            title: asOptionalString(value.title),
            description: asOptionalString(value.description),
            keywords: asOptionalString(value.keywords),
            canonical: asOptionalString(value.canonical),
            robots: asOptionalString(value.robots),
            ogImage: asOptionalString(value.ogImage),
            ogTitle: asOptionalString(value.ogTitle),
            ogDescription: asOptionalString(value.ogDescription),
            jsonLd: asOptionalString(value.jsonLd),
        };
    }
    return result;
}

function normalizeSections(raw: unknown): Record<string, SectionItem[]> {
    const result: Record<string, SectionItem[]> = {};
    if (!isRecord(raw)) return result;
    for (const [pageKey, value] of Object.entries(raw)) {
        if (!Array.isArray(value)) continue;
        const items: SectionItem[] = [];
        for (const entry of value) {
            if (!isRecord(entry)) continue;
            const sectionKey = asOptionalString(entry.sectionKey);
            if (!sectionKey) continue;
            items.push({
                sectionKey,
                position: asNumber(entry.position, items.length),
                enabled: asBoolean(entry.enabled, true),
                props: isRecord(entry.props) ? entry.props : undefined,
            });
        }
        result[pageKey] = items;
    }
    return result;
}

const isPromotionType = (value: unknown): value is PromotionType =>
    value === "announcement" || value === "exit_intent" || value === "sticky_cta";

const isPromotionTheme = (value: unknown): value is PromotionTheme =>
    value === "default" || value === "accent" || value === "warn";

function normalizePromotions(raw: unknown): PromotionItem[] {
    if (!Array.isArray(raw)) return [];
    const items: PromotionItem[] = [];
    for (const entry of raw) {
        if (!isRecord(entry)) continue;
        const id = asOptionalString(entry.id);
        if (!id || !isPromotionType(entry.type)) continue;
        items.push({
            id,
            type: entry.type,
            title: asOptionalString(entry.title),
            body: asOptionalString(entry.body),
            ctaLabel: asOptionalString(entry.ctaLabel),
            ctaHref: asOptionalString(entry.ctaHref),
            pages: asStringArray(entry.pages),
            frequency: asNumber(entry.frequency, 0),
            theme: isPromotionTheme(entry.theme) ? entry.theme : "default",
        });
    }
    return items;
}

function normalizeFeatured(raw: unknown): FeaturedItem[] {
    if (!Array.isArray(raw)) return [];
    const items: FeaturedItem[] = [];
    for (const entry of raw) {
        if (!isRecord(entry)) continue;
        const targetType = entry.targetType;
        const targetId = asOptionalString(entry.targetId);
        if ((targetType !== "template" && targetType !== "plugin") || !targetId) continue;
        items.push({
            targetType,
            targetId,
            name: asOptionalString(entry.name),
            badge: asOptionalString(entry.badge),
            blurb: asOptionalString(entry.blurb),
            position: asNumber(entry.position, items.length),
        });
    }
    return items;
}

function normalizeConfig(raw: unknown): OpsConfig {
    const source = unwrap(raw);
    return {
        seo: normalizeSeo(source.seo),
        sections: normalizeSections(source.sections),
        promotions: normalizePromotions(source.promotions),
        featured: normalizeFeatured(source.featured),
    };
}

/* ------------------------------------------------------------------ */
/* 拉取 + 缓存 + 订阅                                                  */
/* ------------------------------------------------------------------ */

const configCache = new Map<string, OpsConfig>();
const inflight = new Map<string, Promise<OpsConfig>>();
const listeners = new Set<(locale: string, config: OpsConfig) => void>();

function notify(locale: string, config: OpsConfig): void {
    for (const listener of Array.from(listeners)) {
        try {
            listener(locale, config);
        } catch {
            /* 单个订阅者异常不影响其它订阅者 */
        }
    }
}

/** 已缓存的配置；未加载（或加载失败）时为 undefined。 */
export function getCachedConfig(locale: string): OpsConfig | undefined {
    return configCache.get(locale);
}

/** 订阅配置加载完成事件，返回取消订阅函数。 */
export function subscribeConfig(cb: (locale: string, config: OpsConfig) => void): () => void {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

/**
 * 读取某语言的运营配置。
 * 成功结果按语言缓存；失败返回空配置且**不缓存**（后续可重试），永不抛错。
 */
export async function loadOpsConfig(locale: string): Promise<OpsConfig> {
    const cached = configCache.get(locale);
    if (cached) return cached;
    const pending = inflight.get(locale);
    if (pending) return pending;

    const request = (async (): Promise<OpsConfig> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(`${CONFIG_ENDPOINT}?locale=${encodeURIComponent(locale)}`, {
                signal: controller.signal,
                headers: { Accept: "application/json" },
            });
            if (!res.ok) return emptyOpsConfig();
            const raw: unknown = await res.json();
            const config = normalizeConfig(raw);
            configCache.set(locale, config);
            notify(locale, config);
            return config;
        } catch {
            return emptyOpsConfig();
        } finally {
            clearTimeout(timer);
            inflight.delete(locale);
        }
    })();

    inflight.set(locale, request);
    return request;
}

/* ------------------------------------------------------------------ */
/* 推广位共享工具                                                      */
/* ------------------------------------------------------------------ */

const PROMO_STORAGE_PREFIX = "kn.ops.promo.";
const LOCALE_PREFIX_RE = /^\/(zh|en)(?=\/|$)/;

const normalizePath = (path: string): string => {
    if (!path.startsWith("/")) return path;
    const trimmed = path.replace(/\/+$/, "");
    return trimmed === "" ? "/" : trimmed;
};

/** 去掉 /zh、/en 语言前缀（首页保持 "/"）。 */
const stripLocalePrefix = (pathname: string): string => pathname.replace(LOCALE_PREFIX_RE, "") || "/";

/**
 * 推广位页面匹配。
 * - `pages` 为空 / 未配置 → 全站生效；
 * - 支持精确匹配与 `*` 结尾的前缀匹配；
 * - 同时比较「带语言前缀」与「去掉语言前缀」两种路径，
 *   因此运营配 `/templates` 时中英文页面都会命中。
 */
export function matchesPromotionPage(pages: string[] | undefined, pathname: string): boolean {
    if (!pages || pages.length === 0) return true;
    const candidates = new Set([normalizePath(pathname), normalizePath(stripLocalePrefix(pathname))]);
    for (const page of pages) {
        if (typeof page !== "string" || page === "") continue;
        if (page.endsWith("*")) {
            const prefix = normalizePath(page.slice(0, -1)) || "/";
            for (const candidate of candidates) {
                if (candidate.startsWith(prefix)) return true;
            }
            continue;
        }
        const normalized = normalizePath(page);
        for (const candidate of candidates) {
            if (candidate === normalized) return true;
        }
    }
    return false;
}

export interface PromotionRecord {
    /** 已展示次数（跨会话累计）。 */
    impressions: number;
    /** 用户是否主动关闭过。 */
    dismissed?: boolean;
    /** 最近一次展示 / 关闭时间戳。 */
    at: number;
}

const promoStorage = (): Storage | undefined => {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        return undefined;
    }
};

/** 读取推广位状态；缺失或损坏时返回初始值。 */
export function readPromotionRecord(id: string): PromotionRecord {
    const storage = promoStorage();
    if (!storage) return { impressions: 0, at: 0 };
    try {
        const raw = storage.getItem(`${PROMO_STORAGE_PREFIX}${id}`);
        if (!raw) return { impressions: 0, at: 0 };
        const parsed = JSON.parse(raw) as Partial<PromotionRecord>;
        return {
            impressions: typeof parsed.impressions === "number" && parsed.impressions > 0 ? parsed.impressions : 0,
            dismissed: parsed.dismissed === true,
            at: typeof parsed.at === "number" ? parsed.at : 0,
        };
    } catch {
        return { impressions: 0, at: 0 };
    }
}

function writePromotionRecord(id: string, record: PromotionRecord): void {
    const storage = promoStorage();
    if (!storage) return;
    try {
        storage.setItem(`${PROMO_STORAGE_PREFIX}${id}`, JSON.stringify(record));
    } catch {
        /* 隐私模式 / 配额不足时忽略 */
    }
}

/** 记一次展示（频次上限依赖这个计数器，而不是布尔值）。 */
export function recordPromotionImpression(id: string): void {
    const current = readPromotionRecord(id);
    writePromotionRecord(id, { ...current, impressions: current.impressions + 1, at: Date.now() });
}

/** 记录用户主动关闭。 */
export function dismissPromotion(id: string): void {
    const current = readPromotionRecord(id);
    writePromotionRecord(id, { ...current, dismissed: true, at: Date.now() });
}

/**
 * 是否允许展示：已关闭 → 否；`frequency > 0` 且展示次数已达上限 → 否。
 * `frequency` 为 0（或缺省）表示不限次数。
 */
export function shouldShowPromotion(promotion: PromotionItem): boolean {
    const record = readPromotionRecord(promotion.id);
    if (record.dismissed) return false;
    const frequency = typeof promotion.frequency === "number" ? promotion.frequency : 0;
    if (frequency > 0 && record.impressions >= frequency) return false;
    return true;
}

export interface PromotionThemeStyle {
    background: string;
    color: string;
    borderColor: string;
}

/** 主题 → 内联样式：复用站点已有的 CSS 变量，不引入新的设计语言。 */
export function promotionThemeStyle(theme: PromotionTheme | undefined): PromotionThemeStyle {
    switch (theme) {
        case "accent":
            return {
                background: "var(--scene-bitable-500)",
                color: "#ffffff",
                borderColor: "var(--scene-bitable-600)",
            };
        case "warn":
            return { background: "#f59e0b", color: "#1f1300", borderColor: "#d97706" };
        default:
            return { background: "var(--kn-paper)", color: "var(--kn-ink)", borderColor: "var(--kn-line)" };
    }
}
