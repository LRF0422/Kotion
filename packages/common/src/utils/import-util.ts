// Extend Window interface to include custom __KN__ property
declare global {
    interface Window {
        ui: any,
        common: any,
        core: any,
        icon: any,
        editor: any
    }
}

export interface LoadOptions {
    /**
     * Force a fresh load: invalidate the in-memory cache entry and append a
     * cache-busting timestamp to the URL so the browser also bypasses HTTP cache.
     */
    bustCache?: boolean
    /**
     * Override the default script-load timeout (30 000 ms).
     */
    timeout?: number
}

/**
 * Robust plugin script loader.
 *
 * Improvements over the previous IIFE-based loader:
 * - **Concurrent-load deduplication** – if two callers request the same URL
 *   simultaneously they share a single Promise.
 * - **Timeout** – script loads that don't settle within `timeout` ms are
 *   rejected automatically.
 * - **Clean cache API** – `clearCache()`, `clearCacheByUrl()`, `invalidate()`.
 * - **Automatic cache-busting** – `bustCache` or a prior `invalidate()` call
 *   causes the next `load()` to append `_t=Date.now()` to the URL.
 */
export class PluginScriptLoader {
    private cache = new Map<string, any>()
    private pendingLoads = new Map<string, Promise<any>>()
    private defaultTimeout = 30_000
    /** URLs that have been explicitly invalidated; the next load() will bust the browser cache. */
    private invalidatedUrls = new Set<string>()

    /**
     * Load a plugin script.
     *
     * @param url         The script URL (without cache-busting params).
     * @param packageName The global variable name the plugin exposes on `window`.
     * @param name        Human-readable plugin name (for error messages).
     * @param options     Optional load configuration.
     */
    async load(url: string, packageName: string, name: string, options?: LoadOptions): Promise<any> {
        // Return cached value immediately unless busting cache
        if (!options?.bustCache && !this.invalidatedUrls.has(url) && this.cache.has(url)) {
            return this.cache.get(url)!
        }

        // Dedup concurrent loads for the same URL
        const pending = this.pendingLoads.get(url)
        if (pending && !options?.bustCache && !this.invalidatedUrls.has(url)) {
            return pending
        }

        const loadPromise = this._doLoad(url, packageName, name, options)
        this.pendingLoads.set(url, loadPromise)

        try {
            const result = await loadPromise
            return result
        } finally {
            this.pendingLoads.delete(url)
        }
    }

    private _doLoad(url: string, packageName: string, name: string, options?: LoadOptions): Promise<any> {
        const shouldBust = options?.bustCache || this.invalidatedUrls.has(url)
        // Clear the invalidated flag
        this.invalidatedUrls.delete(url)

        // When busting cache, append a timestamp to bypass browser HTTP cache
        const fetchUrl = shouldBust
            ? `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`
            : url

        const timeout = options?.timeout ?? this.defaultTimeout

        return new Promise<any>((resolve, reject) => {
            const script = document.createElement('script')
            script.setAttribute('src', fetchUrl)
            document.head.appendChild(script)

            // Timeout guard
            const timer = setTimeout(() => {
                cleanup()
                reject(new Error(`Plugin "${name}" load timed out after ${timeout}ms (${url})`))
            }, timeout)

            const onLoad = () => {
                cleanup()
                document.head.removeChild(script)
                const Com = (window as any)[packageName]
                if (!Com) {
                    reject(new Error(`Plugin ${packageName} not found in window scope`))
                    return
                }
                // Always cache under the original URL key (without timestamp)
                this.cache.set(url, Com)
                resolve(Com)
            }

            const onError = (error: Event | ErrorEvent) => {
                cleanup()
                document.head.removeChild(script)
                reject(error)
            }

            const cleanup = () => {
                clearTimeout(timer)
                script.removeEventListener('load', onLoad)
                script.removeEventListener('error', onError)
            }

            script.addEventListener('load', onLoad)
            script.addEventListener('error', onError)
        })
    }

    // ---- Cache management ----

    /** Clear all cached script entries. */
    clearCache(): void {
        this.cache.clear()
        this.invalidatedUrls.clear()
    }

    /** Clear a specific URL from the cache. */
    clearCacheByUrl(url: string): void {
        this.cache.delete(url)
        this.invalidatedUrls.delete(url)
    }

    /**
     * Invalidate a URL so the next `load()` call will bypass both the
     * in-memory cache and the browser HTTP cache.
     */
    invalidate(url: string): void {
        this.cache.delete(url)
        this.invalidatedUrls.add(url)
    }

    /**
     * Invalidate all cached URLs so the next `load()` call for any URL will
     * bypass both caches.
     */
    invalidateAll(): void {
        const urls = Array.from(this.cache.keys())
        this.cache.clear()
        urls.forEach(url => this.invalidatedUrls.add(url))
    }
}

// Singleton instance used throughout the application
export const pluginScriptLoader = new PluginScriptLoader()

/**
 * @deprecated Use `pluginScriptLoader.load()` instead.
 * Kept for backward compatibility – delegates to the singleton.
 */
export const importScript = (() => {
    const loader = (url: string, packageName: string, name: string, options?: LoadOptions) => {
        return pluginScriptLoader.load(url, packageName, name, options)
    }
    loader.clearCache = () => { pluginScriptLoader.clearCache() }
    loader.clearCacheByUrl = (url: string) => { pluginScriptLoader.clearCacheByUrl(url) }
    return loader as {
        (url: string, packageName: string, name: string, options?: LoadOptions): Promise<any>
        clearCache: () => void
        clearCacheByUrl: (url: string) => void
    }
})()
