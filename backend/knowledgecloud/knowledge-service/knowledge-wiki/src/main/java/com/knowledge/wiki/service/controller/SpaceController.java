package com.knowledge.wiki.service.controller;

import java.util.List;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.application.SpaceApplication;
import com.knowledge.wiki.service.entity.dto.CollaborationInvitationRequestDTO;
import com.knowledge.wiki.service.entity.dto.CollaborationInvitationResponseDTO;
import com.knowledge.wiki.service.entity.dto.MovePageDTO;
import com.knowledge.wiki.service.entity.dto.PageDTO;
import com.knowledge.wiki.service.entity.dto.QueryBlockVersionDTO;
import com.knowledge.wiki.service.entity.dto.QueryFavoriteDTO;
import com.knowledge.wiki.service.entity.dto.QueryPageBlockDTO;
import com.knowledge.wiki.service.entity.dto.QueryPageDTO;
import com.knowledge.wiki.service.entity.dto.QueryPageTemplateDTO;
import com.knowledge.wiki.service.entity.dto.QuerySpaceDTO;
import com.knowledge.wiki.service.entity.dto.PatchPageBlocksDTO;
import com.knowledge.wiki.service.entity.dto.PatchResultDTO;
import com.knowledge.wiki.service.entity.dto.ShareLinkRequestDTO;
import com.knowledge.wiki.service.entity.dto.SaveTemplateDTO;
import com.knowledge.wiki.service.entity.dto.SpaceDTO;
import com.knowledge.wiki.service.entity.dto.TemplateDTO;
import com.knowledge.wiki.service.entity.dto.UpdateBlockDTO;
import com.knowledge.wiki.service.entity.vo.PageBlockDetailVO;
import com.knowledge.wiki.service.entity.dto.UpdatePermissionRequestDTO;
import com.knowledge.wiki.service.entity.vo.PageBlockVO;
import com.knowledge.wiki.service.entity.vo.PageContentVO;
import com.knowledge.wiki.service.entity.vo.PageVO;
import com.knowledge.wiki.service.entity.vo.SpaceVO;
import com.knowledge.wiki.service.entity.vo.InvitedPageVO;
import com.knowledge.wiki.service.entity.vo.BacklinkVO;
import com.knowledge.wiki.service.entity.vo.SpaceGraphVO;
import com.knowledge.wiki.service.entity.vo.BlockVersionVO;
import com.knowledge.wiki.service.entity.PageContent;

import cn.hutool.core.lang.tree.Tree;

@RestController
@RequestMapping("/space")
public class SpaceController {

    @Autowired
    private SpaceApplication spaceApplication;

    @PostMapping
    public R<?> ceate(@Valid @RequestBody SpaceDTO dto) {
        spaceApplication.createSpace(dto);
        return R.success();
    }

    @GetMapping("/personal")
    public R<SpaceVO> personal() {
        return R.data(spaceApplication.getPersonalSpace());
    }

    @GetMapping("/list")
    public R<IPage<SpaceVO>> page(QuerySpaceDTO dto) {
        return R.data(spaceApplication.page(dto));
    }

    @GetMapping({ "/templates", "/public/templates" })
    public R<IPage<SpaceVO>> templates(QuerySpaceDTO dto) {
        dto.setTemplate(true);
        return R.data(spaceApplication.page(dto));
    }

    @GetMapping("/{id}/detail")
    public R<SpaceVO> spaceDetail(@PathVariable("id") Long id) {
        return R.data(spaceApplication.spaceDetail(id));
    }

    @PostMapping("/{id}/favorite")
    public R<?> addFavoriteSpace(@PathVariable("id") Long id) {
        spaceApplication.addFavoriteSpace(id);
        return R.success();
    }

    @GetMapping("/{id}/page/tree")
    public R<List<Tree<Long>>> pageTree(@PathVariable("id") Long id,
            @RequestParam(value = "searchValue", required = false) String searchValue) {
        return R.data(spaceApplication.getSpacePageTree(id, searchValue));
    }

    @GetMapping("/page/{id}/content")
    public R<PageVO> pageContent(@PathVariable("id") Long id) {
        return R.data(spaceApplication.getPageContent(id));
    }

    @DeleteMapping("/page/{id}/trash")
    public R<?> moveToTrash(@PathVariable("id") Long id) {
        spaceApplication.movePageToTrash(id);
        return R.success();
    }

    @PostMapping("/page/{id}/template")
    public R<?> savePageAsTemplate(@PathVariable("id") Long id,
            @RequestBody(required = false) SaveTemplateDTO dto) {
        spaceApplication.savePageAsTemplate(id, dto);
        return R.success();
    }

