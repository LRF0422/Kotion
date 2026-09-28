import {
    KPlugin,
    liftLegacySkills,
    liftLegacyTools,
    type PluginConfig,
} from "@kn/common";
import React from "react";
import {
    ZhihuExtension,
    zhihuAskTool,
    zhihuGlobalSearchTool,
    zhihuHotListTool,
    zhihuQuotaTool,
    zhihuResearcherSkill,
    zhihuSearchTool,
} from "./extension";
import { ZhihuSettings } from "./components/ZhihuSettings";
import { ZhihuLogo } from "./components/ZhihuLogo";

interface ZhihuKPluginConfig extends PluginConfig {}

class ZhihuPlugin extends KPlugin<ZhihuKPluginConfig> {
    static pluginName = "zhihu";
    static command = "zhihu";
}

export const zhihu = new ZhihuPlugin({
    name: "zhihu",
    status: "ACTIVE",
    editorExtension: [ZhihuExtension],
    agent: {
        agents: [
            {
                id: "zhihu-researcher",
                name: "知乎调研员",
                description:
                    "在知乎开放平台上做中文社区调研与知乎直答：站内搜索、全网搜索、热榜、直答、额度查询，输出带来源链接的结论。当用户需要知乎上的观点/经验/热点，或要求引用知乎来源时委派给它。",
                scope: "any",
                systemPrompt: [
                    "你是知乎调研员，只通过知乎开放平台获取公开信息，并整理成可引用的结论。",
                    "优先用 zhihuSearch 检索知乎站内的问答、回答与文章；只有站外中文网页才用 zhihuGlobalSearch。需要当下热点用 zhihuHotList，需要知乎视角的直接回答用 zhihuAsk。",
                    "不要编造内容：每条结论都必须附上标题与原链接；工具返回 success=false 时如实说明错误，并建议用户到「设置 → 知乎」检查 Access Secret。",
                    "批量调用前先用 zhihuQuota 确认剩余额度，避免超额。",
                    "完成后用中文简短汇报：检索了什么、得到哪些带链接的要点，以及是否受到额度或鉴权限制。",
                ].join("\n"),
                tools: liftLegacyTools(
                    [
                        zhihuSearchTool,
                        zhihuGlobalSearchTool,
                        zhihuHotListTool,
                        zhihuAskTool,
                        zhihuQuotaTool,
                    ],
                    { scope: "any" },
                ),
                skills: liftLegacySkills([zhihuResearcherSkill]),
            },
        ],
    },
    settings: {
        key: "zhihu-settings",
        label: "知乎",
        description: "知乎开放平台连接器：搜索、热榜、直答与额度",
        icon: React.createElement(ZhihuLogo, { size: 16 }),
        component: ZhihuSettings,
    },
    locales: {
        zh: {
            translation: {
                zhihu: {
                    title: "知乎",
                    description: "知乎开放平台连接器",
                    brand: {
                        title: "知乎开放平台",
                        description:
                            "连接知乎数据开放平台（developer.zhihu.com），为编辑器与 AI Agent 提供站内搜索、热榜、直答与额度查询。",
                    },
                    auth: {
                        title: "鉴权",
                        description: "使用知乎开放平台个人中心申请到的 Access Secret",
                        secretLabel: "Access Secret",
                        secretPlaceholder: "在 developer.zhihu.com 个人中心获取",
                        secretConfiguredPlaceholder: "已配置（留空保持不变）",
                        show: "显示密钥",
                        hide: "隐藏密钥",
                        test: "测试连接",
                        testing: "测试中…",
                        success: "连接成功，账号可用。",
                        failure: "连接失败",
                        hint: "密钥加密存储在服务端，本地不保存明文。输入新值可替换，留空保持不变。",
                        baseUrlLabel: "服务地址",
                    },
                    quota: {
                        title: "额度",
                        description: "知乎按自然日提供限免额度，此处查询剩余量",
                        refresh: "刷新额度",
                        refreshing: "刷新中…",
                        empty: "接口未返回额度信息。",
                        remaining: "剩余 {{remain}} / {{total}}",
                        unknownCapability: "未知能力",
                        saving: "保存中…",
                        dirty: "有未保存的修改",
                    },
                    behavior: {
                        title: "行为",
                        description: "搜索条数、缓存与直答模型",
                        searchCount: "默认搜索条数（1-10）",
                        model: "直答模型",
                        modelFast: "快速",
                        modelThinking: "深度思考",
                        modelAgent: "智能体",
                        cache: "启用本地缓存",
                        cacheHint: "相同关键词在 TTL 内复用结果，减少额度消耗",
                        cacheTtl: "缓存时长（分钟）",
                    },
                    features: {
                        search: "站内搜索",
                        hot: "热榜",
                        ask: "直答",
                    },
                    hot: {
                        title: "知乎热榜",
                        refresh: "刷新",
                        remove: "移除",
                        loading: "正在获取知乎热榜…",
                        empty: "暂无热榜数据",
                        retry: "重试",
                        updatedAt: "更新于 {{time}}",
                        source: "数据来自知乎开放平台",
                    },
                    saveError: "保存失败：{{message}}",
                },
            },
        },
        en: {
            translation: {
                zhihu: {
                    title: "Zhihu",
                    description: "Zhihu Open Platform connector",
                    brand: {
                        title: "Zhihu Open Platform",
                        description:
                            "Connect to the Zhihu data platform (developer.zhihu.com) to give the editor and the AI agent on-site search, hot list, Zhida answers and quota lookup.",
                    },
                    auth: {
                        title: "Authentication",
                        description:
                            "Use the Access Secret issued in your Zhihu Open Platform profile",
                        secretLabel: "Access Secret",
                        secretPlaceholder: "Get it at developer.zhihu.com",
                        secretConfiguredPlaceholder: "Configured — leave blank to keep",
                        show: "Show secret",
                        hide: "Hide secret",
                        test: "Test connection",
                        testing: "Testing…",
                        success: "Connected. The account is available.",
                        failure: "Connection failed",
                        hint: "The secret is encrypted on the server and never stored locally in the clear. Enter a new value to replace it, or leave it blank to keep it.",
                        baseUrlLabel: "Service base URL",
                    },
                    quota: {
                        title: "Quota",
                        description:
                            "Zhihu grants a free daily quota per capability; check what is left here",
                        refresh: "Refresh quota",
                        refreshing: "Refreshing…",
                        empty: "The API returned no quota information.",
                        remaining: "{{remain}} / {{total}} left",
                        unknownCapability: "Unknown capability",
                        saving: "Saving…",
                        dirty: "Unsaved changes",
                    },
                    behavior: {
                        title: "Behavior",
                        description: "Search size, cache and Zhida model",
                        searchCount: "Default result count (1-10)",
                        model: "Zhida model",
                        modelFast: "Fast",
                        modelThinking: "Deep thinking",
                        modelAgent: "Agent",
                        cache: "Enable local cache",
                        cacheHint:
                            "Reuse results for the same query within the TTL to save quota",
                        cacheTtl: "Cache TTL (minutes)",
                    },
                    features: {
                        search: "On-site search",
                        hot: "Hot list",
                        ask: "Zhida answer",
                    },
                    hot: {
                        title: "Zhihu Hot List",
                        refresh: "Refresh",
                        remove: "Remove",
                        loading: "Loading the Zhihu hot list…",
                        empty: "No hot list data yet",
                        retry: "Retry",
                        updatedAt: "Updated {{time}}",
                        source: "Data from the Zhihu Open Platform",
                    },
                    saveError: "Save failed: {{message}}",
                },
            },
        },
    },
});

export { ZhihuSettings } from "./components/ZhihuSettings";
export { ZhihuLogo } from "./components/ZhihuLogo";
export type { ZhihuLogoProps } from "./components/ZhihuLogo";

export { ZHIHU_PLUGIN_KEY, DEFAULT_ZHIHU_CONFIG } from "./types/config";
export type { ZhihuPluginConfig, ZhihuAskModel } from "./types/config";

export * from "./types/zhihu";
export * from "./services/zhihu-client";
export * from "./services/zhihu-errors";
export * from "./services/zhihu-service";
export * from "./extension";
