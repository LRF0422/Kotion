interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

/** Minimal TTL cache shared by all Zhihu service calls. */
export class ZhihuCache {
    private store = new Map<string, CacheEntry<unknown>>();
    private defaultTtlMs: number;

    constructor(defaultTtlMs = 5 * 60 * 1000) {
        this.defaultTtlMs = defaultTtlMs;
    }

    get<T>(key: string): T | undefined {
        const hit = this.store.get(key);
        if (!hit) return undefined;
        if (hit.expiresAt < Date.now()) {
            this.store.delete(key);
            return undefined;
        }
        return hit.value as T;
    }

    set<T>(key: string, value: T, ttlMs?: number): void {
        this.store.set(key, {
            value,
            expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
        });
    }

    clear(): void {
        this.store.clear();
    }

    get size(): number {
        return this.store.size;
    }
}

export const zhihuCache = new ZhihuCache();
