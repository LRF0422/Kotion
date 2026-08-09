package com.knowledge.wiki.service.search;

import java.util.Arrays;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import javax.annotation.PostConstruct;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.entity.enums.PageStatus;
import com.knowledge.wiki.service.entity.vo.SearchHit;
import com.knowledge.wiki.service.service.IPageContentService;
import com.knowledge.wiki.service.service.IPageService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;
import redis.clients.jedis.UnifiedJedis;
import redis.clients.jedis.args.SortingOrder;
import redis.clients.jedis.exceptions.JedisConnectionException;
import redis.clients.jedis.search.FTCreateParams;
import redis.clients.jedis.search.FTSearchParams;
import redis.clients.jedis.search.IndexDataType;
import redis.clients.jedis.search.SearchResult;
import redis.clients.jedis.search.schemafields.NumericField;
import redis.clients.jedis.search.schemafields.SchemaField;
import redis.clients.jedis.search.schemafields.TagField;
import redis.clients.jedis.search.schemafields.TextField;

/**
 * Wiki full-text search service backed by Redis RediSearch.
 * <p>
 * Provides index management, real-time block sync, and search with automatic
 * fallback to MySQL LIKE when Redis is unavailable.
 * </p>
 */
@Service
@Slf4j
public class WikiSearchService {

    private static final String INDEX_NAME = "wiki_block_search";
    private static final String KEY_PREFIX = "wiki:block:search:";
    private static final int DEFAULT_LIMIT = 50;
    private static final int REINDEX_BATCH_SIZE = 500;

    @Autowired
    private UnifiedJedis jedis;

    @Autowired
    @Lazy
    private IPageService pageService;

    @Autowired
    private IPageContentService pageContentService;

    @Value("${knowledge.wiki.search.enabled:true}")
    private boolean searchEnabled;

    /**
     * Create the RediSearch index on startup if it does not already exist.
     */
    @PostConstruct
    public void init() {
        if (!searchEnabled) {
            log.info("Wiki search is disabled (knowledge.wiki.search.enabled=false)");
            return;
        }
        createIndexIfAbsent();
    }

    /**
     * Create the RediSearch index if it does not already exist.
     */
    public void createIndexIfAbsent() {
        try {
            // FT.CREATE wiki_block_search ON HASH PREFIX 1 wiki:block:search:
            // LANGUAGE chinese SCHEMA ...
            List<SchemaField> schema = Arrays.asList(
                    TextField.of("title"),
                    TextField.of("text"),
                    NumericField.of("pageId"),
                    NumericField.of("spaceId"),
                    TagField.of("type"),
                    TagField.of("status"),
                    NumericField.of("updateTime").sortable());

            jedis.ftCreate(INDEX_NAME,
                    FTCreateParams.createParams()
                            .on(IndexDataType.HASH)
                            .addPrefix(KEY_PREFIX)
                            .language("chinese"),
                    schema);
            log.info("Created RediSearch index: {}", INDEX_NAME);
        } catch (Exception e) {
            // "Index already exists" is expected on restart — not an error
            if (e.getMessage() != null && e.getMessage().contains("already exists")) {
                log.debug("RediSearch index already exists: {}", INDEX_NAME);
            } else {
                log.warn("Failed to create RediSearch index: {}", e.getMessage());
            }
        }
    }

    /**
     * Index (or re-index) a single block into Redis as a HASH document.
     */
    public void indexBlock(PageContent block, Long spaceId, String pageTitle, String status) {
        if (!searchEnabled || block == null || StrUtil.isBlank(block.getId())) {
            return;
        }
        // Only index blocks that have searchable text
        if (StrUtil.isBlank(block.getText())) {
            return;
        }
        try {
            Map<String, String> fields = new HashMap<>();
            fields.put("blockId", block.getId());
            fields.put("pageId", String.valueOf(block.getPageId()));
            fields.put("spaceId", String.valueOf(spaceId));
            fields.put("title", pageTitle != null ? pageTitle : "");
            fields.put("text", block.getText());
            fields.put("type", block.getType() != null ? block.getType() : "");
            fields.put("status", status != null ? status : PageStatus.ACTIVE.getValue());
            fields.put("updateTime", String.valueOf(System.currentTimeMillis()));

            jedis.hset(KEY_PREFIX + block.getId(), fields);
        } catch (Exception e) {
            log.warn("Failed to index block {}: {}", block.getId(), e.getMessage());
        }
    }

    /**
     * Remove a block from the search index.
     */
    public void deleteBlock(String blockId) {
        if (!searchEnabled || StrUtil.isBlank(blockId)) {
            return;
        }
        try {
            jedis.del(KEY_PREFIX + blockId);
        } catch (Exception e) {
            log.warn("Failed to delete block {} from search index: {}", blockId, e.getMessage());
        }
    }

