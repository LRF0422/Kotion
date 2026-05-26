package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.knowledge.wiki.service.entity.BlockVersion;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.service.IBlockVersionService;

import cn.hutool.core.collection.CollUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Records block-level changes (create / update / delete) into the
 * {@code wiki_block_version} table.
 *
 * <p>
 * Changes are inserted with {@code page_version_id = NULL} (pending). When the
 * page is published, {@link #sealPendingChanges(Long, Long, String)} back-fills
 * the page version columns to associate all pending changes with that version.
 * </p>
 *
 * <p>
 * This recorder is the single source of truth for the block change log; the
 * current authoritative state of each block still lives in {@code wiki_page_block}.
 * </p>
 */
@Service
@Slf4j
public class BlockChangeRecorder {

    @Autowired
    private IBlockVersionService blockVersionService;

    /**
     * Record a batch of block creations as pending change rows.
     *
     * @param pageId target page id
     * @param blocks newly created blocks (their {@code version} should already be 1)
     */
    public void recordCreates(Long pageId, Collection<PageContent> blocks) {
        if (pageId == null || CollUtil.isEmpty(blocks)) {
            return;
        }
        List<BlockVersion> rows = new ArrayList<>(blocks.size());
        for (PageContent b : blocks) {
            rows.add(toRow(pageId, b, "create", null));
        }
        blockVersionService.saveBatch(rows);
    }

    /**
     * Record a batch of block updates as pending change rows.
     *
     * @param pageId  target page id
     * @param updates list of update entries, each carrying the new block snapshot
     *                and the version it superseded
     */
    public void recordUpdates(Long pageId, Collection<BlockUpdate> updates) {
        if (pageId == null || CollUtil.isEmpty(updates)) {
            return;
        }
        List<BlockVersion> rows = new ArrayList<>(updates.size());
        for (BlockUpdate u : updates) {
            rows.add(toRow(pageId, u.block, "update", u.prevVersion));
        }
        blockVersionService.saveBatch(rows);
    }

    /**
     * Record a batch of block deletions as pending change rows.
     * The provided blocks should reflect the state immediately before deletion.
     *
     * @param pageId          target page id
     * @param deletedSnapshots block rows that are about to be removed
     */
    public void recordDeletes(Long pageId, Collection<PageContent> deletedSnapshots) {
        if (pageId == null || CollUtil.isEmpty(deletedSnapshots)) {
            return;
        }
        List<BlockVersion> rows = new ArrayList<>(deletedSnapshots.size());
        for (PageContent b : deletedSnapshots) {
            Integer prev = b.getVersion();
            BlockVersion row = toRow(pageId, b, "delete", prev);
            // Bump the version so the delete event sits above the last live version.
            row.setVersion((prev != null ? prev : 0) + 1);
            rows.add(row);
        }
        blockVersionService.saveBatch(rows);
    }

    /**
     * Seal all pending change rows for the given page by back-filling the
     * page version columns. Called by the publish flow after a new
     * {@code PageVersion} row has been activated.
     *
     * @param pageId        target page id
     * @param pageVersionId newly published page version id
     * @param pageVersion   newly published page version label (e.g. "2")
     * @return whether the underlying update affected any row
     */
    public boolean sealPendingChanges(Long pageId, Long pageVersionId, String pageVersion) {
        if (pageId == null || pageVersionId == null) {
            return false;
        }
        boolean ok = blockVersionService.lambdaUpdate()
                .eq(BlockVersion::getPageId, pageId)
                .isNull(BlockVersion::getPageVersionId)
                .set(BlockVersion::getPageVersionId, pageVersionId)
                .set(BlockVersion::getPageVersion, pageVersion)
                .update();
        log.debug("sealPendingChanges pageId={} pageVersionId={} pageVersion={} ok={}",
                pageId, pageVersionId, pageVersion, ok);
        return ok;
    }

    private BlockVersion toRow(Long pageId, PageContent b, String action, Integer prevVersion) {
        BlockVersion row = new BlockVersion();
        row.setBlockId(b.getId());
        row.setPageId(pageId);
        row.setPageVersionId(null);
        row.setPageVersion(null);
        row.setVersion(b.getVersion() != null ? b.getVersion() : 1);
        row.setChangeAction(action);
        row.setPrevVersion(prevVersion);
        row.setType(b.getType());
        row.setAttrs(b.getAttrs());
        row.setContent(b.getContent());
        row.setMarks(b.getMarks());
        row.setText(b.getText());
        row.setParentId(b.getParentId());
        row.setPath(b.getPath());
        row.setSortOrder(b.getSortOrder());
        return row;
    }

    /**
     * Holder describing one block update event.
     */
    public static class BlockUpdate {
        public final PageContent block;
        public final Integer prevVersion;

        public BlockUpdate(PageContent block, Integer prevVersion) {
            this.block = block;
            this.prevVersion = prevVersion;
        }
    }
}
