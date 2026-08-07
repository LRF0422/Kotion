import { i18n as i18nInstance } from "@kn/common";
import { CompactEmoji, fetchEmojis } from "emojibase";

/**
 * emoji 数据层：
 * - 数据集：emojibase CDN 按语言拉取，三级缓存 —— 内存 → localStorage → CDN，
 *   每种语言每会话最多请求一次网络，二次启动离线可用。
 * - 语言：跟随全局 i18n 实例，查询时读取，语言切换后下一次联想即时生效。
 * - 最近使用：localStorage 持久化，按 unicode 去重，上限 10 条；
 *   标签展示时按当前语言重新解析，跨语言切换不留旧语言残留。
 */

/** 联想面板单次最多展示的条目数 */
export const MAX_RESULTS = 20;
/** 无查询词且无最近使用时的默认推荐条数 */
const DEFAULT_COUNT = 10;
const MAX_RECENTS = 10;

/** emojibase 数据集的 locale 与全局 i18n 语言对齐（supportedLngs 仅 en/zh） */
export type EmojiLocale = "en" | "zh";

/** 数据集缓存 key 带版本号：emojibase 升级后 bump 一次即可失效旧缓存 */
const datasetCacheKey = (locale: EmojiLocale) => `kn:emoji-dataset:${locale}:v1`;
const RECENTS_KEY = "kn:recent-emojis";
/** 旧版本（mention 实现）的最近使用 key，读取时做一次性迁移 */
const LEGACY_RECENTS_KEY = "emojis";

/** 联想面板消费的最小 emoji 结构，与数据集存储结构解耦 */
export interface EmojiItem {
    unicode: string;
    label: string;
}

/** 调用时读取当前 UI 语言，语言切换无需刷新编辑器 */
export function currentEmojiLocale(): EmojiLocale {
    return i18nInstance?.language?.startsWith("zh") ? "zh" : "en";
}

const memoryCache = new Map<EmojiLocale, CompactEmoji[]>();
const inflight = new Map<EmojiLocale, Promise<CompactEmoji[]>>();

export function loadEmojis(locale: EmojiLocale): Promise<CompactEmoji[]> {
    const cached = memoryCache.get(locale);
    if (cached) return Promise.resolve(cached);
    const pending = inflight.get(locale);
    if (pending) return pending;

    const request = (async () => {
        try {
            const persisted = localStorage.getItem(datasetCacheKey(locale));
            if (persisted) {
                const parsed = JSON.parse(persisted) as CompactEmoji[];
                if (Array.isArray(parsed) && parsed.length) {
                    memoryCache.set(locale, parsed);
                    return parsed;
                }
            }
        } catch {
            /* 缓存损坏则回退到网络 */
        }

        const data = await fetchEmojis(locale, { compact: true });
        memoryCache.set(locale, data);
        try {
            localStorage.setItem(datasetCacheKey(locale), JSON.stringify(data));
        } catch {
            /* 超出配额时仅保留内存缓存 */
        }
        return data;
    })();

    inflight.set(locale, request);
    return request.finally(() => {
        inflight.delete(locale);
    });
}

export function getRecentEmojis(): EmojiItem[] {
    try {
        const raw = localStorage.getItem(RECENTS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as EmojiItem[];
            if (Array.isArray(parsed)) {
                return parsed.filter((item) => item?.unicode && item?.label);
            }
        }

        // 一次性迁移旧版本存储（CompactEmoji[]，可能含重复项）
        const legacy = localStorage.getItem(LEGACY_RECENTS_KEY);
        if (legacy) {
            const parsed = JSON.parse(legacy) as CompactEmoji[];
            const seen = new Set<string>();
            const migrated: EmojiItem[] = [];
            for (const item of parsed) {
                if (item?.unicode && item?.label && !seen.has(item.unicode)) {
                    seen.add(item.unicode);
                    migrated.push({ unicode: item.unicode, label: item.label });
                }
            }
            localStorage.setItem(RECENTS_KEY, JSON.stringify(migrated.slice(0, MAX_RECENTS)));
            localStorage.removeItem(LEGACY_RECENTS_KEY);
            return migrated;
        }
    } catch {
        /* 存储不可用时视为无最近使用 */
    }
    return [];
}

export function pushRecentEmoji(item: EmojiItem): void {
    try {
        const rest = getRecentEmojis().filter((recent) => recent.unicode !== item.unicode);
        localStorage.setItem(
            RECENTS_KEY,
            JSON.stringify([item, ...rest].slice(0, MAX_RECENTS))
        );
    } catch {
        /* 存储不可用时跳过 */
    }
}

/**
 * 搜索 emoji：数据集按当前 UI 语言加载，查询词匹配标签与标签组。
 * 查询词为空时返回最近使用（标签按当前语言重新解析）；
 * 无最近使用则给一组默认推荐。
 */
export async function searchEmojis(query: string): Promise<EmojiItem[]> {
    const dataset = await loadEmojis(currentEmojiLocale());
    const q = query.trim().toLowerCase();

    if (!q) {
        const recents = getRecentEmojis();
        if (!recents.length) {
            return dataset
                .slice(0, DEFAULT_COUNT)
                .map(({ unicode, label }) => ({ unicode, label }));
        }
        const labelByUnicode = new Map(dataset.map((emoji) => [emoji.unicode, emoji.label]));
        return recents.map((recent) => ({
            unicode: recent.unicode,
            label: labelByUnicode.get(recent.unicode) ?? recent.label,
        }));
    }

    return dataset
        .filter((emoji) => {
            if (emoji.label.toLowerCase().includes(q)) return true;
            return emoji.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false;
        })
        .slice(0, MAX_RESULTS)
        .map(({ unicode, label }) => ({ unicode, label }));
}
