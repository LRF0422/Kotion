package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;

import cn.hutool.json.JSONObject;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.common.base.Pageable;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.core.version.service.AbstractSubjectService;
import com.knowledge.wiki.service.converter.PageConverter;
import com.knowledge.wiki.service.cache.BlockCacheService;
import com.knowledge.wiki.service.entity.BlockIndex;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.entity.PagePermission;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.entity.WikiLink;
import com.knowledge.wiki.service.entity.enums.PagePermissionEnum;
import com.knowledge.wiki.service.entity.dto.UpdateBlockDTO;
import com.knowledge.wiki.service.entity.dto.BlockPatchItemDTO;
import com.knowledge.wiki.service.entity.vo.PageBlockVO;
import com.knowledge.wiki.service.service.IBlockIndexService;
import com.knowledge.wiki.service.service.IPageSnapshotService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.knowledge.wiki.service.entity.enums.PageStatus;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.entity.event.PagePublishEvent;
import com.knowledge.wiki.service.mapper.PageMapper;
import com.knowledge.wiki.service.service.IPageContentService;
import com.knowledge.wiki.service.service.IPagePermissionService;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPageVersionService;
import com.knowledge.wiki.service.service.IWikiLinkService;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.date.DateUtil;
import cn.hutool.core.lang.tree.Tree;
import cn.hutool.core.lang.tree.TreeUtil;
import cn.hutool.core.util.ObjectUtil;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class PageServiceImpl extends AbstractSubjectService<PageMapper, Page> implements IPageService {

    @Autowired
    @Getter
    private IPageVersionService pageVersionService;
    @Autowired
    @Getter
    private IPagePermissionService pagePermissionService;
    @Autowired
    @Getter
    private IPageContentService pageContentService;
    @Autowired
    private IWikiLinkService wikiLinkService;

    @Autowired
    private IBlockIndexService blockIndexService;

    @Autowired
    private BlockCacheService blockCacheService;

    @Autowired
    private BlockStorageService blockStorageService;

    @Autowired
    private IPageSnapshotService pageSnapshotService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Page createPage(Page page, boolean publish) {
        // Validation
        if (page.getSpaceId() == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }

        if (page.getId() != null) {
            Page db = this.getById(page.getId());
            if (db == null) {
                throw WikiException.PAGE_NOT_FOUND.newException();
            }
            PageConverter.INSTANCE.update(page, db);
            this.updateById(db);
            // Block storage is the single source of truth (no draft/publish version).
            if (StrUtil.isNotBlank(db.getContent())) {
                blockStorageService.flattenAndSave(db.getId(), db.getContent());
            }
        } else {
            page.setStatus(PageStatus.ACTIVE);
            if (!ObjectUtil.equal(page.getParentId(), Page.TOP_PAGE_ID)) {
                Page parent = this.getById(page.getParentId());
                if (parent == null) {
                    throw WikiException.PAGE_PARENT_NOT_FOUND.newException();
                }
                page.setAncestors(parent.getAncestors() + "," + parent.getId());
            }
            this.save(page);
            // Block storage is the single source of truth (no draft/publish version).
            if (StrUtil.isNotBlank(page.getContent())) {
                blockStorageService.flattenAndSave(page.getId(), page.getContent());
            }
        }
        // The `publish` flag is retained for interface compatibility but is now a
        // no-op: draft/publish versioning has been removed; saving is the only state.
        return page;
    }

    @Override
    public List<Tree<Long>> getPageTree(Long spaceId, String searchValue) {
        List<Page> allPage = this.lambdaQuery()
                .eq(Page::getSpaceId, spaceId)
                .like(StrUtil.isNotEmpty(searchValue), Page::getTitle, searchValue)
                .eq(Page::getStatus, PageStatus.ACTIVE)
                .list();
        if (StrUtil.isNotEmpty(searchValue)) {
            return allPage.stream().map(it -> {
                Tree<Long> tree = new Tree<>();
                return tree.setId(it.getId())
                        .setParentId(it.getParentId())
                        .setName(it.getTitle());
            }).collect(Collectors.toList());
        }
        return TreeUtil.build(allPage, 0L, (object, node) -> {
            node.setId(object.getId())
                    .setName(object.getTitle())
                    .setParentId(object.getParentId());
            node.putExtra("updateTime", object.getUpdateTime());
            node.putExtra("createUser", object.getCreateUser());
            node.putExtra("icon", object.getIcon());
        });
    }

    @Override
    public Page getPageContent(Long pageId) {
        Page subject = this.getById(pageId);

        // Block storage is the single source of truth. Assemble from block
        // rows; if no blocks exist for this page, return an empty doc rather
        // than fall back to the legacy PageVersion JSON.
        String assembledJson = blockStorageService.assembleTreeJson(pageId);

        Page page = new Page();
        page.setId(subject.getId());
        page.setTitle(subject.getTitle());
        page.setSpaceId(subject.getSpaceId());
        page.setParentId(subject.getParentId());
        page.setStatus(subject.getStatus());
        page.setCreateTime(subject.getCreateTime());
        page.setUpdateTime(subject.getUpdateTime());
        page.setContent(StrUtil.isNotBlank(assembledJson) ? assembledJson : "");
        return page;
    }

    @Override
    public void saveAsTemplate(Long pageId) {
        Page template = copyPage(pageId, "id", "parentId", "spaceId", "ancestors");
        this.lambdaUpdate()
                .eq(Page::getId, template.getId())
                .set(Page::getIsTemplate, true)
                .update();
    }

    @Override
    public Page copyPage(Long pageId, String... ignore) {
        Page page = this.getById(pageId);
        Page template = BeanUtil.copyProperties(page, Page.class, ignore);
        template.setId(null);
        this.save(template);
        // Content is assembled from the source page's blocks and persisted as the
        // template's own block rows (the single source of truth). No draft/publish
        // version is involved anymore.
        String content = blockStorageService.assembleTreeJson(pageId);
        template.setContent(content);
        if (StrUtil.isNotBlank(content)) {
            blockStorageService.flattenAndSave(template.getId(), content);
        }
        return template;
    }

    @Override
    public Page createByTemplate(Long templateId, Long spaceId, Long partenId) {
        Page page = copyPage(templateId, "id", "spaceId", "parentId", "isTemplate");
        page.setSpaceId(spaceId);
        page.setParentId(partenId);
        createPage(page, true);
        return page;
    }

    @Override
    public IPage<Page> queryRecentPage(String rearchValue, Pageable dto) {
        Date current = new Date();
        return this.lambdaQuery()
                .like(StrUtil.isNotEmpty(rearchValue), Page::getTitle, rearchValue)
                .between(Page::getUpdateTime, DateUtil.beginOfDay(DateUtil.offsetDay(current, -7)),
                        DateUtil.endOfDay(current))
                .orderByDesc(Page::getUpdateTime)
                .page(dto.page());
    }

    @Override
    public void moveToTrash(Long pageId) {
        this.lambdaUpdate()
                .eq(Page::getId, pageId)
                .set(Page::getStatus, PageStatus.TRASH)
                .update();
    }

    @Override
    public void restore(Long pageId) {
        this.lambdaUpdate()
                .eq(Page::getId, pageId)
                .set(Page::getStatus, PageStatus.ACTIVE)
                .update();
    }

    @Override
    public void delete(Long pageId) {
        this.lambdaUpdate()
                .eq(Page::getId, pageId)
                .set(Page::getStatus, PageStatus.DELETED)
                .update();
    }

    @Override
    public void addPermission(Long userId, Long pageId, List<PagePermissionEnum> permissions) {
        PagePermission pagePermission = new PagePermission();
        pagePermission.setUserId(userId);
        pagePermission.setPageId(pageId);
        pagePermission.setPermissions(permissions);
        this.pagePermissionService.save(pagePermission);
    }

    @Override
    public List<Page> getParents(Long pageId) {
        Page page = this.getById(pageId);
        String ancestors = page.getAncestors();

        if (StrUtil.isBlank(ancestors)) {
            return CollUtil.newArrayList();
        }

        // Parse the ancestors string which is comma separated IDs
        String[] ancestorIds = ancestors.split(",");
        List<Page> parents = new ArrayList<>();

        for (String ancestorId : ancestorIds) {
            if (StrUtil.isNotBlank(ancestorId) && !StrUtil.equals(ancestorId, "null")) {
                Long id = Long.valueOf(ancestorId.trim());
                Page parent = this.getById(id);
                if (parent != null) {
                    parents.add(parent);
                }
            }
        }

        return parents;
    }

    @Override
    public PageBlockVO getBlockInfo(String id) {
        if (StrUtil.isBlank(id)) {
            throw WikiException.INVALID_PARAMETER.newException("块ID不能为空");
        }

        // 首先检查缓存
        PageBlockVO cachedBlock = blockCacheService.getCachedBlockInfo(id);
        if (cachedBlock != null) {
            return cachedBlock;
        }

        // 从索引表查找定位页面，再从 block 树中提取
        BlockIndex blockIndex = blockIndexService.findByBlockId(id);
        PageBlockVO pageBlock = null;

        if (blockIndex != null) {
            pageBlock = extractBlockFromPageContent(blockIndex.getPageId(), id);
        }

        // 退货路径：直接从 page_content 表查找
        if (pageBlock == null) {
            PageContent pageContent = this.pageContentService.getOne(
                    new LambdaQueryWrapper<PageContent>()
                            .eq(PageContent::getId, id));

            if (pageContent != null) {
                pageBlock = toPageBlockVO(pageContent);
            }
        }

        // 缓存结果
        if (pageBlock != null) {
            blockCacheService.cacheBlockInfo(id, pageBlock);
        }

        return pageBlock;
    }

    /**
     * 从页面内容中提取指定块的信息
     *
     * @param pageId  页面ID
     * @param blockId 块ID
     * @return PageBlockVO 对象
     */
    private PageBlockVO extractBlockFromPageContent(Long pageId, String blockId) {
        // Block storage is the single source of truth (no version gate). An empty
        // assembled tree simply yields null below.
        String contentJson = blockStorageService.assembleTreeJson(pageId);
        if (StrUtil.isBlank(contentJson)) {
            return null;
        }

        PageContent rootContent = JSONUtil.toBean(contentJson, PageContent.class);
        if (rootContent == null || CollUtil.isEmpty(rootContent.getContent())) {
            return null;
        }

        PageContent targetBlock = findBlockByIdRecursive(rootContent, blockId);
        if (targetBlock == null) {
            return null;
        }
        return toPageBlockVO(targetBlock);
    }

    /**
     * 将 PageContent 转换为轻量 VO。仅拷贝块级必要字段。
     */
    private PageBlockVO toPageBlockVO(PageContent c) {
        if (c == null) {
            return null;
        }
        PageBlockVO vo = new PageBlockVO();
        vo.setId(c.getId());
        vo.setPageId(c.getPageId());
        vo.setType(c.getType());
        vo.setContent(c.getContent() != null ? c.getContent().stream()
                .map(child -> JSONUtil.parseObj(JSONUtil.toJsonStr(child)))
                .collect(Collectors.toList()) : null);
        return vo;
    }

    /**
     * 递归查找指定ID的块
     * /**
     * 递归查找指定ID的块
     *
     * @param content  当前内容节点
     * @param targetId 目标块ID
     * @return 找到的块，未找到返回null
     */
    private PageContent findBlockByIdRecursive(PageContent content, String targetId) {
        if (content == null) {
            return null;
        }

        // 检查当前节点
        if (targetId.equals(content.getId()) || targetId.equals(content.getAttrId())) {
            return content;
        }

        // 递归检查子节点
        if (CollUtil.isNotEmpty(content.getContent())) {
            for (PageContent child : content.getContent()) {
                PageContent found = findBlockByIdRecursive(child, targetId);
                if (found != null) {
                    return found;
                }
            }
        }

        return null;
    }

    @Override
    public List<Page> getBySpaceId(Long spaceId) {
        return this.lambdaQuery()
                .eq(Page::getSpaceId, spaceId)
                .eq(Page::getStatus, PageStatus.ACTIVE)
                .list();
    }

    @Override
    public void copySpacePage(Long spaceId, Long targetSpaceId) {
        List<Page> pages = getBySpaceId(spaceId);
        pages.forEach(page -> {
            Page newPage = BeanUtil.copyProperties(page, Page.class, "id");
            newPage.setSpaceId(targetSpaceId);
            createPage(page, true);
            copyChildren(page, newPage);
        });
    }

    private void copyChildren(Page parent, Page newParent) {
        List<Page> children = getChildren(parent.getId());
        if (CollUtil.isNotEmpty(children)) {
            children.forEach(it -> {
                Page newChildren = BeanUtil.copyProperties(it, Page.class, "id");
                newChildren.setParentId(newParent.getId());
                newChildren.setAncestors(newParent.getAncestors() + "," + newParent.getAncestors());
                newChildren.setSpaceId(newParent.getSpaceId());
                createPage(newChildren, true);
                copyChildren(it, newParent);
            });
        }
    }

    private List<Page> getChildren(Long parentId) {
        return this.lambdaQuery()
                .eq(Page::getParentId, parentId)
                .eq(Page::getStatus, PageStatus.ACTIVE)
                .list();
    }

    private static final String LINK_TYPE_PAGE = "PAGE";
    private static final String LINK_TYPE_BLOCK = "BLOCK";
    private static final String LINK_KIND_NORMAL = "NORMAL";
    private static final String LINK_KIND_MENTION = "MENTION";
    private static final String LINK_KIND_EMBED = "EMBED";

    // Node types for link detection
    private static final String NODE_TYPE_PAGE_LINK = "pageLink";
    private static final String NODE_TYPE_BLOCK_LINK = "blockLink";
    private static final String NODE_TYPE_PAGE_MENTION = "pageMention";
    private static final String NODE_TYPE_BLOCK_MENTION = "blockMention";
    private static final String NODE_TYPE_PAGE_EMBED = "pageEmbed";
    private static final String NODE_TYPE_BLOCK_EMBED = "blockEmbed";

    @EventListener(PagePublishEvent.class)
    @Async
    public void onPagePublish(PagePublishEvent event) {
        refreshBlock(Arrays.asList(event.getVersionId()));
    }

    @Override
    public void refreshBlock(List<Long> versionIds) {
        List<PageVersion> pageVersions = pageVersionService.listByIds(versionIds);
        pageVersions.stream().forEach(pageVersion -> {
            // Get content from block storage
            String contentJson = blockStorageService.assembleTreeJson(pageVersion.getSubjectId());
            if (StrUtil.isNotBlank(contentJson)) {
                PageContent content = JSONUtil.toBean(contentJson, PageContent.class);
                if (content != null) {
                    blockStorageService.flattenAndSave(pageVersion.getSubjectId(), content);
                }
            }

            // Refresh link index for this page
            List<WikiLink> pageLinks = extractLinks(pageVersion);
            // Delete existing links from this page source
            this.wikiLinkService.remove(
                    this.wikiLinkService.lambdaQuery()
                            .eq(WikiLink::getSourceType, LINK_TYPE_PAGE)
                            .eq(WikiLink::getSourcePageId, pageVersion.getSubjectId())
                            .getWrapper());
            if (CollUtil.isNotEmpty(pageLinks)) {
                this.wikiLinkService.saveBatch(pageLinks);
            }
        });
    }

    @Override
    public List<PageVersion> getAllActiveVersions() {
        return this.pageVersionService.lambdaQuery()
                .eq(PageVersion::getStatus, VersionStatus.ACTIVE)
                .list();
    }

    /**
     * 获取块的详细信息，包含上下文和父子关系
     * 
     * @param blockId 块ID
     * @return 目标块及其子节点，未找到返回null
     */
    public PageContent getBlockDetailInfo(String blockId) {
        if (StrUtil.isBlank(blockId)) {
            throw WikiException.INVALID_PARAMETER.newException("块ID不能为空");
        }

        // 首先检查缓存
        PageContent cachedDetail = blockCacheService.getCachedBlockDetail(blockId);
        if (cachedDetail != null) {
            return cachedDetail;
        }

        // 查找块基本信息
        PageBlockVO pageBlock = getBlockInfo(blockId);
        if (pageBlock == null) {
            throw WikiException.BLOCK_NOT_FOUND.newException("未找到指定的块");
        }

        // Get content from block storage
        Long pageId = pageBlock.getPageId();
        String contentJson = blockStorageService.assembleTreeJson(pageId);

        PageContent targetBlock = null;
        if (StrUtil.isNotBlank(contentJson)) {
            PageContent rootContent = JSONUtil.toBean(contentJson, PageContent.class);
            targetBlock = findBlockByIdRecursive(rootContent, blockId);
        }

        // 如果在树中未找到，尝试从 page_content 表直接查询
        if (targetBlock == null) {
            targetBlock = pageContentService.getById(blockId);
        }

        // 缓存结果
        if (targetBlock != null) {
            blockCacheService.cacheBlockDetail(blockId, targetBlock);
        }

        return targetBlock;
    }

    /**
     * 更新指定块的内容。
     * <p>
     * Block-first: writes a single row in {@code wiki_page_block}; the change
     * recorder takes care of producing a {@code wiki_block_version} entry.
     * Pages without an existing block row are rejected (legacy full-JSON
     * fallback has been removed as part of the page-management refactor).
     * </p>
     *
     * @param updateDto 更新信息
     * @return 是否更新成功
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean updateBlock(UpdateBlockDTO updateDto) {
        if (updateDto == null || StrUtil.isBlank(updateDto.getBlockId())) {
            throw WikiException.INVALID_PARAMETER.newException("更新参数不能为空");
        }

        String blockId = updateDto.getBlockId();
        Long pageId = updateDto.getPageId();

        // 验证页面存在性
        Page page = this.getById(pageId);
        if (page == null) {
            throw WikiException.PAGE_NOT_FOUND.newException("指定页面不存在");
        }

        PageContent blockRow = pageContentService.lambdaQuery()
                .eq(PageContent::getId, blockId)
                .eq(PageContent::getPageId, pageId)
                .one();

        if (blockRow == null) {
            throw WikiException.BLOCK_NOT_FOUND.newException("未找到指定的块");
        }

        if (updateDto.getContent() != null) {
            blockRow.setAttrs(updateDto.getContent());
        }
        if (StrUtil.isNotBlank(updateDto.getText())) {
            blockRow.setText(updateDto.getText());
        }
        if (StrUtil.isNotBlank(updateDto.getType())) {
            blockRow.setType(updateDto.getType());
        }
        blockStorageService.upsertBlock(blockRow);

        // Clear caches
        blockCacheService.evictBlockCache(blockId);
        blockCacheService.evictAssembledTree(pageId);
        blockCacheService.evictPageCache(pageId);

        return true;
    }

    /**
     * 异步刷新块索引
     * 
     * @param pageId        页面ID
     * @param pageVersionId 页面版本ID
     */
    @Async
    private void refreshBlockIndexAsync(Long pageId, Long pageVersionId) {
        try {
            blockIndexService.refreshPageIndex(pageId, pageVersionId);
        } catch (Exception e) {
            log.warn("刷新块索引失败: pageId={}, versionId={}", pageId, pageVersionId, e);
        }
    }

    // ==================== Block-first storage API ====================

    @Override
    public BlockStorageService.PatchResult patchBlocks(Long pageId, java.util.List<BlockPatchItemDTO> changes, java.util.List<String> blockOrder) {
        if (pageId == null) {
            throw WikiException.INVALID_PARAMETER.newException("页面ID不能为空");
        }

        Page page = this.getById(pageId);
        if (page == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }

        // Apply the incremental patch (transactional internally).
        return blockStorageService.patchBlocks(pageId, changes, blockOrder);
    }

    @Override
    public BlockStorageService.PatchResult bulkReplaceBlocks(Long pageId, java.util.List<BlockPatchItemDTO> changes) {
        if (pageId == null) {
            throw WikiException.INVALID_PARAMETER.newException("页面ID不能为空");
        }
        Page page = this.getById(pageId);
        if (page == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }
        // Bulk replace path (chunked independent transactions, one PageVersion).
        return blockStorageService.bulkReplaceBlocks(pageId, changes);
    }

    @Override
    public String getPageContentFromBlocks(Long pageId) {
        return blockStorageService.assembleTreeJson(pageId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void movePage(Long pageId, Long targetSpaceId, Long targetParentId) {
        // 1. Validate page exists
        Page page = this.getById(pageId);
        if (page == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }

        Long effectiveSpaceId = targetSpaceId != null ? targetSpaceId : page.getSpaceId();

        // 2. Prevent moving to self
        if (ObjectUtil.equal(pageId, targetParentId)) {
            throw WikiException.PAGE_CIRCULAR_MOVE.newException();
        }

        // 3. Validate target parent
        String newAncestors = "";
        if (!ObjectUtil.equal(targetParentId, Page.TOP_PAGE_ID)) {
            Page targetParent = this.getById(targetParentId);
            if (targetParent == null) {
                throw WikiException.PAGE_PARENT_NOT_FOUND.newException();
            }
            // Prevent circular move: target parent must not be a descendant of the page
            if (isDescendant(pageId, targetParentId)) {
                throw WikiException.PAGE_CIRCULAR_MOVE.newException();
            }
            newAncestors = (StrUtil.isNotBlank(targetParent.getAncestors())
                    ? targetParent.getAncestors() + ","
                    : "")
                    + targetParent.getId();
        }

        // 4. Build old ancestors prefix for descendant updates
        String oldAncestorsPrefix = (StrUtil.isNotBlank(page.getAncestors())
                ? page.getAncestors() + ","
                : "")
                + page.getId();
        String newAncestorsPrefix = (StrUtil.isNotBlank(newAncestors)
                ? newAncestors + ","
                : "")
                + page.getId();

        // 5. Update the page itself
        this.lambdaUpdate()
                .eq(Page::getId, pageId)
                .set(Page::getParentId, targetParentId)
                .set(Page::getAncestors, StrUtil.isBlank(newAncestors) ? null : newAncestors)
                .set(Page::getSpaceId, effectiveSpaceId)
                .update();

        // 6. Update all descendants' ancestors and spaceId
        updateDescendants(pageId, oldAncestorsPrefix, newAncestorsPrefix, effectiveSpaceId);
    }

    /**
     * Check if candidateId is a descendant of ancestorId.
     */
    private boolean isDescendant(Long ancestorId, Long candidateId) {
        Page candidate = this.getById(candidateId);
        if (candidate == null || StrUtil.isBlank(candidate.getAncestors())) {
            return false;
        }
        return Arrays.stream(candidate.getAncestors().split(","))
                .filter(StrUtil::isNotBlank)
                .anyMatch(id -> id.trim().equals(String.valueOf(ancestorId)));
    }

    /**
     * Recursively update ancestors and spaceId for all descendants of the moved
     * page.
     */
    private void updateDescendants(Long parentId, String oldAncestorsPrefix, String newAncestorsPrefix,
            Long newSpaceId) {
        List<Page> children = getChildren(parentId);
        if (CollUtil.isEmpty(children)) {
            return;
        }
        for (Page child : children) {
            String childOldAncestors = child.getAncestors();
            String childNewAncestors;
            if (StrUtil.isNotBlank(childOldAncestors) && childOldAncestors.startsWith(oldAncestorsPrefix)) {
                childNewAncestors = newAncestorsPrefix + childOldAncestors.substring(oldAncestorsPrefix.length());
            } else {
                childNewAncestors = newAncestorsPrefix;
            }

            this.lambdaUpdate()
                    .eq(Page::getId, child.getId())
                    .set(Page::getAncestors, StrUtil.isBlank(childNewAncestors) ? null : childNewAncestors)
                    .set(Page::getSpaceId, newSpaceId)
                    .update();

            // Recurse into grandchildren
            String childOldPrefix = oldAncestorsPrefix + "," + child.getId();
            String childNewPrefix = newAncestorsPrefix + "," + child.getId();
            updateDescendants(child.getId(), childOldPrefix, childNewPrefix, newSpaceId);
        }
    }

    private List<WikiLink> extractLinks(PageVersion pageVersion) {
        List<WikiLink> links = new ArrayList<>();
        Long pageId = pageVersion.getSubjectId();

        // Get content from block storage
        String rawContent = blockStorageService.assembleTreeJson(pageId);
        if (StrUtil.isBlank(rawContent)) {
            return links;
        }

        PageContent root = JSONUtil.toBean(rawContent, PageContent.class);
        if (root == null || CollUtil.isEmpty(root.getContent())) {
            return links;
        }

        // Walk through content tree and extract links by type
        walkForLinks(root, pageId, links);
        return links;
    }

    private void walkForLinks(PageContent node, Long sourcePageId, List<WikiLink> links) {
        if (node == null) {
            return;
        }

        String type = node.getType();
        if (StrUtil.isNotBlank(type)) {
            WikiLink link = createLinkFromNode(node, type, sourcePageId);
            if (link != null) {
                links.add(link);
            }
        }

        // Recursively walk children
        if (CollUtil.isNotEmpty(node.getContent())) {
            for (PageContent child : node.getContent()) {
                walkForLinks(child, sourcePageId, links);
            }
        }
    }

    private WikiLink createLinkFromNode(PageContent node, String type, Long sourcePageId) {
        WikiLink link = new WikiLink();
        link.setSourceType(LINK_TYPE_PAGE);
        link.setSourceId(String.valueOf(sourcePageId));
        link.setSourcePageId(sourcePageId);

        JSONObject attrs = node.getAttrs();

        switch (type) {
            case NODE_TYPE_PAGE_LINK:
                link.setTargetType(LINK_TYPE_PAGE);
                link.setLinkKind(LINK_KIND_NORMAL);
                if (attrs != null) {
                    link.setTargetPageId(attrs.getLong("pageId"));
                    link.setTargetId(attrs.getStr("pageId"));
                }
                break;
            case NODE_TYPE_BLOCK_LINK:
                link.setTargetType(LINK_TYPE_BLOCK);
                link.setLinkKind(LINK_KIND_NORMAL);
                if (attrs != null) {
                    link.setTargetId(attrs.getStr("blockId"));
                    link.setTargetPageId(attrs.getLong("pageId"));
                }
                break;
            case NODE_TYPE_PAGE_MENTION:
                link.setTargetType(LINK_TYPE_PAGE);
                link.setLinkKind(LINK_KIND_MENTION);
                if (attrs != null) {
                    link.setTargetPageId(attrs.getLong("pageId"));
                    link.setTargetId(attrs.getStr("pageId"));
                }
                break;
            case NODE_TYPE_BLOCK_MENTION:
                link.setTargetType(LINK_TYPE_BLOCK);
                link.setLinkKind(LINK_KIND_MENTION);
                if (attrs != null) {
                    link.setTargetId(attrs.getStr("blockId"));
                    link.setTargetPageId(attrs.getLong("pageId"));
                }
                break;
            case NODE_TYPE_PAGE_EMBED:
                link.setTargetType(LINK_TYPE_PAGE);
                link.setLinkKind(LINK_KIND_EMBED);
                if (attrs != null) {
                    link.setTargetPageId(attrs.getLong("pageId"));
                    link.setTargetId(attrs.getStr("pageId"));
                }
                break;
            case NODE_TYPE_BLOCK_EMBED:
                link.setTargetType(LINK_TYPE_BLOCK);
                link.setLinkKind(LINK_KIND_EMBED);
                if (attrs != null) {
                    link.setTargetId(attrs.getStr("blockId"));
                    link.setTargetPageId(attrs.getLong("pageId"));
                }
                break;
            default:
                return null;
        }

        // Build snippet from node text
        if (StrUtil.isNotBlank(node.getText())) {
            link.setSnippet(node.getText());
        }

        return link;
    }

}
