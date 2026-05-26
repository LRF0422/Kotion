package com.knowledge.wiki.service.cache;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.entity.vo.PageBlockVO;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;

/**
 * 块信息缓存服务
 */
@Component
public class BlockCacheService {

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    private static final String BLOCK_INFO_PREFIX = "wiki:block:info:";
    private static final String BLOCK_DETAIL_PREFIX = "wiki:block:detail:";
    private static final String PAGE_BLOCKS_PREFIX = "wiki:page:blocks:";
    private static final String BLOCK_PATH_PREFIX = "wiki:block:path:";
    private static final String PAGE_TREE_PREFIX = "wiki:page:tree:";

    private static final Duration BLOCK_INFO_TTL = Duration.ofHours(1);
    private static final Duration BLOCK_DETAIL_TTL = Duration.ofHours(1);
    private static final Duration PAGE_BLOCKS_TTL = Duration.ofMinutes(30);
    private static final Duration BLOCK_PATH_TTL = Duration.ofHours(2);
    private static final Duration PAGE_TREE_TTL = Duration.ofMinutes(30);

    /**
     * 缓存块基本信息
     */
    public void cacheBlockInfo(String blockId, PageBlockVO blockInfo) {
        if (StrUtil.isBlank(blockId) || blockInfo == null) {
            return;
        }
        String key = BLOCK_INFO_PREFIX + blockId;
        redisTemplate.opsForValue().set(key, JSONUtil.toJsonStr(blockInfo), BLOCK_INFO_TTL);
    }

    /**
     * 获取缓存的块基本信息
     */
    public PageBlockVO getCachedBlockInfo(String blockId) {
        if (StrUtil.isBlank(blockId)) {
            return null;
        }
        String key = BLOCK_INFO_PREFIX + blockId;
        String json = redisTemplate.opsForValue().get(key);
        return StrUtil.isNotBlank(json) ? JSONUtil.toBean(json, PageBlockVO.class) : null;
    }

    /**
     * 缓存块详细信息
     */
    public void cacheBlockDetail(String blockId, PageContent detail) {
        if (StrUtil.isBlank(blockId) || detail == null) {
            return;
        }
        String key = BLOCK_DETAIL_PREFIX + blockId;
        redisTemplate.opsForValue().set(key, JSONUtil.toJsonStr(detail), BLOCK_DETAIL_TTL);
    }

    /**
     * 获取缓存的块详细信息
     */
    public PageContent getCachedBlockDetail(String blockId) {
        if (StrUtil.isBlank(blockId)) {
            return null;
        }
        String key = BLOCK_DETAIL_PREFIX + blockId;
        String json = redisTemplate.opsForValue().get(key);
        return StrUtil.isNotBlank(json) ? JSONUtil.toBean(json, PageContent.class) : null;
    }

    /**
     * 缓存页面的所有块信息
     */
    public void cachePageBlocks(Long pageId, String blocksJson) {
        if (pageId == null || StrUtil.isBlank(blocksJson)) {
            return;
        }
        String key = PAGE_BLOCKS_PREFIX + pageId;
        redisTemplate.opsForValue().set(key, blocksJson, PAGE_BLOCKS_TTL);
    }

    /**
     * 获取缓存的页面块信息
     */
    public String getCachedPageBlocks(Long pageId) {
        if (pageId == null) {
            return null;
        }
        String key = PAGE_BLOCKS_PREFIX + pageId;
        return redisTemplate.opsForValue().get(key);
    }

    /**
     * 缓存块路径信息
     */
    public void cacheBlockPath(String blockId, String path) {
        if (StrUtil.isBlank(blockId) || StrUtil.isBlank(path)) {
            return;
        }
        String key = BLOCK_PATH_PREFIX + blockId;
        redisTemplate.opsForValue().set(key, path, BLOCK_PATH_TTL);
    }

    /**
     * 获取缓存的块路径
     */
    public String getCachedBlockPath(String blockId) {
        if (StrUtil.isBlank(blockId)) {
            return null;
        }
        String key = BLOCK_PATH_PREFIX + blockId;
        return redisTemplate.opsForValue().get(key);
    }

    // ==================== Assembled Tree Cache ====================

