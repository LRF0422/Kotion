/**
 * A/B 实验：稳定分流 + 曝光/转化上报。
 *
 * - 分流完全由 `hash(expKey + ":" + visitorId)` 派生，不用 Math.random()，
 *   同一访客刷新 / 重访都命中同一变体；
 * - 分配结果写入 localStorage（`kn.ops.exp.<expKey>`），保证不会翻转；
 * - 支持 `?exp_<expKey>=<variantKey>` 预览覆盖，覆盖流量不计曝光；
 * - 接口超时 / 失败时退化为「无实验」，绝不抛错。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "./analytics";
import { getVisitorId } from "./attribution";

const EXPERIMENTS_ENDPOINT = "/api/knowledge-system/ops/experiments";
const CONVERSION_ENDPOINT = "/api/knowledge-system/ops/exposure/conversion";
const TIMEOUT_MS = 2500;
const ASSIGNMENT_PREFIX = "kn.ops.exp.";

export interface ExperimentVariant<T = Record<string, unknown>> {
    variantKey: string;
    weight: number;
    isControl: boolean;
    payload?: T;
}

export interface RunningExperiment {
    expKey: string;
    name: string;
    trafficSplit: number;
    metricEvent: string;
    variants: ExperimentVariant[];
}

/* ------------------------------------------------------------------ */
/* 解析                                                               */
/* ------------------------------------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

function normalizeVariants(raw: unknown): ExperimentVariant[] {
    if (!Array.isArray(raw)) return [];
    const variants: ExperimentVariant[] = [];
    for (const entry of raw) {
        if (!isRecord(entry)) continue;
        const variantKey = typeof entry.variantKey === "string" ? entry.variantKey : "";
        if (!variantKey) continue;
        variants.push({
            variantKey,
            weight: typeof entry.weight === "number" && Number.isFinite(entry.weight) ? entry.weight : 1,
            isControl: entry.isControl === true,
            payload: isRecord(entry.payload) ? entry.payload : undefined,
        });
    }
    return variants;
}

function normalizeExperiments(raw: unknown): RunningExperiment[] {
    const source = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.data) ? raw.data : [];
    const experiments: RunningExperiment[] = [];
    for (const entry of source) {
        if (!isRecord(entry)) continue;
        const expKey = typeof entry.expKey === "string" ? entry.expKey : "";
        if (!expKey) continue;
        experiments.push({
            expKey,
            name: typeof entry.name === "string" ? entry.name : expKey,
            trafficSplit:
                typeof entry.trafficSplit === "number" && Number.isFinite(entry.trafficSplit)
                    ? entry.trafficSplit
                    : 100,
            metricEvent: typeof entry.metricEvent === "string" ? entry.metricEvent : "",
            variants: normalizeVariants(entry.variants),
        });
    }
    return experiments;
}

/* ------------------------------------------------------------------ */
/* 拉取 + 缓存 + 订阅                                                  */
/* ------------------------------------------------------------------ */

let cachedExperiments: RunningExperiment[] | undefined;
let inflight: Promise<RunningExperiment[]> | undefined;
const listeners = new Set<(experiments: RunningExperiment[]) => void>();

function notify(experiments: RunningExperiment[]): void {
    for (const listener of Array.from(listeners)) {
        try {
            listener(experiments);
        } catch {
            /* 单个订阅者异常不影响其它订阅者 */
        }
    }
}

/** 已缓存的实验列表；未加载（或加载失败）时为 undefined。 */
export function getCachedExperiments(): RunningExperiment[] | undefined {
    return cachedExperiments;
}

/** 订阅实验列表加载完成事件，返回取消订阅函数。 */
export function subscribeExperiments(cb: (experiments: RunningExperiment[]) => void): () => void {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

/** 读取实验列表。成功结果缓存；失败返回空数组且不缓存，永不抛错。 */
export async function loadExperiments(): Promise<RunningExperiment[]> {
    if (cachedExperiments) return cachedExperiments;
    if (inflight) return inflight;

    inflight = (async (): Promise<RunningExperiment[]> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(EXPERIMENTS_ENDPOINT, {
                signal: controller.signal,
                headers: { Accept: "application/json" },
            });
            if (!res.ok) return [];
            const raw: unknown = await res.json();
            const experiments = normalizeExperiments(raw);
            cachedExperiments = experiments;
            notify(experiments);
            return experiments;
        } catch {
            return [];
        } finally {
            clearTimeout(timer);
            inflight = undefined;
        }
    })();

    return inflight;
}

/* ------------------------------------------------------------------ */
/* 分流（纯函数，可单测）                                              */
/* ------------------------------------------------------------------ */

/** FNV-1a 32 位字符串哈希：稳定、无依赖、跨浏览器一致。 */
export function hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * 计算某访客在某实验中的变体。
 *
 * - 参与判定与变体判定使用**两个不同的哈希**：若复用同一个哈希，当
 *   trafficSplit < 100 且总权重为 100 时，「是否参与」会与「落到哪个变体」强相关，
 *   后面的变体将拿不到流量（例如 split=50 时只有权重靠前的变体可见）。
 * - 纯函数 + 确定性：同样的 (expKey, visitorId, variants, trafficSplit) 永远得到同一结果。
 */
