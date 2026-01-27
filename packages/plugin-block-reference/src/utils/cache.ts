/**
 * Cache utilities for Block Reference Plugin
 * @module @kn/plugin-block-reference/utils/cache
 */

import { CACHE_TTL, CACHE_MAX_SIZE } from '../constants';
import type { BlockInfo, PageInfo } from '../types';

interface CacheItem<T> {
    value: T;
    timestamp: number;
}

/**
 * Simple LRU (Least Recently Used) Cache implementation
 * Provides automatic expiration and size limits
 */
export class LRUCache<T> {
    private cache: Map<string, CacheItem<T>>;
    private maxSize: number;
    private ttl: number;

    /**
     * Create a new LRU cache
     * @param maxSize - Maximum number of items (default: 50)
     * @param ttl - Time to live in milliseconds (default: 5 minutes)
     */
    constructor(maxSize = CACHE_MAX_SIZE, ttl = CACHE_TTL) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl;
    }

    /**
     * Get an item from cache
     * @param key - Cache key
     * @returns Cached value or null if not found/expired
     */
    get(key: string): T | null {
        const item = this.cache.get(key);
        if (!item) return null;

        // Check if expired
        if (Date.now() - item.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }

    /**
     * Set an item in cache
     * @param key - Cache key
     * @param value - Value to cache
     */
    set(key: string, value: T): void {
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(key, { value, timestamp: Date.now() });
    }

    /**
     * Check if key exists and is not expired
     * @param key - Cache key
     * @returns True if key exists and is valid
     */
    has(key: string): boolean {
        return this.get(key) !== null;
    }

    /**
     * Clear all cached items
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Invalidate a specific cache entry
     * @param key - Cache key to invalidate
     */
    invalidate(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Get cache size
     * @returns Number of items in cache
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Get all keys
     * @returns Array of cache keys
     */
    keys(): string[] {
        return Array.from(this.cache.keys());
    }
}

// Singleton cache instances for block and page data
export const blockCache = new LRUCache<BlockInfo>(CACHE_MAX_SIZE, CACHE_TTL);
export const pageCache = new LRUCache<PageInfo>(CACHE_MAX_SIZE, CACHE_TTL);

/**
 * Clear all plugin caches
 */
export function clearAllCaches(): void {
    blockCache.clear();
    pageCache.clear();
}

/**
 * Invalidate block from cache
 * @param blockId - Block ID to invalidate
 */
export function invalidateBlock(blockId: string): void {
    blockCache.invalidate(blockId);
}

/**
 * Invalidate page from cache
 * @param pageId - Page ID to invalidate
 */
export function invalidatePage(pageId: string): void {
    pageCache.invalidate(pageId);
}
