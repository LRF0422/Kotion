package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.message.core.IEventBus;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.core.version.service.AbstractVersionService;
import com.knowledge.wiki.service.entity.BlockVersion;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.entity.dto.BlockPatchItemDTO;
import com.knowledge.wiki.service.entity.dto.QueryPageVersionDTO;
import com.knowledge.wiki.service.entity.event.PagePublishEvent;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.mapper.PageVersionMapper;
import com.knowledge.wiki.service.service.IBlockVersionService;
import com.knowledge.wiki.service.service.IPageContentService;
import com.knowledge.wiki.service.service.IPageSnapshotService;
import com.knowledge.wiki.service.service.IPageVersionService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.json.JSONUtil;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class PageVersionServiceImpl extends AbstractVersionService<Page, PageVersion, PageVersionMapper>
        implements IPageVersionService {

    private static final String ROOT_PARENT_ID = "root";

    @Autowired
    private IEventBus eventBus;

    @Autowired
    private IPageSnapshotService pageSnapshotService;

    @Autowired
    private IBlockVersionService blockVersionService;

    @Autowired
    private IPageContentService pageContentService;

    /**
     * {@code @Lazy} to break the circular dependency:
     * {@code PageVersionServiceImpl -> BlockStorageService -> IPageVersionService}.
     */
    @Autowired
    @Lazy
    private BlockStorageService blockStorageService;

    @Override
    public PageVersion createVersion(Page subject, String laseVersion) {
        // Before creating, clean up any duplicate drafts
        cleanupDuplicateDrafts(subject.getId());

        PageVersion pageVersion = new PageVersion();
        pageVersion.setSubjectId(subject.getId());
        pageVersion.setStatus(VersionStatus.DRAFT);
        // Content is now stored in blocks; md5 is over the assembled JSON when available.
        pageVersion.setMd5Code(StrUtil.isBlank(subject.getContent()) ? null
                : DigestUtil.md5Hex(subject.getContent()));
        pageVersion
                .setVersion(StrUtil.isEmpty(laseVersion) ? "0" : String.valueOf((Integer.parseInt(laseVersion) + 1)));
        pageVersion.setParentId(subject.getParentId());
        pageVersion.setTitle(subject.getTitle());
        this.save(pageVersion);
        return pageVersion;
    }

    /**
     * Page version content lives in blocks now, so a single-row lookup is safe.
     */
    @Override
    public PageVersion getDraftVersion(Long subjectId) {
        return this.lambdaQuery()
                .eq(PageVersion::getSubjectId, subjectId)
                .eq(PageVersion::getStatus, VersionStatus.DRAFT)
                .one();
    }

    @Override
    public PageVersion getCurrentActiveVersion(Long subjectId) {
        return this.lambdaQuery()
                .eq(PageVersion::getSubjectId, subjectId)
                .eq(PageVersion::getStatus, VersionStatus.ACTIVE)
                .one();
    }

    /**
     * Clean up duplicate draft versions for a page, keeping only the latest.
     */
    private void cleanupDuplicateDrafts(Long subjectId) {
        if (subjectId == null) {
            return;
        }
        List<PageVersion> drafts = this.lambdaQuery()
                .eq(PageVersion::getSubjectId, subjectId)
                .eq(PageVersion::getStatus, VersionStatus.DRAFT)
                .orderByDesc(PageVersion::getCreateTime)
                .list();
        if (drafts != null && drafts.size() > 1) {
            log.warn("Cleaning up {} duplicate drafts for pageId={}", drafts.size() - 1, subjectId);
            for (int i = 1; i < drafts.size(); i++) {
                this.removeById(drafts.get(i).getId());
            }
        }
    }

    @Override
    public boolean hasChange(Page subject) {
        if (StrUtil.isBlank(subject.getContent())) {
            return false;
        }
        String md5Code = DigestUtil.md5Hex(subject.getContent());
        PageVersion current = getCurrentActiveVersion(subject.getId());
        if (current == null) {
            PageVersion pageVersion = this.getDraftVersion(subject.getId());
            return pageVersion == null || !md5Code.equals(pageVersion.getMd5Code());
        }
        return !md5Code.equals(current.getMd5Code());
    }

    @Override
    public void updateDraft(Page newValue, PageVersion oldValue) {
        if (hasChange(newValue)) {
            oldValue.setMd5Code(DigestUtil.md5Hex(newValue.getContent()));
        }
    }

    @Override
    public void publish(Long versionId) {
        super.publish(versionId);
        PagePublishEvent event = new PagePublishEvent(this);
        event.setVersionId(versionId);
        eventBus.dispatch(event);
    }

    @Override
    public IPage<PageVersion> getVersionHistory(QueryPageVersionDTO dto) {
        return this.lambdaQuery()
                .eq(dto.getPageId() != null, PageVersion::getSubjectId, dto.getPageId())
                .eq(StrUtil.isNotBlank(dto.getStatus()), PageVersion::getStatus, dto.getStatus())
                .eq(dto.getCreateUser() != null, PageVersion::getCreateUser, dto.getCreateUser())
                .orderByDesc(PageVersion::getCreateTime)
                .page(dto.page());
    }

    @Override
    public List<PageVersion> getAllVersionsByPageId(Long pageId) {
        return this.lambdaQuery()
                .eq(PageVersion::getSubjectId, pageId)
                .orderByDesc(PageVersion::getCreateTime)
                .list();
    }

    @Override
    public PageVersion getVersionById(Long versionId) {
        PageVersion version = this.getById(versionId);
        if (version == null) {
            throw WikiException.PAGE_VERSION_NOT_FOUND.newException();
        }
        return version;
    }

    /**
     * Rollback to a previous page version by computing the diff between the
     * target state (walk-back read) and the current state, then applying it
     * via {@link BlockStorageService#patchBlocks}. This re-uses the
     * Save = Publish path: the patch atomically writes block rows AND seals
     * a brand-new ACTIVE {@link PageVersion} containing only the rollback
     * delta as block-version rows.
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public PageVersion rollbackToVersion(Long pageId, Long targetVersionId, String changeSummary) {
        // Validate target version
        PageVersion targetVersion = this.getById(targetVersionId);
        if (targetVersion == null) {
            throw WikiException.PAGE_VERSION_NOT_FOUND.newException();
        }

        // Check if target version belongs to this page
        if (!targetVersion.getSubjectId().equals(pageId)) {
            throw WikiException.INVALID_PARAMETER.newException();
        }

        // Cannot rollback to draft version
        if (targetVersion.getStatus() == VersionStatus.DRAFT) {
            throw WikiException.CANNOT_ROLLBACK_TO_DRAFT.newException();
        }

        // Check if target version is already active
        PageVersion currentActive = getCurrentActiveVersion(pageId);
        if (currentActive != null && currentActive.getId().equals(targetVersionId)) {
            throw WikiException.VERSION_ALREADY_ACTIVE.newException();
        }

        // 1. Read target state via walk-back over wiki_block_version.
        List<BlockVersion> targetState = pageSnapshotService.getPageStateAtVersion(
                pageId, targetVersion.getVersion());

        // 2. Read current state from wiki_page_block.
        List<PageContent> currentBlocks = pageContentService.findByPageId(pageId);

        // 3. Build target descendants map for subtree assembly.
        Map<String, List<BlockVersion>> targetChildrenMap = new HashMap<>();
        List<BlockVersion> targetTopLevel = new ArrayList<>();
        for (BlockVersion bv : targetState) {
            String pid = bv.getParentId();
            if (StrUtil.isBlank(pid) || ROOT_PARENT_ID.equals(pid)) {
                targetTopLevel.add(bv);
            } else {
                targetChildrenMap.computeIfAbsent(pid, k -> new ArrayList<>()).add(bv);
            }
        }
        targetTopLevel.sort(Comparator.comparingInt(
                b -> b.getSortOrder() != null ? b.getSortOrder() : 0));
        targetChildrenMap.values().forEach(list -> list.sort(
                Comparator.comparingInt(b -> b.getSortOrder() != null ? b.getSortOrder() : 0)));

        // 4. Collect current top-level block ids for delete diff.
        Set<String> currentTopLevelIds = new HashSet<>();
        if (CollUtil.isNotEmpty(currentBlocks)) {
            for (PageContent pc : currentBlocks) {
                if (StrUtil.isBlank(pc.getParentId()) || ROOT_PARENT_ID.equals(pc.getParentId())) {
                    currentTopLevelIds.add(pc.getId());
                }
            }
        }

        // 5. Build BlockPatchItemDTO list (upserts + deletes) and blockOrder.
        List<BlockPatchItemDTO> changes = new ArrayList<>();
        List<String> blockOrder = new ArrayList<>();
        Set<String> targetTopLevelIds = new HashSet<>();

        for (BlockVersion top : targetTopLevel) {
            targetTopLevelIds.add(top.getBlockId());
            blockOrder.add(top.getBlockId());

            PageContent subtree = assembleSubtree(top, targetChildrenMap);
            BlockPatchItemDTO item = new BlockPatchItemDTO();
            item.setAction("upsert");
            item.setBlockId(top.getBlockId());
            item.setType(top.getType());
            item.setContent(JSONUtil.toJsonStr(subtree));
            // prevVersion left null: rollback bypasses optimistic concurrency
            // because we are explicitly overwriting the current state.
            changes.add(item);
        }

        for (String currentId : currentTopLevelIds) {
            if (!targetTopLevelIds.contains(currentId)) {
                BlockPatchItemDTO del = new BlockPatchItemDTO();
                del.setAction("delete");
                del.setBlockId(currentId);
                changes.add(del);
            }
        }

        // 6. Apply via patchBlocks — this re-uses Task 2 and atomically seals
        //    a new ACTIVE PageVersion containing the rollback delta.
        if (CollUtil.isEmpty(changes)) {
            log.info("rollbackToVersion: no diff between current state and target version {} for pageId={}, no-op",
                    targetVersion.getVersion(), pageId);
            return currentActive;
        }

        BlockStorageService.PatchResult patchResult =
                blockStorageService.patchBlocks(pageId, changes, blockOrder);

        if (patchResult == null || patchResult.getPageVersionId() == null) {
            log.warn("rollbackToVersion: patchBlocks did not produce a new PageVersion for pageId={}", pageId);
            return currentActive;
        }

        // 7. Tag the freshly-sealed PageVersion with rollback metadata.
        PageVersion newVersion = this.getById(patchResult.getPageVersionId());
        if (newVersion != null) {
            String summary = StrUtil.isNotBlank(changeSummary)
                    ? changeSummary
                    : "Rollback to version " + targetVersion.getVersion();
            newVersion.setChangeSummary(summary);
            newVersion.setTitle(targetVersion.getTitle());
            newVersion.setParentId(targetVersion.getParentId());
            this.updateById(newVersion);
        }

        return newVersion;
    }

    /**
     * Assemble a {@link PageContent} subtree rooted at the given top-level
     * {@link BlockVersion}, using a parentId -> children map. The result is
     * shaped like the JSON the frontend's DirtyTracker would emit for a
     * top-level block, suitable for {@link BlockPatchItemDTO#setContent} when
     * round-tripped through {@link JSONUtil#toJsonStr}.
     */
    private PageContent assembleSubtree(BlockVersion node,
            Map<String, List<BlockVersion>> childrenMap) {
        PageContent pc = new PageContent();
        pc.setId(node.getBlockId());
        pc.setType(node.getType());
        pc.setAttrs(node.getAttrs());
        pc.setMarks(node.getMarks());
        pc.setText(node.getText());

        List<PageContent> assembledChildren = new ArrayList<>();
        // Inline content (already nested inside the block, e.g. text runs)
        if (CollUtil.isNotEmpty(node.getContent())) {
            assembledChildren.addAll(node.getContent());
        }
        // Block-level children stored as separate rows.
        List<BlockVersion> kids = childrenMap.get(node.getBlockId());
        if (CollUtil.isNotEmpty(kids)) {
            for (BlockVersion kid : kids) {
                assembledChildren.add(assembleSubtree(kid, childrenMap));
            }
        }
        if (!assembledChildren.isEmpty()) {
            pc.setContent(assembledChildren);
        }
        return pc;
    }

    @Override
    public String compareVersions(Long sourceVersionId, Long targetVersionId) {
        PageVersion sourceVersion = this.getById(sourceVersionId);
        PageVersion targetVersion = this.getById(targetVersionId);

        if (sourceVersion == null || targetVersion == null) {
            throw WikiException.PAGE_VERSION_NOT_FOUND.newException();
        }

        // Both versions must belong to the same page
        if (!sourceVersion.getSubjectId().equals(targetVersion.getSubjectId())) {
            throw WikiException.INVALID_VERSION_COMPARISON.newException();
        }

        // Diff over the full block state at each version (walk-back), so the
        // comparison reflects what the page actually looked like, not just the
        // delta sealed at each version.
        Long pageId = sourceVersion.getSubjectId();
        List<BlockVersion> sourceBlocks = pageSnapshotService.getPageStateAtVersion(
                pageId, sourceVersion.getVersion());
        List<BlockVersion> targetBlocks = pageSnapshotService.getPageStateAtVersion(
                pageId, targetVersion.getVersion());

        String sourceText = sourceBlocks.stream()
                .map(b -> Func.toStr(b.getText(), ""))
                .collect(Collectors.joining("\n"));
        String targetText = targetBlocks.stream()
                .map(b -> Func.toStr(b.getText(), ""))
                .collect(Collectors.joining("\n"));

        return generateSimpleDiff(sourceText, targetText);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteDraft(Long pageId) {
        PageVersion draft = getDraftVersion(pageId);
        if (draft != null) {
            this.removeById(draft.getId());
        }
    }

    @Override
    public int getVersionCount(Long pageId) {
        return this.lambdaQuery()
                .eq(PageVersion::getSubjectId, pageId)
                .count().intValue();
    }

    /**
     * Generate simple text diff
     * Can be replaced with more sophisticated diff library like java-diff-utils
     */
    private String generateSimpleDiff(String source, String target) {
        if (source.equals(target)) {
            return "No changes";
        }

        StringBuilder diff = new StringBuilder();
        diff.append("Source length: ").append(source.length()).append(" chars\n");
        diff.append("Target length: ").append(target.length()).append(" chars\n");
        diff.append("Difference: ").append(Math.abs(source.length() - target.length())).append(" chars\n");

        return diff.toString();
    }

}
