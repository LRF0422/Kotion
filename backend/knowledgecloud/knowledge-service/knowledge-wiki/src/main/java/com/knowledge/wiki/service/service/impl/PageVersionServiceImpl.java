package com.knowledge.wiki.service.service.impl;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.message.core.IEventBus;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.core.version.service.AbstractVersionService;
import com.knowledge.wiki.service.entity.BlockVersion;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.entity.dto.QueryPageVersionDTO;
import com.knowledge.wiki.service.entity.event.PagePublishEvent;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.mapper.PageVersionMapper;
import com.knowledge.wiki.service.service.IBlockVersionService;
import com.knowledge.wiki.service.service.IPageSnapshotService;
import com.knowledge.wiki.service.service.IPageVersionService;

import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.digest.DigestUtil;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class PageVersionServiceImpl extends AbstractVersionService<Page, PageVersion, PageVersionMapper>
        implements IPageVersionService {

    @Autowired
    private IEventBus eventBus;

    @Autowired
    private IPageSnapshotService pageSnapshotService;

    @Autowired
    private IBlockVersionService blockVersionService;

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

        // Create new version from target version (content is stored in blocks)
        PageVersion newVersion = new PageVersion();
        newVersion.setSubjectId(pageId);
        newVersion.setTitle(targetVersion.getTitle());
        newVersion.setParentId(targetVersion.getParentId());
        newVersion.setMd5Code(targetVersion.getMd5Code());
        newVersion.setStatus(VersionStatus.DRAFT);

        // Set version number
        String latestVersion = currentActive != null ? currentActive.getVersion() : "0";
        newVersion.setVersion(String.valueOf(Integer.parseInt(latestVersion) + 1));

        // Set change summary
        String summary = StrUtil.isNotBlank(changeSummary)
                ? changeSummary
                : "Rollback to version " + targetVersion.getVersion();
        newVersion.setChangeSummary(summary);

        this.save(newVersion);

        // Publish the new version
        this.publish(newVersion.getId());

        // Restore block rows from the target version's block snapshot using PageSnapshotService
        // Content will be retrieved from block snapshots, no fallback needed
        pageSnapshotService.restoreFromSnapshot(pageId, targetVersionId, null);

        return newVersion;
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

        // Diff over the historical block snapshots of each version
        List<BlockVersion> sourceBlocks = blockVersionService.getBlocksAtVersion(sourceVersionId);
        List<BlockVersion> targetBlocks = blockVersionService.getBlocksAtVersion(targetVersionId);

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
