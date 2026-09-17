import { ZhihuApiError, describeZhihuError, zhihuErrorCodeMessage } from "./zhihu-errors";

export interface ZhihuClientConfig {
    accessSecret: string;
    baseUrl?: string;
}

export const DEFAULT_ZHIHU_BASE_URL = "https://developer.zhihu.com";

export interface ZhihuRequestOptions {
    method?: "GET" | "POST";
    query?: Record<string, string | number | boolean | undefined | null>;
    body?: unknown;
    signal?: AbortSignal;
    /**
     * When false, return the parsed JSON as-is instead of unwrapping the
     * Open Platform {Code, Message, Data} envelope (used by OpenAI-style
     * chat completions).
     */
    unwrapEnvelope?: boolean;
}

function buildUrl(
    baseUrl: string,
    path: string,
    query?: ZhihuRequestOptions["query"],
): string {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    const url = new URL(path.replace(/^\//, ""), normalizedBase);
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === "") continue;
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}

/**
 * Single seam for every Zhihu Open Platform request: injects Bearer auth and
 * the required second-level timestamp, then normalizes success/error payloads.
 */
export async function zhihuFetch<T>(
    config: ZhihuClientConfig,
    path: string,
    options: ZhihuRequestOptions = {},
): Promise<T> {
    const accessSecret = config.accessSecret?.trim();
    if (!accessSecret) {
        throw new ZhihuApiError(
            20001,
            "未配置知乎 Access Secret：请在 设置 → 知乎 中填写后重试",
        );
    }

    const baseUrl = (config.baseUrl?.trim() || DEFAULT_ZHIHU_BASE_URL).replace(/\/+$/, "");
    const url = buildUrl(baseUrl, path, options.query);
    const headers: Record<string, string> = {
        Authorization: "Bearer " + accessSecret,
        "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
    };

    let body: string | undefined;
    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
        method: options.method ?? "GET",
        headers,
        body,
        signal: options.signal,
    });

    let payload: unknown = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!payload || typeof payload !== "object") {
        throw new ZhihuApiError(
            response.status,
            "知乎接口返回了无法解析的响应（HTTP " + response.status + "）",
        );
    }

    const record = payload as Record<string, unknown>;

    if (options.unwrapEnvelope === false) {
        const error = record.error;
        if (error && typeof error === "object") {
            const errorRecord = error as Record<string, unknown>;
            const code = Number(errorRecord.code) || response.status;
            const message =
                typeof errorRecord.message === "string"
                    ? errorRecord.message
                    : zhihuErrorCodeMessage(code);
            throw new ZhihuApiError(code, message, payload);
        }
        if (!response.ok) {
            throw new ZhihuApiError(
                response.status,
                "知乎接口请求失败（HTTP " + response.status + "）",
                payload,
            );
        }
        return payload as T;
    }

    const code = typeof record.Code === "number" ? record.Code : response.status;
    if (code !== 0) {
        const message =
            typeof record.Message === "string" && record.Message
                ? record.Message
                : zhihuErrorCodeMessage(code);
        throw new ZhihuApiError(code, message, payload);
    }
    return record.Data as T;
}

export async function testZhihuConnection(
    config: ZhihuClientConfig,
): Promise<{ success: boolean; error?: string }> {
    try {
        await zhihuFetch(config, "/api/v1/quota");
        return { success: true };
    } catch (error) {
        return { success: false, error: describeZhihuError(error) };
    }
}
