package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.knowledge.wiki.service.entity.BlockVersion;
import com.knowledge.wiki.service.entity.PageContent;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;

/**
 * Builds block-level change records (create / update / delete) as
 * {@link BlockVersion} entities ready for persistence.
 *
 * <p>
 * This is a <b>plain helper class</b> — not a Spring bean. It performs no
 * persistence; the caller ({@link BlockStorageService}) is responsible for
 * saving the returned lists within its own transaction boundary.
 * </p>
 *
 * <p>
 * Key properties:
 * <ul>
 *   <li><b>Deduplication</b>: same blockId in one patch produces only one
 *       record (last write wins).</li>
 *   <li><b>Null-safety</b>: all content/marks/attrs fields are handled with
 *       null checks.</li>
 *   <li><b>Size validation</b>: content exceeding {@link #MAX_CONTENT_SIZE}
 *       is logged and the content field is skipped in the version record.</li>
 * </ul>
 * </p>
 */
public class BlockChangeRecorder {

    private static final long MAX_CONTENT_SIZE = 1024 * 1024; // 1MB per block
    private static final Logger log = LoggerFactory.getLogger(BlockChangeRecorder.class);

    /**
     * Build change records for created blocks.
     *
     * @param pageId the page ID
     * @param blocks the newly created blocks
     * @return list of BlockVersion entities ready to be persisted
     */
    public List<BlockVersion> buildCreateRecords(Long pageId, Collection<PageContent> blocks) {
        if (pageId == null || CollUtil.isEmpty(blocks)) {
            return new ArrayList<>();
        }
        List<BlockVersion> rows = new ArrayList<>(blocks.size());
        for (PageContent b : blocks) {
            if (b == null || StrUtil.isBlank(b.getId())) {
                continue;
            }
            BlockVersion row = toRow(pageId, b, "create", null);
            row.setVersion(1);
            rows.add(row);
        }
        return rows;
    }

    /**
     * Build change records for updated blocks.
     *
     * @param pageId  the page ID
     * @param updates list of (block, previousVersion) pairs
     * @return list of BlockVersion entities ready to be persisted
     */
    public List<BlockVersion> buildUpdateRecords(Long pageId, List<BlockUpdate> updates) {
        if (pageId == null || CollUtil.isEmpty(updates)) {
            return new ArrayList<>();
        }
        List<BlockVersion> rows = new ArrayList<>(updates.size());
        for (BlockUpdate u : updates) {
            if (u == null || u.getBlock() == null || StrUtil.isBlank(u.getBlock().getId())) {
                continue;
            }
            BlockVersion row = toRow(pageId, u.getBlock(), "update", u.getPrevVersion());
            // Version = prevVersion + 1
            int prev = u.getPrevVersion() != null ? u.getPrevVersion() : 0;
            row.setVersion(prev + 1);
            rows.add(row);
        }
        return rows;
    }

    /**
     * Build change records for deleted blocks.
     *
     * @param pageId           the page ID
     * @param deletedBlockIds  the block IDs being deleted
     * @param existingVersions map of blockId -> current version number
     * @return list of BlockVersion entities ready to be persisted
     */
    public List<BlockVersion> buildDeleteRecords(Long pageId, Collection<String> deletedBlockIds,
                                                  Map<String, Integer> existingVersions) {
        if (pageId == null || CollUtil.isEmpty(deletedBlockIds)) {
            return new ArrayList<>();
        }
        Map<String, Integer> versions = existingVersions != null ? existingVersions : Map.of();
        List<BlockVersion> rows = new ArrayList<>(deletedBlockIds.size());
        for (String blockId : deletedBlockIds) {
            if (StrUtil.isBlank(blockId)) {
                continue;
            }
            Integer prev = versions.get(blockId);
            BlockVersion row = new BlockVersion();
            row.setBlockId(blockId);
            row.setPageId(pageId);
            row.setPageVersionId(null);
            row.setPageVersion(null);
            row.setChangeAction("delete");
            row.setPrevVersion(prev);
            row.setVersion((prev != null ? prev : 0) + 1);
            rows.add(row);
        }
        return rows;
    }

