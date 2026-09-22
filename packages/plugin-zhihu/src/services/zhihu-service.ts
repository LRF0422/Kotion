import type { ZhihuClientConfig, ZhihuRequestOptions } from "./zhihu-client";
import { DEFAULT_ZHIHU_TIMEOUT_MS, zhihuFetch } from "./zhihu-client";
import { zhihuCache } from "./zhihu-cache";
import { zhihuRateLimit } from "./zhihu-rate-limit";
import type {
    ZhihuAskResult,
    ZhihuHotItem,
    ZhihuHotListResult,
    ZhihuQuotaItem,
    ZhihuSearchItem,
    ZhihuSearchResult,
} from "../types/zhihu";

export interface ZhihuServiceOptions extends ZhihuClientConfig {
    enableCache?: boolean;
    cacheTtlMs?: number;
}

function resolveTimeoutMs(options: ZhihuServiceOptions): number {
    const configured = options.timeoutMs;
    if (typeof configured === "number" && configured > 0) return configured;
    return DEFAULT_ZHIHU_TIMEOUT_MS;
}

/**
 * Single entry point for every rate-limited call. The per-call budget covers
 * both the queue wait and the request; once it is exceeded the call fails
 * immediately with a ZhihuTimeoutError and is not retried.
 */
function rateLimitedRequest<T>(
    options: ZhihuServiceOptions,
    path: string,
    request: Omit<ZhihuRequestOptions, "timeoutMs">,
): Promise<T> {
    const timeoutMs = resolveTimeoutMs(options);
    const deadline = Date.now() + timeoutMs;
    return zhihuRateLimit.run(
        () =>
            zhihuFetch<T>(options, path, {
                ...request,
                timeoutMs: Math.max(1, deadline - Date.now()),
            }),
        { deadline, timeoutMs },
    );
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
    value && typeof value === "object" ? (value as UnknownRecord) : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function pickString(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === "string" && value) return value;
    }
    return "";
}

