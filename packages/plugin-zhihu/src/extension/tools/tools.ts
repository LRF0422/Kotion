import { z } from "@kn/ui";
import type { Editor } from "@kn/editor";
import {
    loadZhihuConfig,
    toZhihuServiceOptions,
} from "../../hooks/use-zhihu-config";
import {
    askZhihu,
    getZhihuHotList,
    getZhihuQuota,
    searchZhihu,
    searchZhihuGlobal,
} from "../../services/zhihu-service";
import { describeZhihuError } from "../../services/zhihu-errors";

/**
 * AI tools for the Zhihu connector.
 *
 * Every tool resolves the plugin config lazily at call time and returns a
 * structured { success, error } result instead of throwing, so a missing or
 * invalid Access Secret never breaks the agent loop.
 */
export const zhihuSearchTool = {
    name: "zhihuSearch",
    description:
        "在知乎站内搜索问题、回答和文章，返回标题、摘要、作者、赞同数与原链接。适合查找中文社区的专业观点、经验与口碑。",
    readOnly: true,
    inputSchema: z.object({
        query: z.string().describe("搜索关键词，不能为空"),
        count: z.number().optional().describe("返回条数，1-10，默认取插件设置"),
    }),
    execute: (_editor: Editor) => async (params: { query: string; count?: number }) => {
        try {
            const config = await loadZhihuConfig();
            const result = await searchZhihu(
                toZhihuServiceOptions(config),
                params.query,
                params.count ?? config.defaultSearchCount,
            );
            return {
                success: true,
                count: result.items.length,
                hasMore: result.hasMore,
                emptyReason: result.emptyReason,
                items: result.items.map((item) => ({
                    title: item.title,
                    type: item.contentType,
                    url: item.url,
                    summary: item.contentText,
                    author: item.authorName,
                    voteUpCount: item.voteUpCount,
                    commentCount: item.commentCount,
                })),
            };
        } catch (error) {
            return { success: false, error: describeZhihuError(error) };
        }
    },
};

export const zhihuGlobalSearchTool = {
    name: "zhihuGlobalSearch",
    description:
        "知乎全网搜索：检索知乎站外中文网页内容，返回标题、摘要、作者与原链接。注意：该接口不覆盖 zhihu.com 站内内容，站内内容请用 zhihuSearch。",
    readOnly: true,
    inputSchema: z.object({
        query: z.string().describe("搜索关键词，不能为空"),
        count: z.number().optional().describe("返回条数，1-20，默认 10"),
    }),
    execute: (_editor: Editor) => async (params: { query: string; count?: number }) => {
        try {
            const config = await loadZhihuConfig();
            const result = await searchZhihuGlobal(
                toZhihuServiceOptions(config),
                params.query,
                params.count ?? 10,
            );
            return {
                success: true,
                count: result.items.length,
                hasMore: result.hasMore,
                items: result.items.map((item) => ({
                    title: item.title,
                    url: item.url,
                    summary: item.contentText,
                    author: item.authorName,
                })),
            };
        } catch (error) {
            return { success: false, error: describeZhihuError(error) };
        }
    },
};

export const zhihuHotListTool = {
    name: "zhihuHotList",
    description:
        "获取当前知乎热榜，返回问题/文章的标题、链接与摘要。适合了解当下中文互联网的热点话题。",
    readOnly: true,
    inputSchema: z.object({
        limit: z.number().optional().describe("返回条数，1-30，默认 30"),
    }),
    execute: (_editor: Editor) => async (params: { limit?: number }) => {
        try {
            const config = await loadZhihuConfig();
            const result = await getZhihuHotList(
                toZhihuServiceOptions(config),
                params.limit ?? 30,
            );
            return {
                success: true,
                total: result.total,
                items: result.items.map((item) => ({
                    title: item.title,
                    url: item.url,
                    summary: item.summary,
                })),
            };
        } catch (error) {
            return { success: false, error: describeZhihuError(error) };
        }
    },
};

export const zhihuAskTool = {
    name: "zhihuAsk",
    description:
        "调用知乎直答（Zhida）回答一个问题，返回答案正文与可选的推理过程。适合需要知乎视角的直接问答。",
    readOnly: true,
    inputSchema: z.object({
        query: z.string().describe("要提问的问题"),
        model: z
            .enum(["zhida-fast-1p5", "zhida-thinking-1p5", "zhida-agent"])
            .optional()
            .describe("直答模型，默认取插件设置（深度思考）"),
    }),
    execute: (_editor: Editor) => async (params: { query: string; model?: string }) => {
        try {
            const config = await loadZhihuConfig();
            const result = await askZhihu(
                toZhihuServiceOptions(config),
                params.query,
                params.model ?? config.askModel,
            );
            return {
                success: true,
                model: result.model,
                content: result.content,
                reasoningContent: result.reasoningContent,
                finishReason: result.finishReason,
            };
        } catch (error) {
            return { success: false, error: describeZhihuError(error) };
        }
    },
};

export const zhihuQuotaTool = {
    name: "zhihuQuota",
    description:
        "查询知乎开放平台各能力的当日剩余额度。不消耗业务额度，用于在批量调用前确认可用量。",
    readOnly: true,
    inputSchema: z.object({
        apiIds: z
            .array(z.string())
            .optional()
            .describe("要查询的 API ID 列表，缺省返回全部可展示额度"),
    }),
    execute: (_editor: Editor) => async (params: { apiIds?: string[] }) => {
        try {
            const config = await loadZhihuConfig();
            const items = await getZhihuQuota(
                toZhihuServiceOptions(config),
                params.apiIds,
            );
            return {
                success: true,
                items: items.map((item) => ({
                    apiId: item.apiId,
                    apiName: item.apiName,
                    remainQuota: item.remainQuota,
                    totalQuota: item.totalQuota,
                    totalUsed: item.totalUsed,
                })),
            };
        } catch (error) {
            return { success: false, error: describeZhihuError(error) };
        }
    },
};

export const zhihuTools = [
    zhihuSearchTool,
    zhihuGlobalSearchTool,
    zhihuHotListTool,
    zhihuAskTool,
    zhihuQuotaTool,
];
