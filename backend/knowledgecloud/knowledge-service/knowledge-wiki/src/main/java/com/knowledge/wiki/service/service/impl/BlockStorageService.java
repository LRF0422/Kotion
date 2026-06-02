package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.wiki.service.cache.BlockCacheService;
import com.knowledge.wiki.service.entity.BlockVersion;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.entity.dto.BlockPatchItemDTO;
import com.knowledge.wiki.service.mapper.PageContentMapper;
import com.knowledge.wiki.service.service.IBlockVersionService;
import com.knowledge.wiki.service.service.IPageContentService;
import com.knowledge.wiki.service.service.IPageVersionService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.json.JSONUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Block-first storage service.
 * <p>
 * Handles flattening a page tree into individual block rows (save),
 * assembling block rows back into a tree (read), and single-block upsert.
 * </p>
 */
@Service
@Slf4j
public class BlockStorageService {

    private static final String ROOT_PARENT_ID = "root";

    /**
     * Batch size for save/update operations. Larger batches reduce round-trips
     * but require MySQL JDBC `rewriteBatchedStatements=true` to fully benefit.
     */
    private static final int BATCH_SIZE = 1000;

    /**
     * Dedicated ObjectMapper for deterministic content hashing.
     * Configured once with sorted keys to ensure stable hash output
     * regardless of insertion order in attrs/content maps.
     */
    private static final ObjectMapper HASH_MAPPER;
    static {
        HASH_MAPPER = new ObjectMapper();
        HASH_MAPPER.configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true);
        HASH_MAPPER.configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
        // Nulls are serialized as "null" — consistent across all blocks
        HASH_MAPPER.configure(SerializationFeature.WRITE_NULL_MAP_VALUES, true);
    }

    @Autowired
    private IPageContentService pageContentService;

    @Autowired
    private PageContentMapper pageContentMapper;

    @Autowired
    private BlockCacheService blockCacheService;

    @Autowired
    private IBlockVersionService blockVersionService;

    /**
     * {@code @Lazy} to avoid circular construction:
     * {@code PageVersionServiceImpl -> IPageSnapshotService -> PageSnapshotServiceImpl -> BlockStorageService}.
     * The proxy is only resolved on first call inside
     * {@link #persistPatch}.
     */
    @Autowired
    @Lazy
    private IPageVersionService pageVersionService;

    private final BlockChangeRecorder changeRecorder = new BlockChangeRecorder();

    /**
     * Self-injection (via proxy) so methods that have already done CPU-only work
     * outside a transaction can still invoke @Transactional methods via the
     * Spring proxy. Needed because self-invocation bypasses AOP.
     */
    @Autowired
    @Lazy
    private BlockStorageService self;

    // ==================== Flatten & Save ====================

    /**
     * Flatten a page content tree and persist each block as an individual row.
     * Existing blocks for this page that are no longer in the tree will be removed.
     *
     * @param pageId the page ID
     * @param root   the root PageContent tree node
     */
    public void flattenAndSave(Long pageId, PageContent root) {
        if (pageId == null || root == null) {
            return;
        }

        // CPU-heavy: flatten tree OUTSIDE the transaction to keep locks short
        List<PageContent> flatBlocks = new ArrayList<>();
        Set<String> currentBlockIds = new HashSet<>();

        if (CollUtil.isNotEmpty(root.getContent())) {
            List<PageContent> children = root.getContent();
            for (int i = 0; i < children.size(); i++) {
                flattenRecursive(children.get(i), pageId, getRootId(root), String.valueOf(i), i, flatBlocks,
                        currentBlockIds);
            }
        }

        // Pre-compute content hashes in parallel (CPU-bound, thread-safe: each block
        // independent)
        if (CollUtil.isNotEmpty(flatBlocks)) {
            flatBlocks.parallelStream().forEach(b -> b.setContentHash(computeContentHash(b)));
        }

        // Delegate to transactional DB phase via proxy (self-injection)
        self.persistFlattenedBlocks(pageId, flatBlocks, currentBlockIds);

        // Evict cached tree (outside transaction is fine — next read re-populates)
        blockCacheService.evictAssembledTree(pageId);
        blockCacheService.evictPageCache(pageId);

        log.debug("Flattened and saved {} blocks for pageId={}", flatBlocks.size(), pageId);
    }

    /**
     * Flatten a content JSON string and persist blocks.
     * JSON parsing is done OUTSIDE any transaction (pure CPU work).
     */
    public void flattenAndSave(Long pageId, String contentJson) {
        if (StrUtil.isBlank(contentJson)) {
            return;
        }
        // Parse JSON outside transaction — for a 1M-char document this alone can take
        // seconds
        PageContent root = JSONUtil.toBean(contentJson, PageContent.class);
        flattenAndSave(pageId, root);
    }

    /**
     * Transactional DB phase of flattenAndSave. Kept narrow and time-bounded so
     * large documents do not hold row locks beyond the configured timeout.
     *
     * <p>
     * Must be called via the Spring proxy ({@code self.persistFlattenedBlocks})
     * so {@code @Transactional} takes effect.
     * </p>
     */
    @Transactional(rollbackFor = Exception.class, timeout = 60)
    public void persistFlattenedBlocks(Long pageId, List<PageContent> flatBlocks, Set<String> currentBlockIds) {
        // Capture full snapshots of rows that will be removed BEFORE deleting them,
        // so the change recorder can persist their final state as "delete" events.
        List<PageContent> toDelete = findBlocksToDelete(pageId, currentBlockIds);

        // Collect existing versions for deleted blocks
        Map<String, Integer> deletedVersions = new HashMap<>();
        if (CollUtil.isNotEmpty(toDelete)) {
            for (PageContent b : toDelete) {
                deletedVersions.put(b.getId(), b.getVersion());
            }
        }

        // Delete blocks no longer present in this page (runs even when flatBlocks is empty)
        deleteRemovedBlocks(pageId, currentBlockIds);

        // Collect created and updated blocks
        List<PageContent> createdBlocks = new ArrayList<>();
        List<BlockChangeRecorder.BlockUpdate> updatedBlocks = new ArrayList<>();
        if (CollUtil.isNotEmpty(flatBlocks)) {
            BatchChangeResult result = batchUpsert(flatBlocks);
            createdBlocks = result.created;
            updatedBlocks = result.updated;
        }

        // Build all change records with deduplication and persist in one batch
        Set<String> deletedIds = toDelete != null
                ? toDelete.stream().map(PageContent::getId).collect(Collectors.toSet())
                : new HashSet<>();
        List<BlockVersion> changeRecords = changeRecorder.buildAllRecords(
                pageId, createdBlocks, updatedBlocks, deletedIds, deletedVersions);
        if (CollUtil.isNotEmpty(changeRecords)) {
            blockVersionService.saveBatch(changeRecords);
        }
    }

    /**
     * Fetch full block rows that would be removed by
     * {@link #deleteRemovedBlocks(Long, Set)} so we can record them as deletes.
     */
    private List<PageContent> findBlocksToDelete(Long pageId, Set<String> currentBlockIds) {
        if (pageId == null) {
            return new ArrayList<>();
        }
        return pageContentService.lambdaQuery()
                .eq(PageContent::getPageId, pageId)
                .notIn(CollUtil.isNotEmpty(currentBlockIds), PageContent::getId, currentBlockIds)
                .list();
    }

    private void flattenRecursive(PageContent node, Long pageId, String parentId,
            String path, int sortOrder,
            List<PageContent> flatBlocks, Set<String> blockIds) {
        if (node == null) {
            return;
        }

        String blockId = resolveBlockId(node);
        if (StrUtil.isBlank(blockId)) {
            // Inline node (e.g. text) — kept in parent's content field, not stored
            // separately
            return;
        }

        // Prepare flat block row
        node.setId(blockId);
        node.setPageId(pageId);
        node.setParentId(parentId);
        node.setPath(path);
        node.setSortOrder(sortOrder);

        // Store a copy that keeps inline children (text nodes) but strips block
        // children
        PageContent flatBlock = copyForStorage(node);
        flatBlocks.add(flatBlock);
        blockIds.add(blockId);

        // Recurse only into block children (those with IDs)
        if (CollUtil.isNotEmpty(node.getContent())) {
            int blockIndex = 0;
            for (PageContent child : node.getContent()) {
                if (StrUtil.isNotBlank(resolveBlockId(child))) {
                    flattenRecursive(child, pageId, blockId,
                            path + "." + blockIndex, blockIndex, flatBlocks, blockIds);
                    blockIndex++;
                }
            }
        }
    }

    /**
     * Copy a node for DB storage: keeps inline children (text nodes without IDs)
     * in the content field, strips block children (those with IDs) since they are
     * stored as separate rows.
     */
    private PageContent copyForStorage(PageContent node) {
        PageContent copy = new PageContent();
        copy.setId(node.getId());
        copy.setType(node.getType());
        copy.setAttrs(node.getAttrs());
        copy.setMarks(node.getMarks());
        copy.setText(node.getText());
        copy.setParentId(node.getParentId());
        copy.setPageId(node.getPageId());
        copy.setPath(node.getPath());
        copy.setSortOrder(node.getSortOrder());
        copy.setVersion(node.getVersion());

        // Keep inline children (those without block IDs, e.g. text nodes) in content
        if (CollUtil.isNotEmpty(node.getContent())) {
            List<PageContent> inlineChildren = node.getContent().stream()
                    .filter(child -> StrUtil.isBlank(resolveBlockId(child)))
                    .collect(Collectors.toList());
            if (CollUtil.isNotEmpty(inlineChildren)) {
                copy.setContent(inlineChildren);
            }
        }

        return copy;
    }

    // ==================== Assemble Tree ====================

    /**
     * Assemble a full page tree from individual block rows.
     *
     * @param pageId the page ID
     * @return assembled root PageContent, or null if no blocks exist
     */
    public PageContent assembleTree(Long pageId) {
        if (pageId == null) {
            return null;
        }

        // Check cache first
        String cached = blockCacheService.getCachedAssembledTree(pageId);
        if (StrUtil.isNotBlank(cached)) {
            PageContent cachedRoot = JSONUtil.toBean(cached, PageContent.class);
            // Apply dedup to the cached tree as well — entries populated
            // before this dedup logic landed could still carry duplicate
            // rows (per-id collisions) and multiple title nodes at root.
            // Dropping the duplicates on read costs virtually nothing on
            // the fast (cache-hit) path.
            if (cachedRoot != null && CollUtil.isNotEmpty(cachedRoot.getContent())) {
                boolean mutated = dedupTreeChildrenInPlace(pageId, cachedRoot);
                List<PageContent> deduped = dedupRootTitles(pageId, cachedRoot.getContent());
                if (deduped.size() != cachedRoot.getContent().size()) {
                    cachedRoot.setContent(deduped);
                    mutated = true;
                }
                if (mutated) {
                    // Refresh the cache so subsequent hits skip the dedup work.
                    blockCacheService.cacheAssembledTree(pageId, JSONUtil.toJsonStr(cachedRoot));
                }
            }
            return cachedRoot;
        }

        // Query all blocks for this page
        List<PageContent> blocks = pageContentService.findByPageId(pageId);
        if (CollUtil.isEmpty(blocks)) {
            return null;
        }

        // Defensive dedup keyed by block id. The wiki_page_block PK is on
        // `id` so duplicates should be impossible, but legacy data corrupted
        // by earlier races (or schemas deployed before the PK existed) can
        // still carry multiple rows for the same block id at different
        // paths/versions. Returning all of them produces the visible bug
        // where the same block renders multiple times in the assembled doc.
        // Keep the latest row per id (highest version, latest updateTime
        // as tiebreaker) so the response always carries one row per block.
        blocks = dedupBlocksById(pageId, blocks);

        // Build parent -> children map
        Map<String, List<PageContent>> childrenMap = new HashMap<>();
        List<PageContent> rootChildren = new ArrayList<>();

        for (PageContent block : blocks) {
            String pid = block.getParentId();
            if (StrUtil.isBlank(pid) || ROOT_PARENT_ID.equals(pid)) {
                rootChildren.add(block);
            } else {
                childrenMap.computeIfAbsent(pid, k -> new ArrayList<>()).add(block);
            }
        }

        // Sort each group with a stable comparator: sortOrder ASC, then
        // createTime ASC, then id ASC. The fallback keys matter when the
        // table accidentally contains duplicates at the same sortOrder
        // (e.g. legacy data corrupted by an earlier Yjs/REST race) so the
        // assembled doc is deterministic across reads.
        Comparator<PageContent> stableSiblingOrder = Comparator
                .comparingInt((PageContent b) -> b.getSortOrder() != null ? b.getSortOrder() : 0)
                .thenComparing(b -> b.getCreateTime(),
                        Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(b -> b.getId() != null ? b.getId() : "");
        rootChildren.sort(stableSiblingOrder);
        childrenMap.values().forEach(list -> list.sort(stableSiblingOrder));

        // Defensive: the editor schema is `doc = title block*`, i.e. exactly
        // one title at the document root. If the persisted blocks contain
        // more than one title row at root (legacy corruption), keep only
        // the best candidate and drop the others from the assembled tree —
        // rendering two title nodes would otherwise violate the schema and
        // also propagate the duplicates back into the next save.
        rootChildren = dedupRootTitles(pageId, rootChildren);

        // Build root node
        PageContent root = new PageContent();
        root.setType("doc");
        root.setPageId(pageId);
        root.setContent(rootChildren);

        // Recursively attach children
        for (PageContent child : rootChildren) {
            attachChildren(child, childrenMap);
        }

        // Cache the assembled tree
        String treeJson = JSONUtil.toJsonStr(root);
        blockCacheService.cacheAssembledTree(pageId, treeJson);

        return root;
    }

    /**
     * Assemble tree and return as JSON string.
     */
    public String assembleTreeJson(Long pageId) {
        PageContent root = assembleTree(pageId);
        return root != null ? JSONUtil.toJsonStr(root) : null;
    }

    private void attachChildren(PageContent node, Map<String, List<PageContent>> childrenMap) {
        List<PageContent> children = childrenMap.get(node.getId());
        if (CollUtil.isNotEmpty(children)) {
            node.setContent(children);
            for (PageContent child : children) {
                attachChildren(child, childrenMap);
            }
        }
    }

    /**
     * Defensive dedup of root-level title blocks.
     * <p>
     * The editor schema declares the document content as {@code title block*},
     * so any pageId must own exactly one title at root. Historically a
     * Yjs+REST initial-load race could write two parallel title rows for
     * the same page (each with its own id, both at sortOrder=0). Returning
     * both rows would produce a duplicated header in the editor and feed
     * the next incremental save with both copies.
     * </p>
     * <p>
     * Selection rule, applied in order:
     * <ol>
     *   <li>title with non-empty heading text wins over an empty title;</li>
     *   <li>otherwise the most recently updated title wins (latest user intent);</li>
     *   <li>final tiebreaker: lexically smallest id (deterministic).</li>
     * </ol>
     * The discarded title rows are kept in the database — this method only
     * filters the assembled JSON returned to clients. A subsequent edit and
     * save will naturally evict the orphan rows via the existing
     * {@code patchBlocks} flow.
     * </p>
     */
    private List<PageContent> dedupRootTitles(Long pageId, List<PageContent> rootChildren) {
        if (CollUtil.isEmpty(rootChildren)) {
            return rootChildren;
        }
        // Fast path: at most one title => nothing to do.
        int titleCount = 0;
        for (PageContent b : rootChildren) {
            if (b != null && "title".equals(b.getType())) {
                titleCount++;
                if (titleCount > 1) break;
            }
        }
        if (titleCount <= 1) {
            return rootChildren;
        }

        PageContent best = null;
        List<String> droppedIds = new ArrayList<>();
        for (PageContent b : rootChildren) {
            if (b == null || !"title".equals(b.getType())) {
                continue;
            }
            if (best == null) {
                best = b;
                continue;
            }
            if (preferTitle(b, best)) {
                droppedIds.add(best.getId());
                best = b;
            } else {
                droppedIds.add(b.getId());
            }
        }
        log.warn("assembleTree: pageId={} has {} title blocks at root; keeping id={}, dropping ids={}",
                pageId, titleCount, best != null ? best.getId() : null, droppedIds);

        final PageContent kept = best;
        List<PageContent> filtered = new ArrayList<>(rootChildren.size());
        for (PageContent b : rootChildren) {
            if (b == null) continue;
            if ("title".equals(b.getType()) && b != kept) {
                continue;
            }
            filtered.add(b);
        }
        return filtered;
    }

    /**
     * Walk a previously-assembled tree and collapse sibling rows that share
     * the same block id at every level. Returns {@code true} if any
     * duplicates were dropped so the caller can refresh the cache.
     * <p>
     * Used only on the cache-hit path — the fresh-assembly path already
     * runs {@link #dedupBlocksById} on the flat row list before building
     * the tree.
     * </p>
     */
    private boolean dedupTreeChildrenInPlace(Long pageId, PageContent node) {
        if (node == null || CollUtil.isEmpty(node.getContent())) {
            return false;
        }
        boolean mutated = false;
        List<PageContent> children = node.getContent();
        Map<String, PageContent> byId = new HashMap<>(children.size());
        List<PageContent> kept = new ArrayList<>(children.size());
        Map<String, Integer> dupCount = null;
        for (PageContent child : children) {
            if (child == null) continue;
            String id = child.getId();
            if (StrUtil.isBlank(id)) {
                kept.add(child);
                continue;
            }
            PageContent existing = byId.get(id);
            if (existing == null) {
                byId.put(id, child);
                kept.add(child);
                continue;
            }
            if (dupCount == null) dupCount = new HashMap<>();
            dupCount.merge(id, 1, Integer::sum);
            if (preferSurvivor(child, existing)) {
                int idx = kept.indexOf(existing);
                if (idx >= 0) kept.set(idx, child);
                byId.put(id, child);
            }
            mutated = true;
        }
        if (mutated) {
            node.setContent(kept);
            log.warn("assembleTree(cache): pageId={} parentId={} collapsed duplicate children. duplicates={}",
                    pageId, node.getId(), dupCount);
        }
        for (PageContent child : node.getContent()) {
            if (dedupTreeChildrenInPlace(pageId, child)) {
                mutated = true;
            }
        }
        return mutated;
    }

    /**
     * Defensive dedup of any block rows that share the same {@code id}.
     * <p>
     * The {@code wiki_page_block} table declares {@code PRIMARY KEY (id)},
     * so this collapse should be a no-op on a healthy DB. It exists to
     * neutralize legacy corruption where the same block id ended up
     * persisted at multiple paths/versions (e.g. a Yjs/REST race or a
     * pre-PK schema). Without this step, the assembled doc surfaces the
     * same block several times to the client.
     * </p>
     * <p>
     * Keep rule (in order):
     * <ol>
     *   <li>highest {@code version} wins (latest content);</li>
     *   <li>otherwise latest {@code updateTime};</li>
     *   <li>final tiebreaker: lexically smallest row identity (deterministic).</li>
     * </ol>
     * The dropped rows remain in the database — this only filters the
     * read path. The next save's orphan-cleanup pass will eventually
     * evict them.
     * </p>
     */
    private List<PageContent> dedupBlocksById(Long pageId, List<PageContent> blocks) {
        if (CollUtil.isEmpty(blocks)) {
            return blocks;
        }
        Map<String, PageContent> byId = new HashMap<>(blocks.size());
        Map<String, Integer> dupCount = null;
        for (PageContent b : blocks) {
            if (b == null || StrUtil.isBlank(b.getId())) {
                continue;
            }
            PageContent existing = byId.get(b.getId());
            if (existing == null) {
                byId.put(b.getId(), b);
                continue;
            }
            if (dupCount == null) {
                dupCount = new HashMap<>();
            }
            dupCount.merge(b.getId(), 1, Integer::sum);
            if (preferSurvivor(b, existing)) {
                byId.put(b.getId(), b);
            }
        }
        if (dupCount == null) {
            return blocks;
        }
        log.warn("assembleTree: pageId={} found duplicate block rows; collapsed to latest. duplicates={}",
                pageId, dupCount);
        return new ArrayList<>(byId.values());
    }

    /**
     * Comparator-style predicate: returns {@code true} when {@code candidate}
     * should replace {@code current} as the surviving row for a given block id.
     * <p>
     * Title blocks get a special-case rule: rows that carry non-empty heading
     * text always win over empty ones, regardless of version. This guards
     * against the user-visible "title disappeared" bug where a transient
     * empty save (e.g. a Yjs/REST race that briefly emitted an empty title)
     * would otherwise outrank the populated row purely on version number.
     * For all other block types we fall through to {@link #preferLatestBlock}
     * which uses {@code version → updateTime → createTime → path}.
     * </p>
     */
    private boolean preferSurvivor(PageContent candidate, PageContent current) {
        if ("title".equals(candidate.getType()) || "title".equals(current.getType())) {
            boolean candHasText = titleHasText(candidate);
            boolean curHasText = titleHasText(current);
            if (candHasText != curHasText) {
                return candHasText;
            }
        }
        return preferLatestBlock(candidate, current);
    }

    /**
     * Comparator-style predicate: returns {@code true} when {@code candidate}
     * should replace {@code current} as the surviving row for a given block id.
     */
    private boolean preferLatestBlock(PageContent candidate, PageContent current) {
        Integer candVersion = candidate.getVersion();
        Integer curVersion = current.getVersion();
        if (!Objects.equals(candVersion, curVersion)) {
            if (candVersion == null) return false;
            if (curVersion == null) return true;
            return candVersion > curVersion;
        }
        java.time.LocalDateTime candUpdated = candidate.getUpdateTime();
        java.time.LocalDateTime curUpdated = current.getUpdateTime();
        if (candUpdated != null && curUpdated != null && !candUpdated.equals(curUpdated)) {
            return candUpdated.isAfter(curUpdated);
        }
        if (candUpdated != null && curUpdated == null) {
            return true;
        }
        if (candUpdated == null && curUpdated != null) {
            return false;
        }
        // Final tiebreaker: latest createTime, then lexical path order.
        java.time.LocalDateTime candCreated = candidate.getCreateTime();
        java.time.LocalDateTime curCreated = current.getCreateTime();
        if (candCreated != null && curCreated != null && !candCreated.equals(curCreated)) {
            return candCreated.isAfter(curCreated);
        }
        String candPath = candidate.getPath() != null ? candidate.getPath() : "";
        String curPath = current.getPath() != null ? current.getPath() : "";
        return candPath.compareTo(curPath) < 0;
    }

    /**
     * Comparator-style predicate: returns {@code true} when {@code candidate}
     * should replace {@code current} as the surviving title.
     */
    private boolean preferTitle(PageContent candidate, PageContent current) {
        boolean candHasText = titleHasText(candidate);
        boolean curHasText = titleHasText(current);
        if (candHasText != curHasText) {
            return candHasText;
        }
        // Both empty or both populated — prefer the most recently updated.
        java.time.LocalDateTime candUpdated = candidate.getUpdateTime();
        java.time.LocalDateTime curUpdated = current.getUpdateTime();
        if (candUpdated != null && curUpdated != null && !candUpdated.equals(curUpdated)) {
            return candUpdated.isAfter(curUpdated);
        }
        if (candUpdated != null && curUpdated == null) {
            return true;
        }
        if (candUpdated == null && curUpdated != null) {
            return false;
        }
        // Final tiebreaker: lexical id order so the choice is deterministic.
        String candId = candidate.getId() != null ? candidate.getId() : "";
        String curId = current.getId() != null ? current.getId() : "";
        return candId.compareTo(curId) < 0;
    }

    /**
     * Best-effort check for whether a title block carries non-empty heading text.
     * Walks the title's nested {@code content} (heading -> text nodes).
     */
    private boolean titleHasText(PageContent title) {
        if (title == null || CollUtil.isEmpty(title.getContent())) {
            return false;
        }
        for (PageContent inner : title.getContent()) {
            if (inner == null) continue;
            if (StrUtil.isNotBlank(inner.getText())) {
                return true;
            }
            if (CollUtil.isNotEmpty(inner.getContent())) {
                for (PageContent leaf : inner.getContent()) {
                    if (leaf != null && StrUtil.isNotBlank(leaf.getText())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // ==================== Incremental Patch ====================

    /**
     * Apply an incremental patch produced by the frontend DirtyTracker.
     * <p>
     * The patch contains:
     * <ul>
     *   <li>{@code changes} — only the top-level blocks that were modified or
     *       removed since the last save;</li>
     *   <li>{@code blockOrder} — the full ordered list of all top-level
     *       blockIds in the current document, used to assign correct
     *       {@code sortOrder} / {@code path} for updated blocks.</li>
     * </ul>
     * </p>
     * <p>
     * Three-tier optimization:
     * <ol>
     *   <li><b>Tier 1 — Skip unchanged:</b> content hash AND structure match → no DB write</li>
     *   <li><b>Tier 2 — Structure-only:</b> content hash matches but parentId/sortOrder/path differ → lightweight UPDATE</li>
     *   <li><b>Tier 3 — Full upsert:</b> content changed or new block → complete INSERT ON DUPLICATE KEY UPDATE</li>
     * </ol>
     * </p>
     * <p>
     * Version conflict detection: when client's {@code prevVersion} does not match
     * the DB's current version, the conflict is logged and collected in
     * {@link PatchResult#conflictBlockIds}. The method does NOT throw — the caller
     * (controller) decides whether to return 409.
     * </p>
     *
     * @param pageId      target page id
     * @param changes     incremental change items (may be empty)
     * @param blockOrder  ordered list of all current top-level block ids
     * @return PatchResult with statistics and any detected conflicts
     */
    public PatchResult patchBlocks(Long pageId, List<BlockPatchItemDTO> changes, List<String> blockOrder) {
        if (pageId == null) {
            return PatchResult.empty();
        }
        if (CollUtil.isEmpty(changes)) {
            log.debug("patchBlocks: no changes for pageId={}", pageId);
            return PatchResult.empty();
        }

        // Map blockId -> index in blockOrder (used as sortOrder for updates)
        Map<String, Integer> orderMap = new HashMap<>();
        if (CollUtil.isNotEmpty(blockOrder)) {
            for (int i = 0; i < blockOrder.size(); i++) {
                orderMap.put(blockOrder.get(i), i);
            }
        }

        Set<String> deletedRootIds = new HashSet<>();
        List<PageContent> toUpsert = new ArrayList<>();
        // For each updated top-level block: ids contained in its new subtree
        Map<String, Set<String>> newSubtreeIdsByRoot = new HashMap<>();
        // Client-supplied previous-version map (blockId -> prevVersion). Used
        // by the change recorder to log the exact prevVersion the client saw.
        Map<String, Integer> clientPrevVersions = new HashMap<>();

        for (BlockPatchItemDTO ch : changes) {
            if (ch == null || StrUtil.isBlank(ch.getBlockId()) || StrUtil.isBlank(ch.getAction())) {
                continue;
            }
            String action = ch.getAction();
            String blockId = ch.getBlockId();

            if (ch.getPrevVersion() != null) {
                clientPrevVersions.put(blockId, ch.getPrevVersion());
            }

            if ("delete".equalsIgnoreCase(action)) {
                deletedRootIds.add(blockId);
                continue;
            }

            // Accept 'update', 'upsert', or 'UPSERT' as upsert actions
            if ("update".equalsIgnoreCase(action) || "upsert".equalsIgnoreCase(action)) {
                if (StrUtil.isBlank(ch.getContent())) {
                    log.warn("patchBlocks: empty content for upsert block id={} pageId={}", blockId, pageId);
                    continue;
                }
                PageContent rootNode = JSONUtil.toBean(ch.getContent(), PageContent.class);
                if (rootNode == null) {
                    log.warn("patchBlocks: failed to parse content for block id={} pageId={}", blockId, pageId);
                    continue;
                }
                // Inject identity in case attrs.id is missing
                if (rootNode.getAttrs() == null || StrUtil.isBlank(rootNode.getAttrId())) {
                    rootNode.setId(blockId);
                }
                int sortOrder = orderMap.getOrDefault(blockId, 0);
                String path = String.valueOf(sortOrder);

                Set<String> subtreeIds = new HashSet<>();
                flattenRecursive(rootNode, pageId, ROOT_PARENT_ID, path, sortOrder, toUpsert, subtreeIds);
                newSubtreeIdsByRoot.put(blockId, subtreeIds);
            }
        }

        // Pre-compute hashes outside transaction (CPU-bound, thread-safe)
        if (CollUtil.isNotEmpty(toUpsert)) {
            toUpsert.parallelStream().forEach(b -> b.setContentHash(computeContentHash(b)));
        }

        // Apply through proxy so @Transactional takes effect
        PatchResult result = self.persistPatch(pageId, toUpsert, deletedRootIds,
                newSubtreeIdsByRoot, clientPrevVersions);

        // Cache invalidation (outside transaction)
        blockCacheService.evictAssembledTree(pageId);
        blockCacheService.evictPageCache(pageId);
        for (String id : deletedRootIds) {
            blockCacheService.evictBlockCache(id);
        }
        for (String id : newSubtreeIdsByRoot.keySet()) {
            blockCacheService.evictBlockCache(id);
        }

        log.debug("patchBlocks: pageId={} created={} updated={} deleted={} skipped={} conflicts={}",
                pageId, result.getCreated(), result.getUpdated(), result.getDeleted(),
                result.getSkipped(), result.getConflictBlockIds().size());

        return result;
    }

    /**
     * Transactional DB phase of {@link #patchBlocks}. Must be invoked through
     * the Spring proxy ({@code self.persistPatch}) so {@code @Transactional}
     * is honored.
     *
     * <p>All upserts, deletes, orphan cleanup, and change-log recording happen
     * inside a single atomic transaction.</p>
     */
    @Transactional(rollbackFor = Exception.class, timeout = 30)
    public PatchResult persistPatch(Long pageId,
            List<PageContent> toUpsert,
            Set<String> deletedRootIds,
            Map<String, Set<String>> newSubtreeIdsByRoot,
            Map<String, Integer> clientPrevVersions) {

        PatchResult result = new PatchResult();

        // --- Phase 1: Compute all block ids to delete ---
        // Includes explicitly deleted subtrees + orphaned children of updated blocks
        Set<String> allDeletedIds = new HashSet<>();

        // Explicitly deleted root blocks and their entire subtrees
        if (CollUtil.isNotEmpty(deletedRootIds)) {
            allDeletedIds.addAll(collectSubtreeIdsFromDb(pageId, deletedRootIds));
        }

        // Orphaned children: existing DB children that are NOT in the new subtree
        // and NOT explicitly deleted (already handled above)
        if (CollUtil.isNotEmpty(newSubtreeIdsByRoot)) {
            for (Map.Entry<String, Set<String>> entry : newSubtreeIdsByRoot.entrySet()) {
                String rootId = entry.getKey();
                Set<String> keepIds = entry.getValue();
                Set<String> existingSubtreeIds = collectSubtreeIdsFromDb(pageId,
                        Collections.singleton(rootId));
                if (CollUtil.isEmpty(existingSubtreeIds)) {
                    continue;
                }
                // The root itself is being upserted, not orphaned
                existingSubtreeIds.remove(rootId);
                // Remove ids that are in the new subtree (kept)
                existingSubtreeIds.removeAll(keepIds);
                // Remove ids already scheduled for explicit deletion
                existingSubtreeIds.removeAll(deletedRootIds);
                allDeletedIds.addAll(existingSubtreeIds);
            }
        }

        // --- Phase 2: Execute deletes ---
        Map<String, Integer> deletedVersions = new HashMap<>();
        List<String> deletedIdList = new ArrayList<>();
        if (CollUtil.isNotEmpty(allDeletedIds)) {
            // Snapshot before deletion for change log (capture versions)
            List<PageContent> deletedSnapshots = pageContentService.lambdaQuery()
                    .eq(PageContent::getPageId, pageId)
                    .in(PageContent::getId, allDeletedIds)
                    .list();
            for (PageContent snap : deletedSnapshots) {
                deletedVersions.put(snap.getId(), snap.getVersion());
                deletedIdList.add(snap.getId());
            }

            // Batched delete to avoid oversized IN clauses
            processBatched(new ArrayList<>(allDeletedIds), BATCH_SIZE, batch -> {
                pageContentService.lambdaUpdate()
                        .eq(PageContent::getPageId, pageId)
                        .in(PageContent::getId, batch)
                        .remove();
            });

            result.setDeleted(deletedSnapshots.size());
        }

        // --- Phase 3: Upsert with 3-tier classification ---
        List<PageContent> createdBlocks = new ArrayList<>();
        List<BlockChangeRecorder.BlockUpdate> updatedBlocks = new ArrayList<>();
        if (CollUtil.isNotEmpty(toUpsert)) {
            BatchChangeResult batchResult = batchUpsertWithConflictDetection(
                    toUpsert, clientPrevVersions, result);
            createdBlocks = batchResult.created;
            updatedBlocks = batchResult.updated;
        }

        // --- Phase 4: Build and persist all change records (deduplicated) ---
        List<BlockVersion> changeRecords = changeRecorder.buildAllRecords(
                pageId, createdBlocks, updatedBlocks, deletedIdList, deletedVersions);

        // --- Phase 4.5: Save = Publish.
        //     Atomically seal these change records under a brand new ACTIVE
        //     PageVersion so a successful return guarantees a durable version.
        //     Skipped patches (no changeRecords) do not produce a version.
        if (CollUtil.isNotEmpty(changeRecords)) {
            PageVersion newVersion = createNewActiveVersion(pageId);
            for (BlockVersion bv : changeRecords) {
                bv.setPageVersionId(newVersion.getId());
                bv.setPageVersion(newVersion.getVersion());
            }
            result.setPageVersionId(newVersion.getId());
            result.setPageVersion(newVersion.getVersion());
        }

        // --- Phase 5: Persist sealed change records ---
        if (CollUtil.isNotEmpty(changeRecords)) {
            blockVersionService.saveBatch(changeRecords);
        }

        // --- Phase 6: Collect new block versions for client round-trip ---
        Map<String, Integer> newVersions = new HashMap<>();
        for (PageContent b : createdBlocks) {
            newVersions.put(b.getId(), b.getVersion() != null ? b.getVersion() : 1);
        }
        for (BlockChangeRecorder.BlockUpdate u : updatedBlocks) {
            PageContent b = u.getBlock();
            newVersions.put(b.getId(), b.getVersion());
        }
        result.setBlockVersions(newVersions);

        return result;
    }

    /**
     * Create and persist a brand new ACTIVE {@link PageVersion} for {@code pageId},
     * demoting any existing ACTIVE version to {@code IN_ACTIVE}.
     * <p>
     * Must be called inside a transaction so the demote/insert pair is atomic.
     * Used by {@link #persistPatch} to enforce the "save = publish" contract.
     * </p>
     *
     * @param pageId target page
     * @return the freshly inserted ACTIVE {@link PageVersion} (id and version populated)
     */
    private PageVersion createNewActiveVersion(Long pageId) {
        PageVersion currentActive = pageVersionService.lambdaQuery()
                .eq(PageVersion::getSubjectId, pageId)
                .eq(PageVersion::getStatus, VersionStatus.ACTIVE)
                .one();

        int nextVer = 1;
        if (currentActive != null && StrUtil.isNotBlank(currentActive.getVersion())) {
            try {
                nextVer = Integer.parseInt(currentActive.getVersion()) + 1;
            } catch (NumberFormatException ex) {
                log.warn("createNewActiveVersion: non-numeric current version '{}' for pageId={}, resetting to 1",
                        currentActive.getVersion(), pageId);
            }
        }

        PageVersion newVersion = new PageVersion();
        newVersion.setSubjectId(pageId);
        newVersion.setStatus(VersionStatus.ACTIVE);
        newVersion.setVersion(String.valueOf(nextVer));
        if (currentActive != null) {
            newVersion.setLastVersionId(currentActive.getId());
        }
        // md5Code is informational only post-refactor; block rows are the source of truth.
        pageVersionService.save(newVersion);

        if (currentActive != null) {
            pageVersionService.lambdaUpdate()
                    .eq(PageVersion::getId, currentActive.getId())
                    .set(PageVersion::getStatus, VersionStatus.IN_ACTIVE)
                    .update();
        }

        log.debug("createNewActiveVersion pageId={} newVersionId={} version={}",
                pageId, newVersion.getId(), newVersion.getVersion());
        return newVersion;
    }

    /**
     * Collect all block ids that belong to the subtree rooted at any of the
     * given root ids. The returned set INCLUDES the root ids themselves.
     *
     * <p>BFS over the {@code parent_id} relation, batched per level.</p>
     */
    private Set<String> collectSubtreeIdsFromDb(Long pageId, Set<String> rootIds) {
        Set<String> result = new HashSet<>();
        if (pageId == null || CollUtil.isEmpty(rootIds)) {
            return result;
        }

        // Verify root ids actually exist for this page
        List<String> rootList = new ArrayList<>(rootIds);
        List<PageContent> existingRoots = pageContentService.lambdaQuery()
                .select(PageContent::getId)
                .eq(PageContent::getPageId, pageId)
                .in(PageContent::getId, rootList)
                .list();
        for (PageContent r : existingRoots) {
            result.add(r.getId());
        }
        if (result.isEmpty()) {
            return result;
        }

        // BFS by parent_id
        Set<String> currentLevel = new HashSet<>(result);
        while (!currentLevel.isEmpty()) {
            List<String> levelList = new ArrayList<>(currentLevel);
            Set<String> nextLevel = new HashSet<>();
            // Chunk to avoid oversized IN clauses
            for (int i = 0; i < levelList.size(); i += BATCH_SIZE) {
                List<String> chunk = levelList.subList(i, Math.min(i + BATCH_SIZE, levelList.size()));
                List<PageContent> children = pageContentService.lambdaQuery()
                        .select(PageContent::getId, PageContent::getParentId)
                        .eq(PageContent::getPageId, pageId)
                        .in(PageContent::getParentId, chunk)
                        .list();
                for (PageContent c : children) {
                    if (result.add(c.getId())) {
                        nextLevel.add(c.getId());
                    }
                }
            }
            currentLevel = nextLevel;
        }

        return result;
    }

    // ==================== Single Block Upsert ====================

    /**
     * Insert or update a single block row. Increments version on update.
     *
     * @param block the block to upsert
     */
    public void upsertBlock(PageContent block) {
        if (block == null || StrUtil.isBlank(block.getId())) {
            return;
        }

        // Increment version for existing blocks
        PageContent existing = pageContentService.lambdaQuery()
                .select(PageContent::getId, PageContent::getVersion)
                .eq(PageContent::getId, block.getId())
                .one();
        if (existing != null) {
            int currentVersion = existing.getVersion() != null ? existing.getVersion() : 1;
            block.setVersion(currentVersion + 1);
        } else if (block.getVersion() == null) {
            block.setVersion(1);
        }

        pageContentService.upsertBlock(block);

        // Evict caches
        if (block.getPageId() != null) {
            blockCacheService.evictAssembledTree(block.getPageId());
            blockCacheService.evictPageCache(block.getPageId());
        }
        blockCacheService.evictBlockCache(block.getId());
    }

    // ==================== Delete Removed Blocks ====================

    /**
     * Remove blocks that are no longer part of the page tree.
     *
     * @param pageId          the page ID
     * @param currentBlockIds set of block IDs that should be kept
     */
    public void deleteRemovedBlocks(Long pageId, Set<String> currentBlockIds) {
        if (pageId == null || currentBlockIds == null) {
            return;
        }
        pageContentService.deleteByPageIdAndNotInIds(pageId, currentBlockIds);
    }

    /**
     * Check whether block-level storage exists for a page.
     */
    public boolean hasBlockStorage(Long pageId) {
        if (pageId == null) {
            return false;
        }
        List<PageContent> blocks = pageContentService.findByPageId(pageId);
        return CollUtil.isNotEmpty(blocks);
    }

    // ==================== Batch Upsert ====================

    /**
     * Three-tier batch upsert with intelligent change detection.
     * <p>
     * Optimization strategy:
     * 1. Content hash only covers semantic fields (type, attrs, content, marks, text)
     *    — NOT structural fields (parentId, sortOrder, path). This avoids false-positive
     *    "changes" when blocks are merely reordered.
     * 2. Blocks are categorized into three tiers:
     *    - SKIP: unchanged content AND unchanged structure → no DB write
     *    - STRUCTURE_ONLY: unchanged content, different structure → lightweight UPDATE
     *      (only parentId/sortOrder/path, avoids writing large JSON columns)
     *    - CONTENT_CHANGED or NEW: → full INSERT ... ON DUPLICATE KEY UPDATE
     * 3. Uses a single multi-value INSERT ON DUPLICATE KEY UPDATE statement instead of
     *    separate saveBatch + updateBatchById, eliminating multiple round-trips.
     * </p>
     */
    private BatchChangeResult batchUpsert(List<PageContent> blocks) {
        return batchUpsertWithConflictDetection(blocks, Collections.emptyMap(), null);
    }

    /**
     * Variant of {@link #batchUpsert(List)} that accepts a client-supplied
     * map of {@code blockId -> prevVersion}. When present, the value is used
     * as the {@code prev_version} recorded in the change log. The DB-side
     * version is still the source of truth for the version increment.
     */
    private BatchChangeResult batchUpsert(List<PageContent> blocks,
            Map<String, Integer> clientPrevVersions) {
        return batchUpsertWithConflictDetection(blocks, clientPrevVersions, null);
    }

    /**
     * Core 3-tier batch upsert with version conflict detection.
     *
     * @param blocks             blocks to upsert
     * @param clientPrevVersions client's known versions (may be empty)
     * @param patchResult        if non-null, conflict blockIds and counters are accumulated here
     * @return BatchChangeResult for change-log recording
     */
    private BatchChangeResult batchUpsertWithConflictDetection(List<PageContent> blocks,
            Map<String, Integer> clientPrevVersions,
            PatchResult patchResult) {
        BatchChangeResult result = new BatchChangeResult();
        if (CollUtil.isEmpty(blocks)) {
            return result;
        }

        // Ensure content hashes are computed (should be pre-computed by caller)
        for (PageContent block : blocks) {
            if (StrUtil.isBlank(block.getContentHash())) {
                block.setContentHash(computeContentHash(block));
            }
        }

        // Collect all IDs to check existence in one query
        Set<String> blockIds = blocks.stream()
                .map(PageContent::getId)
                .filter(StrUtil::isNotBlank)
                .collect(Collectors.toSet());

        // Query existing blocks: id, version, content_hash, parent_id, sort_order, path
        // for 3-tier change detection
        Map<String, ExistingBlockInfo> existingInfo = new HashMap<>(blockIds.size() * 2);
        if (CollUtil.isNotEmpty(blockIds)) {
            // Chunk the IN clause for very large pages
            processBatched(new ArrayList<>(blockIds), BATCH_SIZE, chunk -> {
                List<Map<String, Object>> existingMaps = pageContentService.listMaps(
                        new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<PageContent>()
                                .select(PageContent::getId, PageContent::getVersion,
                                        PageContent::getContentHash, PageContent::getParentId,
                                        PageContent::getSortOrder, PageContent::getPath)
                                .in(PageContent::getId, chunk));
                for (Map<String, Object> map : existingMaps) {
                    String id = (String) map.get("id");
                    Object verObj = map.get("version");
                    Integer ver = verObj != null ? ((Number) verObj).intValue() : 1;
                    String hash = (String) map.get("content_hash");
                    String parentId = (String) map.get("parent_id");
                    Object sortObj = map.get("sort_order");
                    Integer sortOrder = sortObj != null ? ((Number) sortObj).intValue() : 0;
                    String path = (String) map.get("path");
                    existingInfo.put(id, new ExistingBlockInfo(ver, hash, parentId, sortOrder, path));
                }
            });
        }

        // Three-tier categorization
        List<PageContent> toFullUpsert = new ArrayList<>();   // new + content-changed
        List<PageContent> toStructureUpdate = new ArrayList<>(); // structure-only changes
        int skippedCount = 0;

        for (PageContent block : blocks) {
            ExistingBlockInfo info = existingInfo.get(block.getId());

            if (info != null) {
                // --- Version conflict detection ---
                Integer clientVersion = clientPrevVersions != null
                        ? clientPrevVersions.get(block.getId()) : null;
                if (clientVersion != null && !info.version.equals(clientVersion)) {
                    log.warn("patchBlocks: version conflict for blockId={} db={} client={}",
                            block.getId(), info.version, clientVersion);
                    if (patchResult != null) {
                        patchResult.getConflictBlockIds().add(block.getId());
                    }
                    // Proceed anyway — caller decides whether to reject
                }

                Integer recordedPrev = clientVersion != null ? clientVersion : info.version;

                // Tier 1: Content hash matches AND structure unchanged — skip entirely
                if (shouldSkipUnchanged(block, info)) {
                    skippedCount++;
                    continue;
                }
                // Tier 2: Content unchanged but structure changed — lightweight UPDATE
                else if (isStructureOnlyChange(block, info)) {
                    toStructureUpdate.add(block);
                    result.updated.add(new BlockChangeRecorder.BlockUpdate(block, recordedPrev));
                }
                // Tier 3: Content changed — full upsert with version increment
                else {
                    block.setVersion(info.version + 1);
                    toFullUpsert.add(block);
                    result.updated.add(new BlockChangeRecorder.BlockUpdate(block, recordedPrev));
                }
            } else {
                // New block — full upsert with version=1
                block.setVersion(1);
                toFullUpsert.add(block);
                result.created.add(block);
            }
        }

        // Accumulate counters into PatchResult
        if (patchResult != null) {
            patchResult.setCreated(patchResult.getCreated() + result.created.size());
            patchResult.setUpdated(patchResult.getUpdated() + result.updated.size());
            patchResult.setSkipped(patchResult.getSkipped() + skippedCount);
        }

        if (log.isDebugEnabled()) {
            log.debug("batchUpsert: total={} fullUpsert={} structureOnly={} skipped={}",
                    blocks.size(), toFullUpsert.size(), toStructureUpdate.size(), skippedCount);
        }

        // Execute full upserts via INSERT ON DUPLICATE KEY UPDATE (batched)
        if (CollUtil.isNotEmpty(toFullUpsert)) {
            processBatched(toFullUpsert, BATCH_SIZE, batch -> {
                pageContentMapper.batchInsertOnDuplicate(batch);
            });
        }

        // Execute lightweight structural updates (batched)
        if (CollUtil.isNotEmpty(toStructureUpdate)) {
            processBatched(toStructureUpdate, BATCH_SIZE, batch -> {
                pageContentMapper.batchUpdateStructure(batch);
            });
        }

        return result;
    }

    // ==================== 3-Tier Strategy Methods ====================

    /**
     * Tier 1: Content hash matches AND structure unchanged — skip entirely (no DB write needed).
     */
    private boolean shouldSkipUnchanged(PageContent block, ExistingBlockInfo existing) {
        boolean contentUnchanged = Objects.equals(block.getContentHash(), existing.contentHash);
        boolean structureUnchanged = Objects.equals(block.getParentId(), existing.parentId)
                && Objects.equals(block.getSortOrder(), existing.sortOrder)
                && Objects.equals(block.getPath(), existing.path);
        return contentUnchanged && structureUnchanged;
    }

    /**
     * Tier 2: Content unchanged but structure (parentId, sortOrder, path) differs —
     * only a lightweight structural UPDATE is needed.
     */
    private boolean isStructureOnlyChange(PageContent block, ExistingBlockInfo existing) {
        boolean contentUnchanged = Objects.equals(block.getContentHash(), existing.contentHash);
        boolean structureChanged = !Objects.equals(block.getParentId(), existing.parentId)
                || !Objects.equals(block.getSortOrder(), existing.sortOrder)
                || !Objects.equals(block.getPath(), existing.path);
        return contentUnchanged && structureChanged;
    }

    /**
     * Outcome of a {@link #batchUpsert(List)} call, used to drive the change
     * recorder. Skipped blocks are intentionally omitted.
     */
    static class BatchChangeResult {
        final List<PageContent> created = new ArrayList<>();
        final List<BlockChangeRecorder.BlockUpdate> updated = new ArrayList<>();
    }

    /**
     * Holds existing block metadata for 3-tier change detection.
     */
    private static class ExistingBlockInfo {
        final Integer version;
        final String contentHash;
        final String parentId;
        final Integer sortOrder;
        final String path;

        ExistingBlockInfo(Integer version, String contentHash, String parentId,
                Integer sortOrder, String path) {
            this.version = version;
            this.contentHash = contentHash;
            this.parentId = parentId;
            this.sortOrder = sortOrder;
            this.path = path;
        }
    }

    // ==================== Helpers ====================

    /**
     * Compute MD5 hash from the block's SEMANTIC content fields only,
     * using deterministic JSON serialization with sorted keys.
     * <p>
     * IMPORTANT: Structural fields (parentId, sortOrder, path) are deliberately
     * EXCLUDED from the hash. This prevents false-positive "changes" when blocks
     * are merely reordered (e.g., inserting one paragraph causes all subsequent
     * siblings to get new sortOrder values — without this optimization, that would
     * trigger full-row writes for thousands of unchanged blocks).
     * </p>
     */
    private String computeContentHash(PageContent block) {
        try {
            // Build a canonical map of semantic fields in deterministic order
            Map<String, Object> hashInput = new java.util.TreeMap<>();
            hashInput.put("type", block.getType());
            hashInput.put("attrs", block.getAttrs());
            hashInput.put("content", block.getContent());
            hashInput.put("marks", block.getMarks());
            hashInput.put("text", block.getText());
            String canonical = HASH_MAPPER.writeValueAsString(hashInput);
            return DigestUtil.md5Hex(canonical);
        } catch (JsonProcessingException e) {
            // Fallback to string concatenation (should never happen for valid blocks)
            log.warn("computeContentHash: Jackson serialization failed for block id={}, using fallback",
                    block.getId(), e);
            StringBuilder sb = new StringBuilder();
            sb.append(block.getType()).append("|");
            sb.append(block.getAttrs() != null ? JSONUtil.toJsonStr(block.getAttrs()) : "").append("|");
            sb.append(block.getContent() != null ? JSONUtil.toJsonStr(block.getContent()) : "").append("|");
            sb.append(block.getMarks() != null ? JSONUtil.toJsonStr(block.getMarks()) : "").append("|");
            sb.append(block.getText() != null ? block.getText() : "");
            return DigestUtil.md5Hex(sb.toString());
        }
    }

    /**
     * Generic batch processing utility. Splits items into chunks and processes
     * each batch via the provided consumer.
     *
     * @param items          collection to process
     * @param batchSize      maximum items per batch
     * @param batchProcessor consumer that handles each batch
     */
    private <T> void processBatched(List<T> items, int batchSize, Consumer<List<T>> batchProcessor) {
        if (CollUtil.isEmpty(items)) {
            return;
        }
        for (int i = 0; i < items.size(); i += batchSize) {
            List<T> batch = items.subList(i, Math.min(i + batchSize, items.size()));
            batchProcessor.accept(batch);
        }
    }

    private String resolveBlockId(PageContent node) {
        // Prefer attrs.id, fall back to node.id
        String attrId = node.getAttrId();
        if (StrUtil.isNotBlank(attrId)) {
            return attrId;
        }
        return node.getId();
    }

    private String getRootId(PageContent root) {
        String id = resolveBlockId(root);
        return StrUtil.isNotBlank(id) ? id : ROOT_PARENT_ID;
    }

    // ==================== Inner Classes ====================

    /**
     * Result of a {@link #patchBlocks} operation.
     * Contains statistics and any detected version conflicts.
     */
    public static class PatchResult {
        private int created;
        private int updated;
        private int deleted;
        private int skipped;
        private List<String> conflictBlockIds;
        /** Block versions after this patch (blockId -> new version number). */
        private Map<String, Integer> blockVersions;
        /** New ACTIVE PageVersion id sealed by this patch (null if no changes). */
        private Long pageVersionId;
        /** New ACTIVE PageVersion number (e.g. "3") sealed by this patch (null if no changes). */
        private String pageVersion;

        public PatchResult() {
            this.conflictBlockIds = new ArrayList<>();
        }

        public static PatchResult empty() {
            return new PatchResult();
        }

        public boolean hasConflicts() {
            return conflictBlockIds != null && !conflictBlockIds.isEmpty();
        }

        public int getCreated() { return created; }
        public void setCreated(int created) { this.created = created; }
        public int getUpdated() { return updated; }
        public void setUpdated(int updated) { this.updated = updated; }
        public int getDeleted() { return deleted; }
        public void setDeleted(int deleted) { this.deleted = deleted; }
        public int getSkipped() { return skipped; }
        public void setSkipped(int skipped) { this.skipped = skipped; }
        public List<String> getConflictBlockIds() { return conflictBlockIds; }
        public void setConflictBlockIds(List<String> conflictBlockIds) { this.conflictBlockIds = conflictBlockIds; }
        public Map<String, Integer> getBlockVersions() { return blockVersions; }
        public void setBlockVersions(Map<String, Integer> blockVersions) { this.blockVersions = blockVersions; }
        public Long getPageVersionId() { return pageVersionId; }
        public void setPageVersionId(Long pageVersionId) { this.pageVersionId = pageVersionId; }
        public String getPageVersion() { return pageVersion; }
        public void setPageVersion(String pageVersion) { this.pageVersion = pageVersion; }

        @Override
        public String toString() {
            return "PatchResult{created=" + created + ", updated=" + updated
                    + ", deleted=" + deleted + ", skipped=" + skipped
                    + ", pageVersion=" + pageVersion
                    + ", conflicts=" + (conflictBlockIds != null ? conflictBlockIds.size() : 0) + "}";
        }
    }
}
