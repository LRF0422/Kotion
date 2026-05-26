package com.knowledge.wiki.service.service;

import java.util.List;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.version.service.IVersionService;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.entity.dto.QueryPageVersionDTO;

public interface IPageVersionService extends IVersionService<Page, PageVersion> {

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