    @DeleteMapping("/page/template/{id}")
    public R<?> deleteTemplate(@PathVariable("id") Long id) {
        spaceApplication.deleteTemplate(id);
        return R.success();
    }

    @PostMapping("/page/{id}/favorite")
    public R<?> addFavoritePage(@PathVariable("id") Long id) {
        spaceApplication.addFavoritePage(id);
        return R.success();
    }

    @GetMapping("/page/templates")
    public R<List<PageVO>> queryTemplates(QueryPageTemplateDTO dto) {
        return R.data(spaceApplication.queryTemplate(dto));
    }

    /**
     * Get templates scoped to a specific space (team space template library)
     * GET /knowledge-wiki/space/{spaceId}/templates
     */
    @GetMapping("/{spaceId}/page/templates")
    public R<List<PageVO>> getSpaceTemplates(@PathVariable("spaceId") Long spaceId) {
        return R.data(spaceApplication.getSpaceTemplates(spaceId));
    }

    @GetMapping("/page/favorites")
    public R<List<PageVO>> getFavoritePages(QueryFavoriteDTO dto) {
        return R.data(spaceApplication.queryFavoritePage(dto));
    }

    @GetMapping("/page/recent")
    public R<IPage<PageVO>> recentPage(QueryPageDTO dto) {
        return R.data(spaceApplication.queryRecentPage(dto));
    }

    @PostMapping("/page")
    public R<PageVO> createPage(@Valid @RequestBody PageDTO dto) {
        return R.data(spaceApplication.createPage(dto));
    }

    @GetMapping("/page/list")
    public R<IPage<PageVO>> queryPage(QueryPageDTO dto) {
        return R.data(spaceApplication.queryPage(dto));
    }

    @PutMapping("/page/{id}/restore")
    public R<IPage<PageVO>> restorePage(@PathVariable("id") Long id) {
        spaceApplication.restorePage(id);
        return R.success();
    }

    /**
     * Move page to a different parent / space
     * PUT /knowledge-wiki/space/page/{id}/move
     */
    @PutMapping("/page/{id}/move")
    public R<?> movePage(@PathVariable("id") Long id, @Valid @RequestBody MovePageDTO dto) {
        spaceApplication.movePage(id, dto);
        return R.success();
    }

    @GetMapping("/page/blocks")
    public R<IPage<PageContentVO>> queryBlocks(QueryPageBlockDTO dto) {
        return R.data(spaceApplication.queryPageBlock(dto));
    }

    @GetMapping("/page/block")
    public R<PageBlockVO> queryBlocks(@RequestParam("id") String id) {
        return R.data(spaceApplication.getBlockInfo(id));
    }

    /**
     * 获取块详细信息（包含上下文）
     * GET /knowledge-wiki/space/page/block/detail/{blockId}
     */
    @GetMapping("/page/block/detail/{blockId}")
    public R<PageBlockDetailVO> getBlockDetail(@PathVariable("blockId") String blockId) {
        return R.data(spaceApplication.getBlockDetailInfo(blockId));
    }

    /**
     * 更新块内容
     * PUT /knowledge-wiki/space/page/block/{blockId}
     */
    @PutMapping("/page/block/{blockId}")
    public R<?> updateBlock(@PathVariable("blockId") String blockId,
            @Valid @RequestBody UpdateBlockDTO dto) {
        dto.setBlockId(blockId);
        spaceApplication.updateBlock(dto);
        return R.success();
    }

    /**
     * 增量保存页面块（仅写入发生变更的顶层块）
     * PATCH /knowledge-wiki/space/page/{pageId}/blocks
     */
    @PatchMapping("/page/{pageId}/blocks")
    public R<PatchResultDTO> patchPageBlocks(@PathVariable("pageId") Long pageId,
            @Valid @RequestBody PatchPageBlocksDTO dto) {
        dto.setPageId(pageId);
        PatchResultDTO result = spaceApplication.patchPageBlocks(dto);
        return R.data(result);
    }

    /**
     * 批量替换页面块（首次导入/粘贴大文档专用快路径，分片独立事务、单一新版本、无逐块版本历史）
     * POST /knowledge-wiki/space/page/{pageId}/blocks/bulk
     */
    @PostMapping("/page/{pageId}/blocks/bulk")
    public R<PatchResultDTO> bulkReplacePageBlocks(@PathVariable("pageId") Long pageId,
            @Valid @RequestBody PatchPageBlocksDTO dto) {
        dto.setPageId(pageId);
        PatchResultDTO result = spaceApplication.bulkReplacePageBlocks(dto);
        return R.data(result);
    }

