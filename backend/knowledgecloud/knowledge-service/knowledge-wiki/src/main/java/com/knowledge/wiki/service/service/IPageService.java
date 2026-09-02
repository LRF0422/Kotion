package com.knowledge.wiki.service.service;

import java.util.List;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.version.service.ISubjectService;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.entity.dto.QueryPageDTO;
import com.knowledge.wiki.service.entity.dto.SaveTemplateDTO;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.entity.vo.PageBlockVO;
import com.knowledge.wiki.service.entity.enums.PagePermissionEnum;

import cn.hutool.core.lang.tree.Tree;

public interface IPageService extends ISubjectService<Page> {

    IPageVersionService getPageVersionService();

    IPagePermissionService getPagePermissionService();

    IPageContentService getPageContentService();

    Page createPage(Page page, boolean publish);

    Page createByTemplate(Long templateId, Long spaceId, Long partenId);

    Page getPageContent(Long pageId);

    void moveToTrash(Long pageId);

    void restore(Long pageId);

    void delete(Long pageId);

    IPage<Page> queryRecentPage(QueryPageDTO dto);

    void saveAsTemplate(Long pageId, SaveTemplateDTO dto);

    List<Tree<Long>> getPageTree(Long spaceId, String searchValue);

    Page copyPage(Long pageId, String... ignore);

    List<Page> getParents(Long pageId);

    void addPermission(Long userId, Long pageId, List<PagePermissionEnum> permissions);

    PageBlockVO getBlockInfo(String id);

    /**
     * 获取块的详细信息，包含上下文和父子关系
     * 
     * @param blockId 块ID
     * @return 目标块及其子节点，未找到返回null
     */
    PageContent getBlockDetailInfo(String blockId);

    List<Page> getBySpaceId(Long spaceId);

    List<PageVersion> getAllActiveVersions();

    void copySpacePage(Long spaceId, Long targetSpaceId);

    boolean hasComponentPages(Long spaceId);

    void refreshBlock(List<Long> versionIds);

    /**
     * Assemble and return page content JSON from block rows.
     *
     * @param pageId the page ID
     * @return assembled JSON string, or null if no block storage exists
     */
    String getPageContentFromBlocks(Long pageId);

    /**
     * Move a page to a different parent and/or space.
     * Updates ancestors chain for the page and all descendants.
     *
     * @param pageId         the page to move
     * @param targetSpaceId  target space (null = same space)
     * @param targetParentId target parent page ID (0 = top-level)
     */
    void movePage(Long pageId, Long targetSpaceId, Long targetParentId);

}