    /**
     * Cache the fully assembled page tree JSON.
     */
    public void cacheAssembledTree(Long pageId, String treeJson) {
        if (pageId == null || StrUtil.isBlank(treeJson)) {
            return;
        }
        String key = PAGE_TREE_PREFIX + pageId;
        redisTemplate.opsForValue().set(key, treeJson, PAGE_TREE_TTL);
    }

    /**
     * Get the cached assembled page tree JSON.
     */
    public String getCachedAssembledTree(Long pageId) {
        if (pageId == null) {
            return null;
        }
        String key = PAGE_TREE_PREFIX + pageId;
        return redisTemplate.opsForValue().get(key);
    }

    /**
     * Evict the assembled tree cache for a page.
     */
    public void evictAssembledTree(Long pageId) {
        if (pageId == null) {
            return;
        }
        redisTemplate.delete(PAGE_TREE_PREFIX + pageId);
    }

    /**
     * 清除块相关信息缓存
     */
    public void evictBlockCache(String blockId) {
        if (StrUtil.isBlank(blockId)) {
            return;
        }
        redisTemplate.delete(BLOCK_INFO_PREFIX + blockId);
        redisTemplate.delete(BLOCK_DETAIL_PREFIX + blockId);
        redisTemplate.delete(BLOCK_PATH_PREFIX + blockId);
    }

    /**
     * 清除页面相关缓存
     */
    public void evictPageCache(Long pageId) {
        if (pageId == null) {
            return;
        }
        redisTemplate.delete(PAGE_BLOCKS_PREFIX + pageId);

        // 清除该页面下所有块的缓存（可以根据需要实现）
        // 这里简化处理，实际项目中可以维护页面-块映射关系
    }

    /**
     * 清除所有块相关缓存
     */
    public void evictAllBlockCache() {
        redisTemplate.delete(redisTemplate.keys(BLOCK_INFO_PREFIX + "*"));
        redisTemplate.delete(redisTemplate.keys(BLOCK_DETAIL_PREFIX + "*"));
        redisTemplate.delete(redisTemplate.keys(PAGE_BLOCKS_PREFIX + "*"));
        redisTemplate.delete(redisTemplate.keys(BLOCK_PATH_PREFIX + "*"));
    }

    /**
     * 检查缓存是否存在
     */
    public boolean existsBlockInfo(String blockId) {
        if (StrUtil.isBlank(blockId)) {
            return false;
        }
        return Boolean.TRUE.equals(redisTemplate.hasKey(BLOCK_INFO_PREFIX + blockId));
    }

    /**
     * 获取缓存统计信息
     */
    public CacheStats getCacheStats() {
        CacheStats stats = new CacheStats();
        stats.setBlockInfoCount(redisTemplate.keys(BLOCK_INFO_PREFIX + "*").size());
        stats.setBlockDetailCount(redisTemplate.keys(BLOCK_DETAIL_PREFIX + "*").size());
        stats.setPageBlocksCount(redisTemplate.keys(PAGE_BLOCKS_PREFIX + "*").size());
        stats.setBlockPathCount(redisTemplate.keys(BLOCK_PATH_PREFIX + "*").size());
        return stats;
    }

    /**
     * 缓存统计信息类
     */
    public static class CacheStats {
        private int blockInfoCount;
        private int blockDetailCount;
        private int pageBlocksCount;
        private int blockPathCount;

        // getters and setters
        public int getBlockInfoCount() {
            return blockInfoCount;
        }

        public void setBlockInfoCount(int blockInfoCount) {
            this.blockInfoCount = blockInfoCount;
        }

        public int getBlockDetailCount() {
            return blockDetailCount;
        }

        public void setBlockDetailCount(int blockDetailCount) {
            this.blockDetailCount = blockDetailCount;
        }

        public int getPageBlocksCount() {
            return pageBlocksCount;
        }

        public void setPageBlocksCount(int pageBlocksCount) {
            this.pageBlocksCount = pageBlocksCount;
        }

        public int getBlockPathCount() {
            return blockPathCount;
        }

        public void setBlockPathCount(int blockPathCount) {
            this.blockPathCount = blockPathCount;
        }
    }
}