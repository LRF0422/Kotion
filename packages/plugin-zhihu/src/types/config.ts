import type { PluginConfigData } from "@kn/common";

/** Storage key of the plugin settings panel; must match PluginSettingsConfig.key. */
export const ZHIHU_PLUGIN_KEY = "zhihu-settings";

export type ZhihuAskModel =
    | "zhida-fast-1p5"
    | "zhida-thinking-1p5"
    | "zhida-agent";

export interface ZhihuPluginConfig extends PluginConfigData {
    /** Zhihu Open Platform Access Secret (Bearer token). */
    accessSecret: string;
    /** Open Platform gateway; overridable for testing/proxying. */
    baseUrl: string;
    /** Client-side TTL cache in minutes. */
    cacheTTLMinutes: number;
    /** Toggle the client-side TTL cache. */
    enableCache: boolean;
    /** Default number of search results (1-10). */
    defaultSearchCount: number;
    /** Default Zhida model. */
    askModel: ZhihuAskModel;
}

export const DEFAULT_ZHIHU_CONFIG: ZhihuPluginConfig = {
    accessSecret: "",
    baseUrl: "https://developer.zhihu.com",
    cacheTTLMinutes: 5,
    enableCache: true,
    defaultSearchCount: 10,
    askModel: "zhida-thinking-1p5",
};
