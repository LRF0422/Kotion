/** Human-readable descriptions for the Zhihu Open Platform error codes. */
export const ZHIHU_ERROR_CODES: Record<number, string> = {
    0: "成功",
    10001: "参数错误",
    20001: "鉴权失败：请检查 Access Secret，并确认账号已开通对应能力",
    30001: "请求过于频繁（频率限制），请稍后重试",
    30002: "额度不足：今日限免额度已用完",
    40004: "知识库不存在",
    40005: "相同文件正在处理中",
    40006: "文件解析失败",
    90001: "知乎服务内部错误，请稍后重试",
};

export function zhihuErrorCodeMessage(code: number): string {
    return ZHIHU_ERROR_CODES[code] ?? "知乎接口返回错误码 " + code;
}

export class ZhihuApiError extends Error {
    readonly code: number;
    readonly raw?: unknown;

    constructor(code: number, message: string, raw?: unknown) {
        super(message);
        this.name = "ZhihuApiError";
        this.code = code;
        this.raw = raw;
    }

    get isAuthError(): boolean {
        return this.code === 20001;
    }

    get isRateLimited(): boolean {
        return this.code === 30001;
    }

    get isQuotaExceeded(): boolean {
        return this.code === 30002;
    }
}

export function describeZhihuError(error: unknown): string {
    if (error instanceof ZhihuApiError) return error.message;
    if (error instanceof Error) {
        if (error.name === "AbortError") return "请求已取消";
        return error.message;
    }
    return String(error ?? "未知错误");
}
