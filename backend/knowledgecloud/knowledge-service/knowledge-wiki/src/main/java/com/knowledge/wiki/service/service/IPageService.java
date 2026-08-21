package com.knowledge.wiki.service.service;

import java.util.List;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.version.service.ISubjectService;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.entity.dto.UpdateBlockDTO;
import com.knowledge.wiki.service.entity.dto.BlockPatchItemDTO;
import com.knowledge.wiki.service.entity.dto.QueryPageDTO;
import com.knowledge.wiki.service.entity.dto.SaveTemplateDTO;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.service.impl.BlockStorageService;
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

    /**
     * 更新指定块的内容
     * 
     * @param updateDto 更新信息
     * @return 是否更新成功
     */
    boolean updateBlock(UpdateBlockDTO updateDto);

    List<Page> getBySpaceId(Long spaceId);

    List<PageVersion> getAllActiveVersions();

    void copySpacePage(Long spaceId, Long targetSpaceId);

    void refreshBlock(List<Long> versionIds);

    /**
     * Apply an incremental block-level patch produced by the frontend
     * DirtyTracker, as an autosave. Equivalent to
     * {@link #patchBlocks(Long, List, List, boolean)} with
     * {@code checkpoint = false}.
     *
     * @param pageId     the page ID
     * @param changes    list of block-level changes (upsert / delete)
     * @param blockOrder ordered list of all current top-level block ids
     * @return PatchResult with statistics and any detected conflicts
     */
    BlockStorageService.PatchResult patchBlocks(Long pageId, List<BlockPatchItemDTO> changes, List<String> blockOrder);

    /**
     * Apply an incremental block-level patch produced by the frontend
     * DirtyTracker. Only updates the blocks listed in {@code changes} and
     * propagates the top-level ordering from {@code blockOrder}.
     * <p>
     * Block rows are always written. Whether the patch also <i>seals</i> a
     * version is a separate decision: an autosave merges into the version the
     * current editing session already opened, while a checkpoint closes that
     * version and starts a fresh one. See
     * {@link BlockStorageService#patchBlocks(Long, List, List, boolean)}.
     * </p>
     *
     * @param pageId     the page ID
     * @param changes    list of block-level changes (upsert / delete)
     * @param blockOrder ordered list of all current top-level block ids
     * @param checkpoint {@code true} to force a new, non-absorbable version —
     *                   an explicit save, a rollback, or an import
     * @return PatchResult with statistics and any detected conflicts
     */
    BlockStorageService.PatchResult patchBlocks(Long pageId, List<BlockPatchItemDTO> changes, List<String> blockOrder,
            boolean checkpoint);

    /**
     * Bulk-replace a page's blocks for a first import / paste of a very large
     * document. Skips per-block version history and seals no PageVersion,
     * writing blocks in independent batched transactions so a million-block
     * import never times out. See
     * {@link BlockStorageService#bulkReplaceBlocks(Long, List)}.
     *
     * @param pageId  the page ID
     * @param changes the full set of top-level blocks (all upserts)
     * @return PatchResult with created count
     */
    BlockStorageService.PatchResult bulkReplaceBlocks(Long pageId, List<BlockPatchItemDTO> changes);

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