function pickNumber(...values: unknown[]): number {
    for (const value of values) {
        const parsed = typeof value === "number" ? value : Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

/** First value that is actually present; keeps a real 0 instead of treating it as missing. */
function pickDefinedNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
        if (value === undefined || value === null || value === "") continue;
        const parsed = typeof value === "number" ? value : Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function pickOptionalString(...values: unknown[]): string | undefined {
    return pickString(...values) || undefined;
}

function pickOptionalNumber(...values: unknown[]): number | undefined {
    return pickNumber(...values) || undefined;
}

function cacheKey(path: string, params: UnknownRecord): string {
    return path + "?" + JSON.stringify(params);
}

function clamp(value: number, min: number, max: number, fallback: number): number {
    const parsed = Math.floor(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function normalizeSearchItem(value: unknown): ZhihuSearchItem {
    const item = asRecord(value);
    return {
        title: pickString(item.Title, item.title),
        contentType: pickString(item.ContentType, item.content_type),
        contentId: pickString(item.ContentID, item.content_id),
        contentText: pickString(item.ContentText, item.summary),
        url: pickString(item.Url, item.url),
        commentCount: pickNumber(item.CommentCount, item.comment_count),
        voteUpCount: pickNumber(item.VoteUpCount, item.vote_up_count),
        authorName: pickString(item.AuthorName, item.author_name),
        authorAvatar: pickString(item.AuthorAvatar, item.author_avatar),
        authorBadgeText: pickOptionalString(item.AuthorBadgeText, item.author_badge_text),
        editTime: pickOptionalNumber(item.EditTime, item.edit_time),
        rankingScore: pickOptionalNumber(item.RankingScore, item.ranking_score),
    };
}

function normalizeSearchResult(raw: unknown): ZhihuSearchResult {
    const data = asRecord(raw);
    return {
        hasMore: Boolean(data.HasMore ?? data.has_more),
        searchHashId: pickOptionalString(data.SearchHashId, data.search_hash_id),
        emptyReason: pickOptionalString(data.EmptyReason, data.empty_reason),
        items: asArray(data.Items ?? data.items).map(normalizeSearchItem),
    };
}

function normalizeHotItem(value: unknown): ZhihuHotItem {
    const item = asRecord(value);
    return {
        title: pickString(item.Title, item.title),
        url: pickString(item.Url, item.url),
        thumbnailUrl: pickOptionalString(item.ThumbnailUrl, item.thumbnail_url),
        summary: pickOptionalString(item.Summary, item.summary),
    };
}

/** Zhihu on-site search. Count is capped at 10 by the platform. */
export async function searchZhihu(
    options: ZhihuServiceOptions,
    query: string,
    count?: number,
): Promise<ZhihuSearchResult> {
    const trimmed = query?.trim();
    if (!trimmed) throw new Error("搜索关键词不能为空");

    const capped = clamp(count ?? 10, 1, 10, 10);
    const path = "/api/v1/content/zhihu_search";
    const key = cacheKey(path, { query: trimmed, count: capped });

    if (options.enableCache !== false) {
        const hit = zhihuCache.get<ZhihuSearchResult>(key);
        if (hit) return hit;
    }

    const raw = await rateLimitedRequest<unknown>(options, path, {
        query: { Query: trimmed, Count: capped },
    });
    const result = normalizeSearchResult(raw);

    if (options.enableCache !== false) zhihuCache.set(key, result, options.cacheTtlMs);
    return result;
}

/** Web-wide search (Count capped at 20); excludes zhihu.com subdomains. */
export async function searchZhihuGlobal(
    options: ZhihuServiceOptions,
    query: string,
    count?: number,
): Promise<ZhihuSearchResult> {
    const trimmed = query?.trim();
    if (!trimmed) throw new Error("搜索关键词不能为空");

    const capped = clamp(count ?? 10, 1, 20, 10);
    const path = "/api/v1/content/global_search";
    const key = cacheKey(path, { query: trimmed, count: capped });

    if (options.enableCache !== false) {
        const hit = zhihuCache.get<ZhihuSearchResult>(key);
        if (hit) return hit;
    }

    const raw = await rateLimitedRequest<unknown>(options, path, {
        query: { Query: trimmed, Count: capped },
    });
    const result = normalizeSearchResult(raw);

    if (options.enableCache !== false) zhihuCache.set(key, result, options.cacheTtlMs);
    return result;
}

/** Current Zhihu hot list (Limit capped at 30). */
export async function getZhihuHotList(
    options: ZhihuServiceOptions,
    limit?: number,
): Promise<ZhihuHotListResult> {
    const capped = clamp(limit ?? 30, 1, 30, 30);
    const path = "/api/v1/content/hot_list";
    const key = cacheKey(path, { limit: capped });

    if (options.enableCache !== false) {
        const hit = zhihuCache.get<ZhihuHotListResult>(key);
        if (hit) return hit;
    }

    const raw = await rateLimitedRequest<unknown>(options, path, {
        query: { Limit: capped },
    });
    const data = asRecord(raw);
    const items = asArray(data.Items ?? data.items).map(normalizeHotItem);
    const result: ZhihuHotListResult = {
        total: pickNumber(data.Total, data.total) || items.length,
        items,
    };

    if (options.enableCache !== false) zhihuCache.set(key, result, options.cacheTtlMs);
    return result;
}

/** Zhida question answering (OpenAI-compatible chat completions). */
export async function askZhihu(
    options: ZhihuServiceOptions,
    query: string,
    model = "zhida-thinking-1p5",
): Promise<ZhihuAskResult> {
    const trimmed = query?.trim();
    if (!trimmed) throw new Error("问题不能为空");

    const raw = await rateLimitedRequest<unknown>(options, "/v1/chat/completions", {
        method: "POST",
        body: {
            model,
            messages: [{ role: "user", content: trimmed }],
            stream: false,
        },
        unwrapEnvelope: false,
    });

    const data = asRecord(raw);
    const choice = asRecord(asArray(data.choices)[0]);
    const message = asRecord(choice.message);

    return {
        id: pickOptionalString(data.id),
        model: pickOptionalString(data.model),
        content: pickString(message.content),
        reasoningContent: pickOptionalString(message.reasoning_content),
        finishReason: pickOptionalString(choice.finish_reason),
    };
}

/** Remaining daily free quota per capability (does not consume business quota). */
export async function getZhihuQuota(
    options: ZhihuServiceOptions,
    apiIds?: string[],
): Promise<ZhihuQuotaItem[]> {
    const raw = await rateLimitedRequest<unknown>(options, "/api/v1/quota", {
        query: apiIds && apiIds.length > 0 ? { APIIDs: apiIds.join(",") } : undefined,
    });

    const data = asRecord(raw);
    const list = Array.isArray(raw) ? raw : asArray(data.Items ?? data.items);

    return list.map((value) => {
        const item = asRecord(value);
        const totalQuota = pickNumber(item.TotalQuota, item.total_quota);
        const totalUsed = pickNumber(item.TotalUsed, item.total_used);
        // The API field is "RemainingQuota"; keep legacy spellings as fallbacks.
        const remaining = pickDefinedNumber(
            item.RemainingQuota,
            item.remaining_quota,
            item.RemainQuota,
            item.remain_quota,
        );
        return {
            apiId: pickString(item.APIID, item.api_id, item.apiId),
            apiName: pickString(item.APIName, item.api_name, item.apiName),
            totalQuota,
            totalUsed,
            // Some payloads only expose totals; derive the remaining amount.
            remainQuota: remaining ?? Math.max(0, totalQuota - totalUsed),
        };
    });
}

export { zhihuCache };
