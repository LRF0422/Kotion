import { PluginConfigStore, isSecretMask, usePluginConfig } from "@kn/common";
import {
    DEFAULT_ZHIHU_CONFIG,
    ZHIHU_PLUGIN_KEY,
    type ZhihuPluginConfig,
} from "../types/config";
import type { ZhihuServiceOptions } from "../services/zhihu-service";

/**
 * Credential fields of the Zhihu config. Declared so the storage layer keeps
 * the access secret out of localStorage and out of every server read.
 */
export const ZHIHU_SECRET_FIELDS = ["accessSecret"] as const;

/** React hook used by the settings panel (auto-saves with a debounce). */
export function useZhihuConfig() {
    return usePluginConfig<ZhihuPluginConfig>({
        pluginKey: ZHIHU_PLUGIN_KEY,
        defaultConfig: DEFAULT_ZHIHU_CONFIG,
        secretFields: ZHIHU_SECRET_FIELDS,
    });
}

/**
 * Non-hook config read for AI tools / services. Always merges defaults so a
 * partially-saved config still yields a usable object.
 *
 * The access secret is never persisted, so it is revealed from the server into
 * memory here. Callers must not keep the returned object anywhere durable.
 */
export async function loadZhihuConfig(): Promise<ZhihuPluginConfig> {
    const store = PluginConfigStore.getInstance();
    await store.initialize();
    const saved = await store.getConfig<ZhihuPluginConfig>(ZHIHU_PLUGIN_KEY);
    const config = { ...DEFAULT_ZHIHU_CONFIG, ...(saved ?? {}) };
    if (isSecretMask(config.accessSecret)) {
        config.accessSecret = await store.getSecret(
            ZHIHU_PLUGIN_KEY,
            "accessSecret",
        );
    }
    return config;
}

export function toZhihuServiceOptions(
    config: ZhihuPluginConfig,
): ZhihuServiceOptions {
    const ttlMinutes = Math.max(1, Number(config.cacheTTLMinutes) || 5);
    return {
        // A redaction mask is not a credential: it must never be sent as a
        // bearer token. Form-state callers get the real value through
        // `getSecret`/`loadZhihuConfig`.
        accessSecret: isSecretMask(config.accessSecret)
            ? ""
            : config.accessSecret,
        baseUrl: config.baseUrl,
        enableCache: config.enableCache !== false,
        cacheTtlMs: ttlMinutes * 60 * 1000,
    };
}
