/**
 * Normalized Zhihu Open Platform DTOs.
 *
 * The upstream payload uses PascalCase keys (Title, ContentID, ...); the
 * service layer maps them into these camelCase shapes so UI and tools never
 * depend on the wire format.
 */

export interface ZhihuSearchItem {
    title: string;
    contentType: string;
    contentId: string;
    contentText: string;
    url: string;
    commentCount: number;
    voteUpCount: number;
    authorName: string;
    authorAvatar: string;
    authorBadgeText?: string;
    editTime?: number;
    rankingScore?: number;
}

export interface ZhihuSearchResult {
    hasMore: boolean;
    searchHashId?: string;
    emptyReason?: string;
    items: ZhihuSearchItem[];
}

export interface ZhihuHotItem {
    title: string;
    url: string;
    thumbnailUrl?: string;
    summary?: string;
}

export interface ZhihuHotListResult {
    total: number;
    items: ZhihuHotItem[];
}

export interface ZhihuQuotaItem {
    apiId: string;
    apiName: string;
    totalQuota: number;
    totalUsed: number;
    remainQuota: number;
}

export interface ZhihuAskResult {
    id?: string;
    model?: string;
    content: string;
    reasoningContent?: string;
    finishReason?: string;
}

/** Envelope used by the Open Platform data endpoints. */
export interface ZhihuApiEnvelope<T> {
    Code: number;
    Message: string;
    Data: T;
}
