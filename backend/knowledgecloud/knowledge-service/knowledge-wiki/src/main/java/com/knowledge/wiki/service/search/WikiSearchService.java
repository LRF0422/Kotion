package com.knowledge.wiki.service.search;

import java.util.ArrayList;
import java.util.Arrays;
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

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.entity.enums.PageStatus;
import com.knowledge.wiki.service.entity.vo.SearchHit;
import com.knowledge.wiki.service.mapper.WikiBlockMapper;
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

/** Redis full-text projection of the authoritative {@code wiki_block} store. */
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
    private WikiBlockMapper wikiBlockMapper;

    @Value("${knowledge.wiki.search.enabled:true}")
    private boolean searchEnabled;

    @PostConstruct
    public void init() {
        if (!searchEnabled) {
            log.info("Wiki search is disabled (knowledge.wiki.search.enabled=false)");
            return;
        }
        createIndexIfAbsent();
    }

    public void createIndexIfAbsent() {
        try {
            List<SchemaField> schema = Arrays.asList(
                    TextField.of("title"),
                    TextField.of("text"),
                    NumericField.of("pageId"),
                    NumericField.of("spaceId"),
                    TagField.of("type"),
                    TagField.of("status"),
                    NumericField.of("rev"),
                    NumericField.of("updateTime").sortable());

            jedis.ftCreate(INDEX_NAME,
                    FTCreateParams.createParams()
                            .on(IndexDataType.HASH)
                            .addPrefix(KEY_PREFIX)
                            .language("chinese"),
                    schema);
            log.info("Created RediSearch index: {}", INDEX_NAME);
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("already exists")) {
                log.debug("RediSearch index already exists: {}", INDEX_NAME);
            } else {
                log.warn("Failed to create RediSearch index: {}", e.getMessage());
            }
        }
    }

    public boolean indexBlock(WikiBlock block, Page page) {
        if (!searchEnabled || block == null || page == null || StrUtil.isBlank(block.getBlockId())
                || StrUtil.isBlank(block.getText())) {
            return false;
        }
        try {
            Map<String, String> fields = new HashMap<>();
            fields.put("blockId", block.getBlockId());
            fields.put("pageId", String.valueOf(block.getPageId()));
            fields.put("spaceId", page.getSpaceId() == null ? "" : String.valueOf(page.getSpaceId()));
            fields.put("title", StrUtil.nullToEmpty(page.getTitle()));
            fields.put("text", block.getText());
            fields.put("type", StrUtil.nullToEmpty(block.getType()));
            fields.put("status", page.getStatus() == null ? PageStatus.ACTIVE.getValue() : page.getStatus().getValue());
            long updateTime = page.getUpdateTime() == null
                    ? System.currentTimeMillis()
                    : java.sql.Timestamp.valueOf(page.getUpdateTime()).getTime();
            fields.put("updateTime", String.valueOf(updateTime));
            fields.put("rev", block.getRev() == null ? "0" : String.valueOf(block.getRev()));
            jedis.hset(KEY_PREFIX + block.getBlockId(), fields);
            return true;
        } catch (Exception e) {
            log.warn("Failed to index wiki_block {}: {}", block.getBlockId(), e.getMessage());
            return false;
        }
    }

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

    /** Rebuild one page projection from wiki_block, removing stale legacy hashes first. */
    public int reindexPage(Long pageId) {
        if (!searchEnabled || pageId == null) {
            return 0;
        }
        if (!evictPageInternal(pageId)) {
            throw new IllegalStateException("failed to evict the existing page search projection");
        }
        Page page = pageService.getById(pageId);
        if (!isSearchable(page)) {
            return 0;
        }
        List<WikiBlock> rows = wikiBlockMapper.selectList(new LambdaQueryWrapper<WikiBlock>()
                .eq(WikiBlock::getPageId, pageId));
        int indexed = 0;
        boolean failed = false;
        for (WikiBlock row : rows) {
            if (StrUtil.isBlank(row.getText())) {
                continue;
            }
            if (indexBlock(row, page)) {
                indexed++;
            } else {
                failed = true;
            }
        }
        if (failed) {
            throw new IllegalStateException("page search projection was only partially indexed");
        }
        return indexed;
    }

    /**
     * Compatibility hook for retired wiki_page_block writers. The supplied legacy
     * payload is intentionally ignored so it can never repopulate Redis with stale
     * rows; the projection is always rebuilt from wiki_block.
     */
    public void syncBlocks(Long pageId, List<?> ignoredUpserts, Set<String> ignoredDeletedIds) {
        reindexPage(pageId);
    }

    /** Compatibility hook with authoritative semantics. */
    public void removePageOrphans(Long pageId, Set<String> ignoredKeepIds) {
        reindexPage(pageId);
    }

    public void evictPage(Long pageId) {
        evictPageInternal(pageId);
    }

    private boolean evictPageInternal(Long pageId) {
        if (!searchEnabled || pageId == null) {
            return true;
        }
        try {
            String pageQuery = "@pageId:[" + pageId + " " + pageId + "]";
            while (true) {
                FTSearchParams params = FTSearchParams.searchParams().limit(0, 10000).noContent();
                SearchResult result = jedis.ftSearch(INDEX_NAME, pageQuery, params);
                if (result == null || result.getDocuments() == null || result.getDocuments().isEmpty()) {
                    return true;
                }
                for (redis.clients.jedis.search.Document doc : result.getDocuments()) {
                    jedis.del(doc.getId());
                }
                if (result.getDocuments().size() < 10000) {
                    return true;
                }
            }
        } catch (Exception e) {
            log.warn("evictPage failed for pageId={}: {}", pageId, e.getMessage());
            return false;
        }
    }

    public List<SearchHit> search(String keyword, Long pageId, Long spaceId, int limit) {
        if (!searchEnabled || StrUtil.isBlank(keyword)) {
            return new ArrayList<>();
        }
        try {
            StringBuilder query = new StringBuilder("@text:").append(escapeQuery(keyword));
            if (pageId != null) {
                query.append(" @pageId:[").append(pageId).append(" ").append(pageId).append("]");
            }
            if (spaceId != null) {
                query.append(" @spaceId:[").append(spaceId).append(" ").append(spaceId).append("]");
            }
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
                hit.setBlockId(doc.getId().substring(KEY_PREFIX.length()));
                hit.setPageId(parseLong((String) doc.get("pageId")));
                hit.setSpaceId(parseLong((String) doc.get("spaceId")));
                hit.setPageTitle((String) doc.get("title"));
                hit.setText((String) doc.get("text"));
                hit.setType((String) doc.get("type"));
                hit.setStatus((String) doc.get("status"));
                hit.setUpdateTime(parseLong((String) doc.get("updateTime")));
                hits.add(hit);
            }
            return hits;
        } catch (JedisConnectionException e) {
            log.warn("Redis search connection failed, falling back to MySQL: {}", e.getMessage());
            return new ArrayList<>();
        } catch (Exception e) {
            log.warn("Redis search failed for keyword '{}': {}", keyword, e.getMessage());
            return new ArrayList<>();
        }
    }

    /** Drop and rebuild the complete index from wiki_block and wiki_page metadata. */
    public int reindexAll() {
        if (!searchEnabled) {
            return 0;
        }
        log.info("Starting full reindex from wiki_block...");
        int totalIndexed = 0;
        try {
            try {
                Set<String> oldKeys = jedis.keys(KEY_PREFIX + "*");
                if (CollUtil.isNotEmpty(oldKeys)) {
                    jedis.del(oldKeys.toArray(new String[0]));
                }
                jedis.ftDropIndex(INDEX_NAME);
            } catch (Exception e) {
                log.debug("Search projection cleanup skipped or partial: {}", e.getMessage());
            }
            createIndexIfAbsent();

            int offset = 0;
            while (true) {
                List<WikiBlock> batch = wikiBlockMapper.selectList(new LambdaQueryWrapper<WikiBlock>()
                        .orderByAsc(WikiBlock::getBlockId)
                        .last("LIMIT " + offset + ", " + REINDEX_BATCH_SIZE));
                if (CollUtil.isEmpty(batch)) {
                    break;
                }

                Set<Long> pageIds = batch.stream().map(WikiBlock::getPageId)
                        .filter(java.util.Objects::nonNull).collect(Collectors.toSet());
                Map<Long, Page> pages = CollUtil.isEmpty(pageIds) ? new HashMap<>()
                        : pageService.listByIds(pageIds).stream()
                                .collect(Collectors.toMap(Page::getId, page -> page, (left, right) -> left));
                for (WikiBlock block : batch) {
                    Page page = pages.get(block.getPageId());
                    if (isSearchable(page) && StrUtil.isNotBlank(block.getText())) {
                        if (!indexBlock(block, page)) {
                            throw new IllegalStateException("full search reindex was only partially written");
                        }
                        totalIndexed++;
                    }
                }
                offset += REINDEX_BATCH_SIZE;
                if (batch.size() < REINDEX_BATCH_SIZE) {
                    break;
                }
            }
            log.info("Full wiki_block reindex complete: {} blocks indexed", totalIndexed);
        } catch (Exception e) {
            log.error("Full wiki_block reindex failed", e);
        }
        return totalIndexed;
    }

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

    private static boolean isSearchable(Page page) {
        return page != null && page.getStatus() != PageStatus.TRASH && page.getStatus() != PageStatus.DELETED;
    }

    private String escapeQuery(String keyword) {
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
