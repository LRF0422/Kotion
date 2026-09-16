/**
 * 预览模式：识别 `?kn_preview=<token>`，把 token 存到 sessionStorage
 * （站点内跳转后仍然有效），并让其它模块可以读取预览请求头。
 *
 * 预览流量必须与线上数据隔离：命中预览时调用 `disableAnalyticsInPreview()`
 * 打开全局开关，analytics 会直接丢弃所有事件。
 */

const QUERY_KEY = "kn_preview";
const STORAGE_KEY = "kn.ops.preview";

const readSession = (key: string): string | null => {
    try {
        if (typeof window === "undefined") return null;
        return window.sessionStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeSession = (key: string, value: string): void => {
    try {
        if (typeof window === "undefined") return;
        window.sessionStorage.setItem(key, value);
    } catch {
        /* 隐私模式 / 配额不足时忽略 */
    }
};

/**
 * 读取预览 token：query 优先并持久化到 sessionStorage，其次读取已持久化的值。
 */
export function getPreviewToken(): string | null {
    try {
        if (typeof window === "undefined") return null;
        const fromQuery = new URLSearchParams(window.location.search).get(QUERY_KEY);
        if (fromQuery) {
            writeSession(STORAGE_KEY, fromQuery);
            return fromQuery;
        }
        return readSession(STORAGE_KEY);
    } catch {
        return null;
    }
}

/** 当前是否处于预览模式。 */
export function isPreviewMode(): boolean {
    return getPreviewToken() !== null;
}

/** 预览模式下的额外请求头（无 token 时为空对象）。 */
export function previewHeaders(): Record<string, string> {
    const token = getPreviewToken();
    return token ? { "X-Ops-Preview": token } : {};
}

/**
 * 预览模式下关闭埋点。必须在 `initAnalytics()` 之前调用；
 * 站点内后续进入预览链接时也可以再次调用。
 */
export function disableAnalyticsInPreview(): void {
    try {
        if (typeof window === "undefined") return;
        if (!isPreviewMode()) return;
        (window as unknown as { __KN_OPS_DISABLED__?: boolean }).__KN_OPS_DISABLED__ = true;
    } catch {
        /* 忽略 */
    }
}
