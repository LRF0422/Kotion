package com.knowledge.wiki.service.service;

import java.util.List;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.version.service.IVersionService;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.entity.dto.QueryPageVersionDTO;

public interface IPageVersionService extends IVersionService<Page, PageVersion> {

    /**
     * Locking variant of {@code getCurrentActiveVersion} for write paths that
     * seal a new version: reads the ACTIVE row {@code FOR UPDATE} so concurrent
     * writers on the same page serialize instead of both sealing the same
     * version number. MUST be called inside a transaction.
     *
     * @param subjectId page ID
     * @return current active version, or null when none exists yet
     */
    PageVersion getCurrentActiveVersionForUpdate(Long subjectId);

    /**
     * Close the version the current editing session left open, turning it into
     * an explicit restore point.
     * <p>
     * Autosaves deliberately merge into one version per session, so without
     * this there is no way for a user to say "keep <i>this</i> exact state".
     * Sealing only flips the version's {@code sealKind}: no blocks are written,
     * and the version stays ACTIVE because it is still the latest state. The
     * next edit can no longer absorb into it, so it opens a fresh version.
     * </p>
     * Idempotent: sealing an already-sealed (or non-existent) version is a
     * no-op, so a double-click or a retried request cannot fragment history.
     *
     * @param pageId page ID
     * @return the sealed version, or {@code null} when the page has no version
     *         yet (nothing has been saved)
     */
    PageVersion sealActiveVersion(Long pageId);

    /**
     * Get version history list
     * 
     * @param dto query parameters
     * @return paginated version history
     */
    IPage<PageVersion> getVersionHistory(QueryPageVersionDTO dto);

    /**
     * Get all versions of a page
     * 
     * @param pageId page ID
     * @return list of all versions
     */
    List<PageVersion> getAllVersionsByPageId(Long pageId);

    /**
     * Get version by ID
     * 
     * @param versionId version ID
     * @return page version
     */
    PageVersion getVersionById(Long versionId);

    /**
     * Rollback to specific version
     * 
     * @param pageId          page ID
     * @param targetVersionId target version ID to rollback to
     * @param changeSummary   rollback summary
     * @return new version created from rollback
     */
    PageVersion rollbackToVersion(Long pageId, Long targetVersionId, String changeSummary);

    /**
     * Compare two versions
     * 
     * @param sourceVersionId source version ID
     * @param targetVersionId target version ID
     * @return comparison result with content differences
     */
    String compareVersions(Long sourceVersionId, Long targetVersionId);

    /**
     * Delete draft version
     * 
     * @param pageId page ID
     */
    void deleteDraft(Long pageId);

    /**
     * Get version count by page
     * 
     * @param pageId page ID
     * @return total version count
     */
    int getVersionCount(Long pageId);

}