    /**
     * Build all change records for a patch operation, with deduplication.
     * Same blockId appearing in multiple operations produces only one record
     * (last action wins).
     *
     * <p>Processing order: creates → updates → deletes. If the same blockId
     * appears in multiple operations, the later entry overwrites the earlier one.</p>
     *
     * @param pageId           the page ID
     * @param created          newly created blocks
     * @param updated          list of (block, previousVersion) pairs
     * @param deleted          block IDs being deleted
     * @param existingVersions map of blockId -> current version number
     * @return deduplicated list of BlockVersion entities ready to be persisted
     */
    public List<BlockVersion> buildAllRecords(Long pageId,
                                              Collection<PageContent> created,
                                              List<BlockUpdate> updated,
                                              Collection<String> deleted,
                                              Map<String, Integer> existingVersions) {
        if (pageId == null) {
            return new ArrayList<>();
        }

        // LinkedHashMap preserves insertion order; last write wins deduplication
        LinkedHashMap<String, BlockVersion> deduped = new LinkedHashMap<>();

        // Phase 1: creates
        if (CollUtil.isNotEmpty(created)) {
            for (BlockVersion row : buildCreateRecords(pageId, created)) {
                deduped.put(row.getBlockId(), row);
            }
        }

        // Phase 2: updates
        if (CollUtil.isNotEmpty(updated)) {
            for (BlockVersion row : buildUpdateRecords(pageId, updated)) {
                deduped.put(row.getBlockId(), row);
            }
        }

        // Phase 3: deletes
        if (CollUtil.isNotEmpty(deleted)) {
            for (BlockVersion row : buildDeleteRecords(pageId, deleted, existingVersions)) {
                deduped.put(row.getBlockId(), row);
            }
        }

        return new ArrayList<>(deduped.values());
    }

    // ==================== Private helpers ====================

    /**
     * Convert a PageContent block into a BlockVersion row.
     * Applies null-safety and size validation on content fields.
     */
    private BlockVersion toRow(Long pageId, PageContent b, String action, Integer prevVersion) {
        BlockVersion row = new BlockVersion();
        row.setBlockId(b.getId());
        row.setPageId(pageId);
        row.setPageVersionId(null);
        row.setPageVersion(null);
        row.setChangeAction(action);
        row.setPrevVersion(prevVersion);

        // Version is set by the caller method (buildCreateRecords / buildUpdateRecords)
        row.setVersion(b.getVersion() != null ? b.getVersion() : 1);

        row.setType(b.getType());
        row.setAttrs(b.getAttrs());
        row.setMarks(b.getMarks());
        row.setText(b.getText());
        row.setParentId(b.getParentId());
        row.setPath(b.getPath());
        row.setSortOrder(b.getSortOrder());

        // Size validation on content field
        if (b.getContent() != null) {
            try {
                String serialized = JSONUtil.toJsonStr(b.getContent());
                if (serialized != null && serialized.length() > MAX_CONTENT_SIZE) {
                    log.warn("Block content exceeds {}B for blockId={} pageId={} (size={}). "
                            + "Skipping content in version record.",
                            MAX_CONTENT_SIZE, b.getId(), pageId, serialized.length());
                    row.setContent(null);
                } else {
                    row.setContent(b.getContent());
                }
            } catch (Exception e) {
                log.warn("Failed to serialize content for blockId={} pageId={}: {}",
                        b.getId(), pageId, e.getMessage());
                row.setContent(null);
            }
        }

        return row;
    }

    // ==================== Inner class ====================

    /**
     * Holder describing one block update event: the block's new state
     * paired with the version it superseded.
     */
    public static class BlockUpdate {
        private final PageContent block;
        private final Integer prevVersion;

        public BlockUpdate(PageContent block, Integer prevVersion) {
            this.block = block;
            this.prevVersion = prevVersion;
        }

        public PageContent getBlock() {
            return block;
        }

        public Integer getPrevVersion() {
            return prevVersion;
        }
    }
}
