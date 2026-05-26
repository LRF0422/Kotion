package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.knowledge.wiki.service.cache.BlockCacheService;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.entity.dto.BlockPatchItemDTO;
import com.knowledge.wiki.service.mapper.PageContentMapper;
import com.knowledge.wiki.service.service.IPageContentService;

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

    @Autowired
    private IPageContentService pageContentService;

    @Autowired
    private PageContentMapper pageContentMapper;

    @Autowired
    private BlockCacheService blockCacheService;

    @Autowired
    private BlockChangeRecorder blockChangeRecorder;

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
        if (CollUtil.isNotEmpty(toDelete)) {
            blockChangeRecorder.recordDeletes(pageId, toDelete);
        }

        // Delete blocks no longer present in this page (runs even when flatBlocks is
        // empty)
        deleteRemovedBlocks(pageId, currentBlockIds);

        if (CollUtil.isNotEmpty(flatBlocks)) {
            BatchChangeResult result = batchUpsert(flatBlocks);
            blockChangeRecorder.recordCreates(pageId, result.created);
            blockChangeRecorder.recordUpdates(pageId, result.updated);
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
            return JSONUtil.toBean(cached, PageContent.class);
        }

        // Query all blocks for this page
        List<PageContent> blocks = pageContentService.findByPageId(pageId);
        if (CollUtil.isEmpty(blocks)) {
            return null;
        }

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

        // Sort each group by sortOrder
        rootChildren.sort(Comparator.comparingInt(b -> b.getSortOrder() != null ? b.getSortOrder() : 0));
        childrenMap.values().forEach(list -> list.sort(
                Comparator.comparingInt(b -> b.getSortOrder() != null ? b.getSortOrder() : 0)));

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
     * For each {@code update} entry we re-flatten the block subtree and upsert
     * its rows; for each {@code delete} entry we cascade-remove the block and
     * all of its descendants. Orphaned children of updated blocks (children
     * that disappear between saves) are also cleaned up.
     * </p>
     *
     * @param pageId      target page id
     * @param changes     incremental change items (may be empty)
     * @param blockOrder  ordered list of all current top-level block ids
     */
    public void patchBlocks(Long pageId, List<BlockPatchItemDTO> changes, List<String> blockOrder) {
        if (pageId == null) {
            return;
        }
        if (CollUtil.isEmpty(changes)) {
            log.debug("patchBlocks: no changes for pageId={}", pageId);
            return;
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

            if ("update".equalsIgnoreCase(action)) {
                if (StrUtil.isBlank(ch.getContent())) {
                    log.warn("patchBlocks: empty content for update block id={} pageId={}", blockId, pageId);
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

        // Pre-compute hashes outside transaction
        if (CollUtil.isNotEmpty(toUpsert)) {
            toUpsert.parallelStream().forEach(b -> b.setContentHash(computeContentHash(b)));
        }

        // Apply through proxy so @Transactional takes effect
        self.persistPatch(pageId, toUpsert, deletedRootIds, newSubtreeIdsByRoot, clientPrevVersions);

        // Cache invalidation (outside transaction)
        blockCacheService.evictAssembledTree(pageId);
        blockCacheService.evictPageCache(pageId);
        for (String id : deletedRootIds) {
            blockCacheService.evictBlockCache(id);
        }
        for (String id : newSubtreeIdsByRoot.keySet()) {
            blockCacheService.evictBlockCache(id);
        }

        log.debug("patchBlocks: pageId={} updates={} deletes={}", pageId,
                newSubtreeIdsByRoot.size(), deletedRootIds.size());
    }

    /**
     * Transactional DB phase of {@link #patchBlocks}. Must be invoked through
     * the Spring proxy ({@code self.persistPatch}) so {@code @Transactional}
     * is honored.
     */
    @Transactional(rollbackFor = Exception.class, timeout = 30)
    public void persistPatch(Long pageId,
            List<PageContent> toUpsert,
            Set<String> deletedRootIds,
            Map<String, Set<String>> newSubtreeIdsByRoot,
            Map<String, Integer> clientPrevVersions) {

        // Collect every block id that will be deleted (top-level subtrees +
        // orphaned descendants of updated blocks) so we can snapshot them for
        // the change log before issuing the actual DELETE.
        Set<String> allDeletedIds = new HashSet<>();
        if (CollUtil.isNotEmpty(deletedRootIds)) {
            allDeletedIds.addAll(collectSubtreeIdsFromDb(pageId, deletedRootIds));
        }
        if (CollUtil.isNotEmpty(newSubtreeIdsByRoot)) {
            for (Map.Entry<String, Set<String>> entry : newSubtreeIdsByRoot.entrySet()) {
                String rootId = entry.getKey();
                Set<String> keepIds = entry.getValue();
                Set<String> existingSubtreeIds = collectSubtreeIdsFromDb(pageId,
                        java.util.Collections.singleton(rootId));
                if (CollUtil.isEmpty(existingSubtreeIds)) {
                    continue;
                }
                existingSubtreeIds.remove(rootId);
                existingSubtreeIds.removeAll(keepIds);
                allDeletedIds.addAll(existingSubtreeIds);
            }
        }

        if (CollUtil.isNotEmpty(allDeletedIds)) {
            List<PageContent> deletedSnapshots = pageContentService.lambdaQuery()
                    .eq(PageContent::getPageId, pageId)
                    .in(PageContent::getId, allDeletedIds)
                    .list();
            blockChangeRecorder.recordDeletes(pageId, deletedSnapshots);

            pageContentService.lambdaUpdate()
                    .eq(PageContent::getPageId, pageId)
                    .in(PageContent::getId, allDeletedIds)
                    .remove();
        }

        // Upsert the new/updated rows in batch with version increment
        if (CollUtil.isNotEmpty(toUpsert)) {
            BatchChangeResult result = batchUpsert(toUpsert, clientPrevVersions);
            blockChangeRecorder.recordCreates(pageId, result.created);
            blockChangeRecorder.recordUpdates(pageId, result.updated);
        }
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
        return batchUpsert(blocks, java.util.Collections.emptyMap());
    }

    /**
     * Variant of {@link #batchUpsert(List)} that accepts a client-supplied
     * map of {@code blockId -> prevVersion}. When present, the value is used
     * as the {@code prev_version} recorded in the change log. The DB-side
     * version is still the source of truth for the version increment.
     */
    private BatchChangeResult batchUpsert(List<PageContent> blocks,
            Map<String, Integer> clientPrevVersions) {
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
            // Chunk the IN clause for very large pages (MySQL has practical limits on IN size)
            List<String> idList = new ArrayList<>(blockIds);
            for (int i = 0; i < idList.size(); i += BATCH_SIZE) {
                List<String> chunk = idList.subList(i, Math.min(i + BATCH_SIZE, idList.size()));
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
            }
        }

        // Three-tier categorization
        List<PageContent> toFullUpsert = new ArrayList<>();   // new + content-changed
        List<PageContent> toStructureUpdate = new ArrayList<>(); // structure-only changes
        int skippedCount = 0;

        for (PageContent block : blocks) {
            String newHash = block.getContentHash();
            ExistingBlockInfo info = existingInfo.get(block.getId());

            if (info != null) {
                boolean contentChanged = !newHash.equals(info.contentHash);
                boolean structureChanged = !Objects.equals(block.getParentId(), info.parentId)
                        || !Objects.equals(block.getSortOrder(), info.sortOrder)
                        || !Objects.equals(block.getPath(), info.path);

                Integer recordedPrev = clientPrevVersions != null
                        ? clientPrevVersions.getOrDefault(block.getId(), info.version)
                        : info.version;
                if (clientPrevVersions != null && clientPrevVersions.get(block.getId()) != null
                        && !info.version.equals(clientPrevVersions.get(block.getId()))) {
                    log.warn("patchBlocks: prevVersion mismatch for blockId={} db={} client={}",
                            block.getId(), info.version, clientPrevVersions.get(block.getId()));
                }

                if (!contentChanged && !structureChanged) {
                    // Tier 1: completely unchanged — skip
                    skippedCount++;
                    continue;
                } else if (!contentChanged) {
                    // Tier 2: structure-only change — lightweight update
                    toStructureUpdate.add(block);
                    // Structural moves still count as updates for the change log.
                    result.updated.add(new BlockChangeRecorder.BlockUpdate(block, recordedPrev));
                } else {
                    // Tier 3: content changed — full upsert with version increment
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

        if (log.isDebugEnabled()) {
            log.debug("batchUpsert: total={} fullUpsert={} structureOnly={} skipped={}",
                    blocks.size(), toFullUpsert.size(), toStructureUpdate.size(), skippedCount);
        }

        // Execute full upserts via INSERT ON DUPLICATE KEY UPDATE (batched)
        if (CollUtil.isNotEmpty(toFullUpsert)) {
            for (int i = 0; i < toFullUpsert.size(); i += BATCH_SIZE) {
                List<PageContent> batch = toFullUpsert.subList(i,
                        Math.min(i + BATCH_SIZE, toFullUpsert.size()));
                pageContentMapper.batchInsertOnDuplicate(batch);
            }
        }

        // Execute lightweight structural updates (batched)
        if (CollUtil.isNotEmpty(toStructureUpdate)) {
            for (int i = 0; i < toStructureUpdate.size(); i += BATCH_SIZE) {
                List<PageContent> batch = toStructureUpdate.subList(i,
                        Math.min(i + BATCH_SIZE, toStructureUpdate.size()));
                pageContentMapper.batchUpdateStructure(batch);
            }
        }

        return result;
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
     * Compute MD5 hash from the block's SEMANTIC content fields only.
     * <p>
     * IMPORTANT: Structural fields (parentId, sortOrder, path) are deliberately
     * EXCLUDED from the hash. This prevents false-positive "changes" when blocks
     * are merely reordered (e.g., inserting one paragraph causes all subsequent
     * siblings to get new sortOrder values — without this optimization, that would
     * trigger full-row writes for thousands of unchanged blocks).
     * </p>
     */
    private String computeContentHash(PageContent block) {
        StringBuilder sb = new StringBuilder();
        sb.append(block.getType()).append("|");
        sb.append(block.getAttrs() != null ? block.getAttrs().toString() : "").append("|");
        sb.append(block.getContent() != null ? JSONUtil.toJsonStr(block.getContent()) : "").append("|");
        sb.append(block.getMarks() != null ? JSONUtil.toJsonStr(block.getMarks()) : "").append("|");
        sb.append(block.getText() != null ? block.getText() : "");
        return DigestUtil.md5Hex(sb.toString());
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
}