    /**
     * Sync blocks to the search index after a patch operation.
     *
     * @param pageId     the page that was modified
     * @param upserts    blocks to index/update (may be empty)
     * @param deletedIds block IDs removed from storage (may be null)
     */
    public void syncBlocks(Long pageId, List<PageContent> upserts, Set<String> deletedIds) {
        if (!searchEnabled || pageId == null) {
            return;
        }
        try {
            // Fetch the page once for spaceId, status, and title
            Page page = pageService.getById(pageId);
            if (page == null) {
                log.debug("syncBlocks: page {} not found, skipping", pageId);
                return;
            }
            String status = page.getStatus() != null ? page.getStatus().getValue() : PageStatus.ACTIVE.getValue();
            String pageTitle = page.getTitle();
            Long spaceId = page.getSpaceId();

            // Index upserted blocks
            if (CollUtil.isNotEmpty(upserts)) {
                for (PageContent block : upserts) {
                    indexBlock(block, spaceId, pageTitle, status);
                }
            }

            // Delete removed blocks from index
            if (CollUtil.isNotEmpty(deletedIds)) {
                for (String blockId : deletedIds) {
                    deleteBlock(blockId);
                }
            }
        } catch (Exception e) {
            log.warn("syncBlocks failed for pageId={}: {}", pageId, e.getMessage());
        }
    }

    /**
     * Remove blocks of a page that are no longer present in the new document
     * (used after bulkReplaceBlocks deletes orphans).
     *
     * @param pageId  the page ID
     * @param keepIds block IDs that should remain; all others are evicted
     */
    public void removePageOrphans(Long pageId, Set<String> keepIds) {
        if (!searchEnabled || pageId == null) {
            return;
        }
        try {
            // Search for all blocks of this page using query string filter
            String pageQuery = "@pageId:[" + pageId + " " + pageId + "]";
            FTSearchParams params = FTSearchParams.searchParams()
                    .limit(0, 10000)
                    .noContent();
            SearchResult result = jedis.ftSearch(INDEX_NAME, pageQuery, params);
            if (result == null || result.getDocuments() == null) {
                return;
            }
            for (redis.clients.jedis.search.Document doc : result.getDocuments()) {
                // doc.getId() returns the full key: "wiki:block:search:{blockId}"
                String fullKey = doc.getId();
                String blockId = fullKey.substring(KEY_PREFIX.length());
                if (keepIds == null || !keepIds.contains(blockId)) {
                    deleteBlock(blockId);
                }
            }
        } catch (Exception e) {
            log.warn("removePageOrphans failed for pageId={}: {}", pageId, e.getMessage());
        }
    }

    /**
     * Remove all indexed blocks for a page (used when page is trashed/deleted).
     */
    public void evictPage(Long pageId) {
        if (!searchEnabled || pageId == null) {
            return;
        }
        try {
            String pageQuery = "@pageId:[" + pageId + " " + pageId + "]";
            FTSearchParams params = FTSearchParams.searchParams()
                    .limit(0, 10000)
                    .noContent();
            SearchResult result = jedis.ftSearch(INDEX_NAME, pageQuery, params);
            if (result == null || result.getDocuments() == null) {
                return;
            }
            for (redis.clients.jedis.search.Document doc : result.getDocuments()) {
                String fullKey = doc.getId();
                jedis.del(fullKey);
            }
            log.debug("Evicted {} blocks from search index for pageId={}",
                    result.getTotalResults(), pageId);
        } catch (Exception e) {
            log.warn("evictPage failed for pageId={}: {}", pageId, e.getMessage());
        }
    }

