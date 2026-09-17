import { PluginConfigStore, usePluginConfig } from "@kn/common";
import {
    DEFAULT_ZHIHU_CONFIG,
    ZHIHU_PLUGIN_KEY,
    type ZhihuPluginConfig,
} from "../types/config";
import type { ZhihuServiceOptions } from "../services/zhihu-service";

/** React hook used by the settings panel (auto-saves with a debounce). */
export function useZhihuConfig() {
    return usePluginConfig<ZhihuPluginConfig>({
        pluginKey: ZHIHU_PLUGIN_KEY,
        defaultConfig: DEFAULT_ZHIHU_CONFIG,
    });
}

/**
 * Non-hook config read for AI tools / services. Always merges defaults so a
 * partially-saved config still yields a usable object.
 */
export async function loadZhihuConfig(): Promise<ZhihuPluginConfig> {
    const store = PluginConfigStore.getInstance();
    await store.initialize();
    const saved = await store.getConfig<ZhihuPluginConfig>(ZHIHU_PLUGIN_KEY);
    return { ...DEFAULT_ZHIHU_CONFIG, ...(saved ?? {}) };
}

export function toZhihuServiceOptions(
    config: ZhihuPluginConfig,
): ZhihuServiceOptions {
    const ttlMinutes = Math.max(1, Number(config.cacheTTLMinutes) || 5);
    return {
        accessSecret: config.accessSecret,
        baseUrl: config.baseUrl,
        enableCache: config.enableCache !== false,
        cacheTtlMs: ttlMinutes * 60 * 1000,
    };
}