    /**
     * 按内容搜索块
     * GET
     * /knowledge-wiki/space/page/block/search?keyword={keyword}&pageId={pageId}&spaceId={spaceId}
     */
    @GetMapping("/page/block/search")
    public R<List<PageBlockDetailVO>> searchBlocks(@RequestParam("keyword") String keyword,
            @RequestParam(value = "pageId", required = false) Long pageId,
            @RequestParam(value = "spaceId", required = false) Long spaceId) {
        return R.data(spaceApplication.searchBlocks(keyword, pageId, spaceId));
    }

    @GetMapping("/page/{id}/backlinks")
    public R<List<BacklinkVO>> getPageBacklinks(@PathVariable("id") Long id) {
        return R.data(spaceApplication.getPageBacklinks(id));
    }

    @GetMapping("/block/{blockId}/backlinks")
    public R<List<BacklinkVO>> getBlockBacklinks(@PathVariable("blockId") String blockId) {
        return R.data(spaceApplication.getBlockBacklinks(blockId));
    }

    /**
     * Page relation graph across every space the current user can see.
     * Nodes are pages; edges are page-level references from wiki_link.
     * GET /knowledge-wiki/space/graph
     */
    @GetMapping("/graph")
    public R<SpaceGraphVO> spaceGraph() {
        return R.data(spaceApplication.getSpaceGraph());
    }

    /**
     * Create collaboration invitation
     * POST /knowledge-wiki/space/collaborationInvitation
     */
    @PostMapping("/collaborationInvitation")
    public R<CollaborationInvitationResponseDTO> collaborationInvitation(
            @Valid @RequestBody CollaborationInvitationRequestDTO dto) {
        return R.data(spaceApplication.createCollaborationInvitation(dto));
    }

    @PostMapping("/template")
    public R<?> postMethodName(@RequestBody TemplateDTO dto) {
        spaceApplication.saveAsTemplate(dto);
        return R.success();
    }

    @GetMapping("/page/block/refresh")
    public R<?> refreshBlock() {
        spaceApplication.refreshBlock();
        return R.success();
    }

    // ==================== Collaboration API Endpoints ====================

    /**
     * Get space members
     * GET /knowledge-wiki/space/:id/members
     */
    @GetMapping("/{id}/members")
    public R<?> getSpaceMembers(@PathVariable("id") Long id) {
        return R.data(spaceApplication.getSpaceMembers(id));
    }

    /**
     * Get page collaborators
     * GET /knowledge-wiki/space/page/:pageId/collaborators
     */
    @GetMapping("/page/{pageId}/collaborators")
    public R<?> getPageCollaborators(@PathVariable("pageId") Long pageId) {
        return R.data(spaceApplication.getPageCollaborators(pageId));
    }

    /**
     * Update collaborator permission
     */
    @PutMapping("/page/{pageId}/collaborator/{userId}/permission")
    public R<?> updateCollaboratorPermission(@PathVariable("pageId") Long pageId,
            @PathVariable("userId") Long userId,
            @RequestBody UpdatePermissionRequestDTO dto) {
        spaceApplication.updateCollaboratorPermission(pageId, userId, dto.getPermission());
        return R.success();
    }

    /**
     * Remove page collaborator
     */
    @DeleteMapping("/page/{pageId}/collaborator/{userId}")
    public R<?> removePageCollaborator(@PathVariable("pageId") Long pageId,
            @PathVariable("userId") Long userId) {
        spaceApplication.removePageCollaborator(pageId, userId);
        return R.success();
    }

    /**
     * Generate share link
     */
    @PostMapping("/page/{pageId}/share-link")
    public R<?> generateShareLink(@PathVariable("pageId") Long pageId,
            @RequestBody ShareLinkRequestDTO dto) {
        return R.data(spaceApplication.generateShareLink(pageId, dto));
    }

    /**
     * Get pages that current user has been invited to collaborate on
     * GET /knowledge-wiki/space/page/invited
     */
    @GetMapping("/page/invited")
    public R<List<InvitedPageVO>> getInvitedPages() {
        return R.data(spaceApplication.getInvitedPages());
    }

    // ==================== Version Management Endpoints ====================

    /**
     * Get page version history
     * GET /knowledge-wiki/space/page/:pageId/versions
     */
    @GetMapping("/page/{pageId}/versions")
    public R<IPage<com.knowledge.wiki.service.entity.PageVersion>> getPageVersionHistory(
            @PathVariable("pageId") Long pageId,
            com.knowledge.wiki.service.entity.dto.QueryPageVersionDTO dto) {
        dto.setPageId(pageId);
        return R.data(spaceApplication.getPageVersionHistory(dto));
    }