    /**
     * Search blocks by keyword using RediSearch.
     *
     * @param keyword search term
     * @param pageId  optional page filter (null = all pages)
     * @param spaceId optional space filter (null = all spaces)
     * @param limit   max results
     * @return list of search hits, or empty list on error
     */
    public List<SearchHit> search(String keyword, Long pageId, Long spaceId, int limit) {
        if (!searchEnabled || StrUtil.isBlank(keyword)) {
            return new ArrayList<>();
        }

        try {
            // Build query string
            // Escape special characters and wrap in @text: for text field search
            String escapedKeyword = escapeQuery(keyword);
            StringBuilder query = new StringBuilder();
            query.append("@text:").append(escapedKeyword);

            // Add filters
            if (pageId != null) {
                query.append(" @pageId:[").append(pageId).append(" ").append(pageId).append("]");
            }
            if (spaceId != null) {
                query.append(" @spaceId:[").append(spaceId).append(" ").append(spaceId).append("]");
            }
            // Always exclude trashed/deleted pages
            query.append(" @status:{ACTIVE|DRAFT}");

            FTSearchParams params = FTSearchParams.searchParams()
                    .limit(0, limit > 0 ? limit : DEFAULT_LIMIT)
                    .sortBy("updateTime", SortingOrder.DESC);

            SearchResult result = jedis.ftSearch(INDEX_NAME, query.toString(), params);
            if (result == null || result.getDocuments() == null) {
                return new ArrayList<>();
            }

            List<SearchHit> hits = new ArrayList<>();
            for (redis.clients.jedis.search.Document doc : result.getDocuments()) {
                SearchHit hit = new SearchHit();
                String fullKey = doc.getId();
                hit.setBlockId(fullKey.substring(KEY_PREFIX.length()));
                hit.setPageId(parseLong((String) doc.get("pageId")));
                hit.setSpaceId(parseLong((String) doc.get("spaceId")));
                hit.setPageTitle((String) doc.get("title"));
                hit.setText((String) doc.get("text"));
                hit.setType((String) doc.get("type"));
                hit.setStatus((String) doc.get("status"));
                hit.setUpdateTime(parseLong((String) doc.get("updateTime")));
                hits.add(hit);
            }

            log.debug("RediSearch for '{}' returned {} results", keyword, hits.size());
            return hits;
        } catch (JedisConnectionException e) {
            log.warn("Redis search connection failed, falling back to MySQL: {}", e.getMessage());
            return new ArrayList<>();
        } catch (Exception e) {
            log.warn("Redis search failed for keyword '{}': {}", keyword, e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * Drop and recreate the index, then re-index all blocks from MySQL.
     *
     * @return number of blocks indexed
     */
    public int reindexAll() {
        if (!searchEnabled) {
            return 0;
        }

        log.info("Starting full reindex of wiki blocks...");
        int totalIndexed = 0;

        try {
            // Drop existing index
            try {
                jedis.ftDropIndex(INDEX_NAME);
                log.info("Dropped existing index: {}", INDEX_NAME);
            } catch (Exception e) {
                log.debug("Index does not exist yet, skipping drop: {}", e.getMessage());
            }

            // Recreate index
            createIndexIfAbsent();

            // Batch scan all blocks and index them
            int offset = 0;
            while (true) {
                List<PageContent> batch = pageContentService.lambdaQuery()
                        .last("LIMIT " + offset + ", " + REINDEX_BATCH_SIZE)
                        .list();

                if (CollUtil.isEmpty(batch)) {
                    break;
                }

                // Collect pageIds for this batch
                Set<Long> pageIds = batch.stream()
                        .map(PageContent::getPageId)
                        .filter(java.util.Objects::nonNull)
                        .collect(Collectors.toSet());

                // Fetch pages for spaceId/status/title
                Map<Long, Page> pageMap = new HashMap<>();
                if (CollUtil.isNotEmpty(pageIds)) {
                    List<Page> pages = pageService.listByIds(pageIds);
                    for (Page p : pages) {
                        pageMap.put(p.getId(), p);
                    }
                }

                // Index each block
                for (PageContent block : batch) {
                    Page page = block.getPageId() != null ? pageMap.get(block.getPageId()) : null;
                    Long spaceId = page != null ? page.getSpaceId() : null;
                    String title = page != null ? page.getTitle() : "";
                    String status = page != null && page.getStatus() != null
                            ? page.getStatus().getValue()
                            : PageStatus.ACTIVE.getValue();

                    if (StrUtil.isNotBlank(block.getText())) {
                        try {
                            Map<String, String> fields = new HashMap<>();
                            fields.put("blockId", block.getId());
                            fields.put("pageId", String.valueOf(block.getPageId()));
                            fields.put("spaceId", String.valueOf(spaceId));
                            fields.put("title", title != null ? title : "");
                            fields.put("text", block.getText());
                            fields.put("type", block.getType() != null ? block.getType() : "");
                            fields.put("status", status);
                            fields.put("updateTime", String.valueOf(System.currentTimeMillis()));
                            jedis.hset(KEY_PREFIX + block.getId(), fields);
                            totalIndexed++;
                        } catch (Exception e) {
                            log.debug("Failed to index block {}: {}", block.getId(), e.getMessage());
                        }
                    }
                }

                offset += REINDEX_BATCH_SIZE;
                log.info("Reindexed {} blocks so far...", totalIndexed);

                if (batch.size() < REINDEX_BATCH_SIZE) {
                    break;
                }
            }

            log.info("Full reindex complete: {} blocks indexed", totalIndexed);
        } catch (Exception e) {
            log.error("Full reindex failed: {}", e.getMessage(), e);
        }

        return totalIndexed;
    }

    /**
     * Check if Redis search is available (index exists and Redis is reachable).
     */
    public boolean isAvailable() {
        if (!searchEnabled) {
            return false;
        }
        try {
            jedis.ftInfo(INDEX_NAME);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Escape special characters in a RediSearch query string.
     * RediSearch reserves: , . & * + - | ( ) [ ] { } : " ~ # @ !
     */
    private String escapeQuery(String keyword) {
        if (keyword == null) {
            return "";
        }
        // Wrap the keyword in quotes for phrase search — this handles
        // multi-word queries and most special characters safely.
        // Double-quotes inside the keyword are escaped with backslash.
        String escaped = keyword.replace("\\", "\\\\").replace("\"", "\\\"");
        return "\"" + escaped + "\"";
    }

    private Long parseLong(String value) {
        if (StrUtil.isBlank(value)) {
            return null;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