export function assignVariant(
    expKey: string,
    visitorId: string,
    variants: ExperimentVariant[],
    trafficSplit: number,
): ExperimentVariant | null {
    if (!Array.isArray(variants) || variants.length === 0) return null;

    // 参与判定
    const participationHash = hashString(`${expKey}:${visitorId}`);
    const split = Number.isFinite(trafficSplit) ? Math.max(0, Math.min(100, trafficSplit)) : 100;
    if (participationHash % 100 >= split) return null;

    const totalWeight = variants.reduce((sum, variant) => sum + Math.max(0, variant.weight), 0);
    if (totalWeight <= 0) return null;

    // 变体判定：使用独立哈希，避免与参与判定相关
    const variantHash = hashString(`${expKey}:${visitorId}:variant`);
    let point = variantHash % totalWeight;
    for (const variant of variants) {
        const weight = Math.max(0, variant.weight);
        if (point < weight) return variant;
        point -= weight;
    }
    return variants[variants.length - 1] ?? null;
}

/* ------------------------------------------------------------------ */
/* 本地分配记录                                                        */
/* ------------------------------------------------------------------ */

const assignmentStorage = (): Storage | undefined => {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        return undefined;
    }
};

function readStoredVariant(expKey: string): string | null {
    const storage = assignmentStorage();
    if (!storage) return null;
    try {
        return storage.getItem(`${ASSIGNMENT_PREFIX}${expKey}`);
    } catch {
        return null;
    }
}

function storeVariant(expKey: string, variantKey: string): void {
    const storage = assignmentStorage();
    if (!storage) return;
    try {
        storage.setItem(`${ASSIGNMENT_PREFIX}${expKey}`, variantKey);
    } catch {
        /* 隐私模式 / 配额不足时忽略 */
    }
}

/** 读取 `?exp_<expKey>=<variantKey>` 预览覆盖参数。 */
function readOverride(expKey: string): string | null {
    try {
        if (typeof window === "undefined") return null;
        const value = new URLSearchParams(window.location.search).get(`exp_${expKey}`);
        return value || null;
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Hook                                                               */
/* ------------------------------------------------------------------ */

export interface UseExperimentResult<T> {
    variant: ExperimentVariant<T> | null;
    payload: T | null;
    variantKey: string | null;
}

/**
 * 读取实验分配。挂载时按需加载实验列表并订阅更新；
 * 分配结果持久化到 localStorage；曝光事件每个实验每次挂载只上报一次
 * （URL 覆盖预览时跳过，避免预览流量污染数据）。
 */
export function useExperiment<T = Record<string, unknown>>(expKey: string): UseExperimentResult<T> {
    const [experiments, setExperiments] = useState<RunningExperiment[]>(() => getCachedExperiments() ?? []);
    const exposedRef = useRef(false);
    const visitorId = getVisitorId();
    const override = useMemo(() => readOverride(expKey), [expKey]);

    useEffect(() => {
        let active = true;
        const cached = getCachedExperiments();
        if (cached) setExperiments(cached);
        else void loadExperiments().then((list) => {
            if (active) setExperiments(list);
        });
        const unsubscribe = subscribeExperiments((list) => {
            if (active) setExperiments(list);
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    const experiment = useMemo(
        () => experiments.find((item) => item.expKey === expKey) ?? null,
        [experiments, expKey],
    );

    const variant = useMemo<ExperimentVariant<T> | null>(() => {
        if (!experiment) return null;
        const variants = experiment.variants as unknown as ExperimentVariant<T>[];

        // 1) URL 覆盖（预览）优先
        if (override) {
            const forced = variants.find((item) => item.variantKey === override);
            if (forced) return forced;
        }
        // 2) 已持久化的分配结果，保证同一访客不翻转
        const stored = readStoredVariant(expKey);
        if (stored) {
            const found = variants.find((item) => item.variantKey === stored);
            if (found) return found;
        }
        // 3) 首次访问：确定性分流
        return assignVariant(
            expKey,
            visitorId,
            variants as unknown as ExperimentVariant[],
            experiment.trafficSplit,
        ) as unknown as ExperimentVariant<T> | null;
    }, [experiment, expKey, override, visitorId]);

    useEffect(() => {
        if (!variant) return;
        storeVariant(expKey, variant.variantKey);
    }, [variant, expKey]);

    useEffect(() => {
        if (!variant || exposedRef.current) return;
        exposedRef.current = true;
        if (override) return;
        trackEvent("experiment_exposure", { experiment: expKey, variant: variant.variantKey });
    }, [variant, override, expKey]);

    return {
        variant,
        payload: variant?.payload ?? null,
        variantKey: variant?.variantKey ?? null,
    };
}

/* ------------------------------------------------------------------ */
/* 转化                                                                */
/* ------------------------------------------------------------------ */

/** 上报实验转化：埋点 + 一次 best-effort 的后端曝光记录（不等待、失败忽略）。 */
export function reportExperimentConversion(expKey: string, metric?: string): void {
    const variant = readStoredVariant(expKey) ?? undefined;
    try {
        trackEvent("experiment_conversion", { experiment: expKey, variant, metric });
    } catch {
        /* 埋点失败不影响主流程 */
    }

    try {
        void fetch(CONVERSION_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expKey, visitorId: getVisitorId(), metric }),
            keepalive: true,
        }).catch(() => undefined);
    } catch {
        /* 上报失败不影响主流程 */
    }
}
