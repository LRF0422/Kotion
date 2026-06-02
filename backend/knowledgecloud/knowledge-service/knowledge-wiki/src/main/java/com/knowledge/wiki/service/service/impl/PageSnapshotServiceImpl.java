package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.BlockVersion;
import com.knowledge.wiki.service.mapper.BlockVersionMapper;
import com.knowledge.wiki.service.service.IBlockVersionService;
import com.knowledge.wiki.service.service.IPageSnapshotService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Implementation of PageSnapshotService for block version management.
 * Pure storage service - no dependency on PageVersionService.
 */
@Service
@Slf4j
public class PageSnapshotServiceImpl extends MPJBaseServiceImpl<BlockVersionMapper, BlockVersion>
        implements IPageSnapshotService {

    @Autowired
    private IBlockVersionService blockVersionService;

    /**
     * Seal pending block change rows under a newly published page version.
     * <p>
     * Diff-only model: only the rows that the just-applied patch wrote (with
     * {@code page_version_id == NULL}) are tagged with the new
     * {@code page_version_id} / {@code page_version}. There is no
     * carry-forward of unchanged blocks - readers use
     * {@link #getPageStateAtVersion(Long, String)} to walk back through
     * history.
     * </p>
     *
     * @param pageId        the page ID
     * @param pageVersionId the published page version ID
     * @param pageVersion   the page version number (e.g., "1", "2")
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void snapshotBlocks(Long pageId, Long pageVersionId, String pageVersion) {
        if (pageId == null || pageVersionId == null) {
            return;
        }

        // Seal incremental change rows accumulated since last publish by
        // back-filling page_version_id and page_version on pending rows.
        boolean sealed = blockVersionService.lambdaUpdate()
                .eq(BlockVersion::getPageId, pageId)
                .isNull(BlockVersion::getPageVersionId)
                .set(BlockVersion::getPageVersionId, pageVersionId)
                .set(BlockVersion::getPageVersion, pageVersion)
                .update();
        log.debug("snapshotBlocks pageId={} pageVersionId={} pageVersion={} sealed={}",
                pageId, pageVersionId, pageVersion, sealed);
    }

    @Override
    public List<BlockVersion> getSnapshotBlocks(Long versionId) {
        if (versionId == null) {
            return new ArrayList<>();
        }
        return this.lambdaQuery()
                .eq(BlockVersion::getPageVersionId, versionId)
                .orderByAsc(BlockVersion::getSortOrder)
                .list();
    }

    @Override
    public List<BlockVersion> getSnapshotBlocksByVersion(Long pageId, String pageVersion) {
        if (pageId == null || StrUtil.isBlank(pageVersion)) {
            return new ArrayList<>();
        }
        return this.lambdaQuery()
                .eq(BlockVersion::getPageId, pageId)
                .eq(BlockVersion::getPageVersion, pageVersion)
                .orderByAsc(BlockVersion::getSortOrder)
                .list();
    }

    /**
     * Walk-back read: full block state of a page at the given page version.
     * <p>
     * For each block touched at or before {@code pageVersion}, picks the row
     * with the highest numeric {@code page_version &lt;= pageVersion}, then
     * filters out blocks whose latest event is a deletion. Sorted by
     * {@code sort_order}.
     * </p>
     */
    @Override
    public List<BlockVersion> getPageStateAtVersion(Long pageId, String pageVersion) {
        if (pageId == null || StrUtil.isBlank(pageVersion)) {
            return new ArrayList<>();
        }
        Integer targetVer = parseVersion(pageVersion);
        if (targetVer == null) {
            log.warn("getPageStateAtVersion: invalid version '{}' for pageId={}", pageVersion, pageId);
            return new ArrayList<>();
        }

        // Fetch all sealed block-version rows for this page at or before the
        // target page version. page_version is stored as VARCHAR so we cast to
        // an unsigned integer for numeric comparison.
        List<BlockVersion> rows = this.lambdaQuery()
                .eq(BlockVersion::getPageId, pageId)
                .isNotNull(BlockVersion::getPageVersionId)
                .apply("CAST(page_version AS UNSIGNED) <= {0}", targetVer)
                .list();
        if (CollUtil.isEmpty(rows)) {
            return new ArrayList<>();
        }

        // Walk back: per block_id, keep the row with the highest page_version.
        Map<String, BlockVersion> latestPerBlock = new HashMap<>();
        for (BlockVersion row : rows) {
            Integer rowVer = parseVersion(row.getPageVersion());
            if (rowVer == null) {
                continue;
            }
            BlockVersion existing = latestPerBlock.get(row.getBlockId());
            Integer existingVer = existing == null ? null : parseVersion(existing.getPageVersion());
            if (existing == null || existingVer == null || existingVer < rowVer) {
                latestPerBlock.put(row.getBlockId(), row);
            }
        }

        // Filter out blocks whose latest event is a deletion; sort by sortOrder.
        return latestPerBlock.values().stream()
                .filter(b -> !"delete".equalsIgnoreCase(b.getChangeAction()))
                .sorted(Comparator.comparingInt(
                        b -> b.getSortOrder() != null ? b.getSortOrder() : 0))
                .collect(Collectors.toList());
    }

    private static Integer parseVersion(String v) {
        if (v == null || v.isEmpty()) {
            return null;
        }
        try {
            return Integer.parseInt(v);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