    /**
     * Get all versions of a page (simplified list)
     * GET /knowledge-wiki/space/page/:pageId/versions/all
     */
    @GetMapping("/page/{pageId}/versions/all")
    public R<List<com.knowledge.wiki.service.entity.PageVersion>> getAllPageVersions(
            @PathVariable("pageId") Long pageId) {
        return R.data(spaceApplication.getPageVersions(pageId));
    }

    /**
     * Get specific version content
     * GET /knowledge-wiki/space/page/version/:versionId
     */
    @GetMapping("/page/version/{versionId}")
    public R<com.knowledge.wiki.service.entity.PageVersion> getPageVersion(
            @PathVariable("versionId") Long versionId) {
        return R.data(spaceApplication.getPageVersion(versionId));
    }

    /**
     * Compare two versions
     * POST /knowledge-wiki/space/page/versions/compare
     */
    @PostMapping("/page/versions/compare")
    public R<String> compareVersions(
            @Valid @RequestBody com.knowledge.wiki.service.entity.dto.CompareVersionDTO dto) {
        return R.data(spaceApplication.compareVersions(
                dto.getSourceVersionId(),
                dto.getTargetVersionId()));
    }

    /**
     * Delete draft version
     * DELETE /knowledge-wiki/space/page/:pageId/draft
     */
    @DeleteMapping("/page/{pageId}/draft")
    public R<?> deleteDraft(@PathVariable("pageId") Long pageId) {
        spaceApplication.deleteDraft(pageId);
        return R.success();
    }

    /**
     * Get version count
     * GET /knowledge-wiki/space/page/:pageId/versions/count
     */
    @GetMapping("/page/{pageId}/versions/count")
    public R<Integer> getVersionCount(@PathVariable("pageId") Long pageId) {
        return R.data(spaceApplication.getVersionCount(pageId));
    }

    // ==================== Block Version API ====================

    /**
     * 获取块的版本历史
     * GET /knowledge-wiki/space/page/block/{blockId}/versions
     */
    @GetMapping("/page/block/{blockId}/versions")
    public R<List<BlockVersionVO>> getBlockHistory(@PathVariable("blockId") String blockId) {
        return R.data(spaceApplication.getBlockHistory(blockId));
    }

    /**
     * 获取某个页面版本下的所有块快照
     * GET /knowledge-wiki/space/page/version/{versionId}/blocks
     */
    @GetMapping("/page/version/{versionId}/blocks")
    public R<List<BlockVersionVO>> getBlocksAtPageVersion(@PathVariable("versionId") Long versionId) {
        return R.data(spaceApplication.getBlocksAtPageVersion(versionId));
    }

    /**
     * 分页查询块版本历史（支持多条件筛选）
     * GET
     * /knowledge-wiki/space/page/block/versions?blockId=xxx&pageId=xxx&pageVersionId=xxx&pageVersion=xxx&type=xxx&current=1&pageSize=10
     */
    @GetMapping("/page/block/versions")
    public R<IPage<BlockVersionVO>> getBlockVersionHistory(
            QueryBlockVersionDTO dto) {
        return R.data(spaceApplication.getBlockVersionHistory(dto));
    }

    // ==================== Page Tags & Featured API ====================

    /**
     * Toggle pin status of a page
     * PUT /knowledge-wiki/space/{spaceId}/page/{pageId}/pin
     */
    @PutMapping("/{spaceId}/page/{pageId}/pin")
    public R<?> togglePagePin(@PathVariable("spaceId") Long spaceId,
            @PathVariable("pageId") Long pageId) {
        spaceApplication.togglePagePin(spaceId, pageId);
        return R.success();
    }

    /**
     * Get pinned pages for a space
     * GET /knowledge-wiki/space/{spaceId}/page/pinned
     */
    @GetMapping("/{spaceId}/page/pinned")
    public R<List<PageVO>> getPinnedPages(@PathVariable("spaceId") Long spaceId) {
        return R.data(spaceApplication.getPinnedPages(spaceId));
    }

    /**
     * Update page tags
     * PUT /knowledge-wiki/space/page/{pageId}/tags
     */
    @PutMapping("/page/{pageId}/tags")
    public R<?> updatePageTags(@PathVariable("pageId") Long pageId,
            @RequestBody List<String> tags) {
        spaceApplication.updatePageTags(pageId, tags);
        return R.success();
    }

    /**
     * Get all tags used in a space
     * GET /knowledge-wiki/space/{spaceId}/tags
     */
    @GetMapping("/{spaceId}/tags")
    public R<List<String>> getSpaceTags(@PathVariable("spaceId") Long spaceId) {
        return R.data(spaceApplication.getSpaceTags(spaceId));
    }

}
