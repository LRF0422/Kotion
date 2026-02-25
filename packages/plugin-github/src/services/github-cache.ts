interface CacheEntry<T> {
    data: T
    timestamp: number
    ttl: number
}

export class GitHubCache {
    private cache = new Map<string, CacheEntry<any>>()
    private defaultTTL: number

    constructor(defaultTTLMinutes: number = 5) {
        this.defaultTTL = defaultTTLMinutes * 60 * 1000
    }

    get<T>(key: string): T | null {
        const entry = this.cache.get(key)
        if (!entry) return null
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key)
            return null
        }
        return entry.data as T
    }

    set<T>(key: string, data: T, ttlMinutes?: number): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlMinutes ? ttlMinutes * 60 * 1000 : this.defaultTTL,
        })
    }

    invalidate(key: string): void {
        this.cache.delete(key)
    }

    invalidatePattern(pattern: string): void {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key)
            }
        }
    }

    clear(): void {
        this.cache.clear()
    }

    setDefaultTTL(minutes: number): void {
        this.defaultTTL = minutes * 60 * 1000
    }
}

export const githubCache = new GitHubCache()
