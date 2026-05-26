package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.BlockVersion;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.mapper.BlockVersionMapper;
import com.knowledge.wiki.service.service.IPageContentService;
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
    private IPageContentService pageContentService;

    @Autowired
    private BlockStorageService blockStorageService;

    @Autowired
    private BlockChangeRecorder blockChangeRecorder;

    /**
     * Finalize block change records for a published page version.
     * <p>
     * Two-step process:
     * </p>
     * <ol>
     *   <li>Seal pending change rows (created by auto-saves since the last
     *       publish) by back-filling {@code page_version_id} and
     *       {@code page_version}.</li>
     *   <li>For every block whose current state was NOT touched since the last
     *       publish (i.e., no pending row exists), insert a carry-forward
     *       snapshot row tagged with the new page version and a {@code null}
     *       {@code change_action}, so that callers can retrieve the full state
     *       of the page at this version with a single query.</li>
     * </ol>
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

        // 1. Seal incremental change rows accumulated since last publish.
        blockChangeRecorder.sealPendingChanges(pageId, pageVersionId, pageVersion);

        // 2. Carry-forward snapshot for unchanged blocks so reads at this version
        //    return the full page state without walking history.
        List<PageContent> currentBlocks = pageContentService.findByPageId(pageId);
        if (CollUtil.isEmpty(currentBlocks)) {
            log.debug("snapshotBlocks: no current blocks for pageId={}", pageId);
            return;
        }

        Set<String> alreadyTagged = new HashSet<>();
        List<BlockVersion> sealedAtThisVersion = this.lambdaQuery()
                .select(BlockVersion::getBlockId)
                .eq(BlockVersion::getPageVersionId, pageVersionId)
                .list();
        if (CollUtil.isNotEmpty(sealedAtThisVersion)) {
            alreadyTagged = sealedAtThisVersion.stream()
                    .map(BlockVersion::getBlockId)
                    .collect(Collectors.toCollection(HashSet::new));
        }

        List<BlockVersion> carryForward = new ArrayList<>();
        for (PageContent block : currentBlocks) {
            if (alreadyTagged.contains(block.getId())) {
                continue;
            }
            BlockVersion row = new BlockVersion();
            row.setBlockId(block.getId());
            row.setPageId(pageId);
            row.setPageVersionId(pageVersionId);
            row.setPageVersion(pageVersion);
            row.setVersion(block.getVersion() != null ? block.getVersion() : 1);
            // null change_action denotes a carry-forward snapshot (no edit this cycle).
            row.setChangeAction(null);
            row.setPrevVersion(null);
            row.setType(block.getType());
            row.setAttrs(block.getAttrs());
            row.setContent(block.getContent());
            row.setMarks(block.getMarks());
            row.setText(block.getText());
            row.setParentId(block.getParentId());
            row.setPath(block.getPath());
            row.setSortOrder(block.getSortOrder());
            carryForward.add(row);
        }

        if (!carryForward.isEmpty()) {
            this.saveBatch(carryForward);
        }

        log.debug("snapshotBlocks pageId={} pageVersionId={} pageVersion={} sealed={} carryForward={}",
                pageId, pageVersionId, pageVersion, alreadyTagged.size(), carryForward.size());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void restoreFromSnapshot(Long pageId, Long versionId, String fallbackContent) {
        // Get the snapshot blocks
        List<BlockVersion> blockSnapshots = getSnapshotBlocks(versionId);

        if (CollUtil.isNotEmpty(blockSnapshots)) {
            // Convert BlockVersion snapshots to PageContent and flatten/save
            PageContent root = assembleTreeFromSnapshots(blockSnapshots, pageId);
            if (root != null) {
                blockStorageService.flattenAndSave(pageId, root);
            }
        } else if (StrUtil.isNotBlank(fallbackContent)) {
            // Fallback: restore from version JSON content passed as parameter
            blockStorageService.flattenAndSave(pageId, fallbackContent);
        }

        log.debug("Restored pageId={} from snapshot versionId={}", pageId, versionId);
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
     * Assemble a PageContent tree from block version snapshots.
     */
    private PageContent assembleTreeFromSnapshots(List<BlockVersion> snapshots, Long pageId) {
        if (CollUtil.isEmpty(snapshots)) {
            return null;
        }

        // Convert BlockVersion to PageContent for tree assembly
        java.util.Map<String, java.util.List<PageContent>> childrenMap = new java.util.HashMap<>();
        java.util.List<PageContent> rootChildren = new java.util.ArrayList<>();

        for (BlockVersion bv : snapshots) {
            PageContent pc = new PageContent();
            pc.setId(bv.getBlockId());
            pc.setType(bv.getType());
            pc.setAttrs(bv.getAttrs());
            pc.setContent(bv.getContent());
            pc.setMarks(bv.getMarks());
            pc.setText(bv.getText());
            pc.setParentId(bv.getParentId());
            pc.setPageId(pageId);
            pc.setPath(bv.getPath());
            pc.setSortOrder(bv.getSortOrder());

            String pid = bv.getParentId();
            if (StrUtil.isBlank(pid) || "root".equals(pid)) {
                rootChildren.add(pc);
            } else {
                childrenMap.computeIfAbsent(pid, k -> new java.util.ArrayList<>()).add(pc);
            }
        }

        // Sort by sortOrder
        rootChildren.sort(java.util.Comparator.comparingInt(b -> b.getSortOrder() != null ? b.getSortOrder() : 0));
        childrenMap.values().forEach(list -> list.sort(
                java.util.Comparator.comparingInt(b -> b.getSortOrder() != null ? b.getSortOrder() : 0)));

        // Build root
        PageContent root = new PageContent();
        root.setType("doc");
        root.setPageId(pageId);
        root.setContent(rootChildren);

        // Attach children recursively
        for (PageContent child : rootChildren) {
            attachChildrenRecursive(child, childrenMap);
        }

        return root;
    }

    private void attachChildrenRecursive(PageContent node,
            java.util.Map<String, java.util.List<PageContent>> childrenMap) {
        java.util.List<PageContent> children = childrenMap.get(node.getId());
        if (CollUtil.isNotEmpty(children)) {
            // Merge: keep existing inline content, add block children
            java.util.List<PageContent> existing = node.getContent();
            if (CollUtil.isNotEmpty(existing)) {
                java.util.List<PageContent> merged = new java.util.ArrayList<>(existing);
                merged.addAll(children);
                node.setContent(merged);
            } else {
                node.setContent(children);
            }
            for (PageContent child : children) {
                attachChildrenRecursive(child, childrenMap);
            }
        }
    }
}
