package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import cn.hutool.json.JSONObject;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.core.version.service.AbstractSubjectService;
import com.knowledge.wiki.service.doc.BlockDocCodec;
import com.knowledge.wiki.service.doc.PageDocCommandService;
import com.knowledge.wiki.service.doc.PageDocService;
import com.knowledge.wiki.service.doc.WikiLinkProjectionService;
import com.knowledge.wiki.service.cache.BlockCacheService;
import com.knowledge.wiki.service.entity.BlockIndex;
import com.knowledge.wiki.service.entity.Mark;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.entity.PagePermission;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.entity.WikiLink;
import com.knowledge.wiki.service.entity.enums.PagePermissionEnum;
import com.knowledge.wiki.service.entity.dto.UpdateBlockDTO;
import com.knowledge.wiki.service.entity.dto.QueryPageDTO;
import com.knowledge.wiki.service.entity.dto.SaveTemplateDTO;
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
    @Lazy
    private PageDocService pageDocService;

    @Autowired
    @Lazy
    private PageDocCommandService pageDocCommandService;

    @Autowired
    @Lazy
    private WikiLinkProjectionService wikiLinkProjectionService;

    @Autowired
    private IPageSnapshotService pageSnapshotService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Page createPage(Page page, boolean publish) {
        if (page == null || page.getSpaceId() == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }

        if (page.getId() != null) {
            Page db = this.getById(page.getId());
            if (db == null) {
                throw WikiException.PAGE_NOT_FOUND.newException();
            }
            // POST /space/page historically doubled as both create and save. Keep
            // only the harmless metadata part for old clients: document content,
            // hierarchy, ownership and lifecycle state are never changed here.
            applyCompatibleMetadataUpdate(page, db);
            this.updateById(db);
            return db;
        }

        Map<String, Object> initialDoc = parseInitialDocument(page);
        page.setContent(null);
        page.setStatus(PageStatus.ACTIVE);
        if (page.getParentId() == null) {
            page.setParentId(Page.TOP_PAGE_ID);
        }
        if (!ObjectUtil.equal(page.getParentId(), Page.TOP_PAGE_ID)) {
            Page parent = this.getById(page.getParentId());
            if (parent == null || !ObjectUtil.equal(parent.getSpaceId(), page.getSpaceId())) {
                throw WikiException.PAGE_PARENT_NOT_FOUND.newException();
            }
            page.setAncestors(appendAncestor(parent));
        } else {
            page.setAncestors("");
        }

        // The page row and its authoritative PageDoc baseline participate in this
        // same transaction. A failed document initialisation rolls the metadata row
        // back as well, so a page can never be created half-initialised.
        this.save(page);
        pageDocCommandService.initializePage(page.getId(), initialDoc,
                SecurityContextUtil.getUserId(), "页面创建");

        // `publish` remains an interface compatibility no-op; PageDoc has one
        // current state rather than legacy draft/publish content.
        return page;
    }

    private void applyCompatibleMetadataUpdate(Page request, Page target) {
        // Title, icon and tags are PageDoc title-node projections. Updating them
        // independently here would reintroduce split authority, so the compatibility
        // endpoint is limited to metadata that does not live in the document.
        if (request.getDescription() != null) {
            target.setDescription(request.getDescription());
        }
        if (request.getCover() != null) {
            target.setCover(request.getCover());
        }
        if (request.getPinned() != null) {
            target.setPinned(request.getPinned());
        }
    }

    private Map<String, Object> parseInitialDocument(Page page) {
        Map<String, Object> doc;
        if (StrUtil.isBlank(page.getContent())) {
            doc = canonicalDocument(page);
        } else {
            doc = BlockDocCodec.readJson(page.getContent());
            if (doc == null || !"doc".equals(doc.get("type"))) {
                throw WikiException.CONTENT_PARSE_ERROR.newException("页面内容不是有效的 ProseMirror 文档");
            }
            ensureCanonicalTitle(doc, page);
            ensureBodyBlock(doc);
        }
        return doc;
    }

    private Map<String, Object> canonicalDocument(Page page) {
        Map<String, Object> doc = new LinkedHashMap<>();
        List<Map<String, Object>> content = new ArrayList<>();
        content.add(canonicalTitle(page));
        content.add(emptyParagraph());
        doc.put("type", "doc");
        doc.put("content", content);
        return doc;
    }

    private void ensureCanonicalTitle(Map<String, Object> doc, Page page) {
        List<Map<String, Object>> content = mutableContent(doc);
        boolean hasTitle = content.stream().anyMatch(node -> BlockDocCodec.TYPE_TITLE.equals(node.get("type")));
        if (!hasTitle) {
            content.add(0, canonicalTitle(page));
        }
        doc.put("content", content);
    }

    private void ensureBodyBlock(Map<String, Object> doc) {
        List<Map<String, Object>> content = mutableContent(doc);
        boolean hasBody = content.stream().anyMatch(node -> !BlockDocCodec.TYPE_TITLE.equals(node.get("type")));
        if (!hasBody) {
            content.add(emptyParagraph());
        }
        doc.put("content", content);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> mutableContent(Map<String, Object> doc) {
        Object raw = doc.get("content");
        List<Map<String, Object>> result = new ArrayList<>();
        if (raw instanceof List) {
            for (Object item : (List<Object>) raw) {
                if (item instanceof Map) {
                    result.add((Map<String, Object>) item);
                }
            }
        }
        return result;
    }

    private Map<String, Object> canonicalTitle(Page page) {
        String headingId = freshBlockId();
        Map<String, Object> headingAttrs = new LinkedHashMap<>();
        headingAttrs.put("id", headingId);
        headingAttrs.put("level", 1);
        headingAttrs.put("textAlign", null);
        headingAttrs.put("data-toc-id", headingId);

        Map<String, Object> heading = node("heading", headingAttrs);
        String title = StrUtil.blankToDefault(page.getTitle(), Page.UNTITLE);
        if (StrUtil.isNotBlank(title)) {
            Map<String, Object> text = new LinkedHashMap<>();
            text.put("type", "text");
            text.put("text", title);
            heading.put("content", new ArrayList<>(Arrays.asList(text)));
        }

        Map<String, Object> titleAttrs = new LinkedHashMap<>();
        titleAttrs.put("id", freshBlockId());
        titleAttrs.put("uuid", null);
        if (page.getIcon() != null) {
            Map<String, Object> icon = new LinkedHashMap<>();
            icon.put("icon", page.getIcon().getIcon());
            if (page.getIcon().getType() != null) {
                icon.put("type", page.getIcon().getType() == com.knowledge.core.common.base.IconType.PICTIRE
                        ? "IMAGE"
                        : page.getIcon().getType().name());
            }
            titleAttrs.put("icon", icon);
        }
        if (page.getTags() != null) {
            titleAttrs.put("tags", new ArrayList<>(page.getTags()));
        }
        Map<String, Object> titleNode = node(BlockDocCodec.TYPE_TITLE, titleAttrs);
        titleNode.put("content", new ArrayList<>(Arrays.asList(heading)));
        return titleNode;
    }

    private Map<String, Object> emptyParagraph() {
        Map<String, Object> attrs = new LinkedHashMap<>();
        attrs.put("id", freshBlockId());
        attrs.put("indent", 0);
        attrs.put("textAlign", null);
        return node("paragraph", attrs);
    }

    private Map<String, Object> node(String type, Map<String, Object> attrs) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("type", type);
        node.put("attrs", attrs);
        return node;
    }

    private String appendAncestor(Page parent) {
        return StrUtil.isBlank(parent.getAncestors())
                ? String.valueOf(parent.getId())
                : parent.getAncestors() + "," + parent.getId();
    }

    private String freshBlockId() {
        return cn.hutool.core.util.IdUtil.fastSimpleUUID();
    }

    @Override
    public List<Tree<Long>> getPageTree(Long spaceId, String searchValue) {
        List<Page> allPage = this.lambdaQuery()
                .eq(Page::getSpaceId, spaceId)
                .eq(Page::getIsTemplate, false)
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
        if (subject == null) {
            return null;
        }

        Page page = BeanUtil.copyProperties(subject, Page.class);
        if (pageDocService.isInitialized(pageId)) {
            page.setContent(BlockDocCodec.writeJson(pageDocService.readDoc(pageId).getDoc()));
        } else {
            // Read-only rollout bridge. Legacy writes are retired, but an existing
            // page must remain visible until the mandatory backfill establishes its
            // PageDoc head; otherwise the editor could persist a false blank page.
            page.setContent(StrUtil.nullToEmpty(blockStorageService.assembleTreeJson(pageId)));
        }
        return page;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void saveAsTemplate(Long pageId, SaveTemplateDTO dto) {
        Page source = this.getById(pageId);
        if (source == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }
        // Audit fields are intentionally cleared so the template records when it
        // was created rather than inheriting the source page's timestamps.
        Page template = BeanUtil.copyProperties(source, Page.class,
                "id", "parentId", "ancestors",
                "createTime", "createUser", "updateTime", "updateUser");
        template.setId(null);
        template.setParentId(Page.TOP_PAGE_ID);
        template.setAncestors("");
        template.setContent(null);
        template.setIsTemplate(true);
        if (dto != null) {
            if (StrUtil.isNotBlank(dto.getName())) {
                template.setTitle(dto.getName());
            }
            if (dto.getDescription() != null) {
                template.setDescription(dto.getDescription());
            }
            if (CollUtil.isNotEmpty(dto.getCover())) {
                template.setCover(dto.getCover().get(0));
            }
        }
        this.save(template);

        Map<String, Object> copiedDoc = copyDocumentWithFreshIds(pageDocService.readDoc(pageId).getDoc(), template);
        replaceDocumentTitle(copiedDoc, template);
        pageDocCommandService.initializePage(template.getId(), copiedDoc,
                SecurityContextUtil.getUserId(), "保存为模板");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Page copyPage(Long pageId, String... ignore) {
        Page source = this.getById(pageId);
        if (source == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }
        Page target = BeanUtil.copyProperties(source, Page.class, ignore);
        target.setId(null);
        target.setContent(null);
        this.save(target);

        Map<String, Object> copiedDoc = copyDocumentWithFreshIds(pageDocService.readDoc(pageId).getDoc(), target);
        pageDocCommandService.initializePage(target.getId(), copiedDoc,
                SecurityContextUtil.getUserId(), "页面复制");
        target.setContent(BlockDocCodec.writeJson(copiedDoc));
        return target;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Page createByTemplate(Long templateId, Long spaceId, Long parentId) {
        Page template = this.getById(templateId);
        if (template == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }
        // Build the new page directly rather than via copyPage(): that helper
        // persists an intermediate row, which forced createPage() down its
        // "update existing page" branch and left `ancestors` and the audit
        // timestamps carrying the template's values.
        Page page = BeanUtil.copyProperties(template, Page.class,
                "id", "spaceId", "parentId", "ancestors", "isTemplate", "status",
                "createTime", "createUser", "createDept", "updateTime", "updateUser");
        page.setSpaceId(spaceId);
        page.setParentId(parentId == null ? Page.TOP_PAGE_ID : parentId);
        page.setIsTemplate(false);
        Map<String, Object> copiedDoc = copyDocumentWithFreshIds(pageDocService.readDoc(templateId).getDoc(), page);
        replaceDocumentTitle(copiedDoc, page);
        page.setContent(BlockDocCodec.writeJson(copiedDoc));
        // createPage() validates the target parent and atomically persists both the
        // target metadata and this fresh PageDoc baseline.
        return createPage(page, true);
    }

    private Map<String, Object> copyDocumentWithFreshIds(Map<String, Object> sourceDoc, Page target) {
        Map<String, Object> copy = sourceDoc == null
                ? canonicalDocument(target)
                : BlockDocCodec.readJson(BlockDocCodec.writeJson(sourceDoc));
        if (copy == null || !"doc".equals(copy.get("type"))) {
            throw WikiException.CONTENT_PARSE_ERROR.newException("源页面文档损坏");
        }
        ensureCanonicalTitle(copy, target);
        ensureBodyBlock(copy);
        Map<String, String> referenceMap = new LinkedHashMap<>();
        Map<Map<String, Object>, String> nodeIds = new IdentityHashMap<>();
        for (Map<String, Object> child : mutableContent(copy)) {
            collectFreshIds(child, referenceMap, nodeIds);
        }
        for (Map<String, Object> child : mutableContent(copy)) {
            applyFreshIds(child, referenceMap, nodeIds);
        }
        return copy;
    }

    @SuppressWarnings("unchecked")
    private void collectFreshIds(Map<String, Object> node, Map<String, String> referenceMap,
            Map<Map<String, Object>, String> nodeIds) {
        if (node == null || "text".equals(node.get("type"))) {
            return;
        }
        String freshId = freshBlockId();
        nodeIds.put(node, freshId);
        Object rawAttrs = node.get("attrs");
        if (rawAttrs instanceof Map) {
            Object oldId = ((Map<String, Object>) rawAttrs).get("id");
            if (oldId instanceof String && StrUtil.isNotBlank((String) oldId)) {
                // References to a duplicate source id resolve to its first occurrence,
                // while every copied node still receives its own unique identity.
                referenceMap.putIfAbsent((String) oldId, freshId);
            }
        }
        for (Map<String, Object> child : BlockDocCodec.childrenOf(node)) {
            collectFreshIds(child, referenceMap, nodeIds);
        }
    }

    @SuppressWarnings("unchecked")
    private void applyFreshIds(Map<String, Object> node, Map<String, String> referenceMap,
            Map<Map<String, Object>, String> nodeIds) {
        if (node == null || "text".equals(node.get("type"))) {
            return;
        }
        Map<String, Object> attrs;
        Object rawAttrs = node.get("attrs");
        if (rawAttrs instanceof Map) {
            attrs = (Map<String, Object>) rawAttrs;
        } else {
            attrs = new LinkedHashMap<>();
            node.put("attrs", attrs);
        }

        String newId = nodeIds.get(node);
        if (newId == null) {
            newId = freshBlockId();
        }
        node.remove("id");
        attrs.put("id", newId);
        rewriteBlockReference(attrs, "data-toc-id", referenceMap, newId);
        rewriteBlockReference(attrs, "blockId", referenceMap, null);
        rewriteBlockReference(attrs, "targetBlockId", referenceMap, null);
        rewriteBlockReference(attrs, "sourceBlockId", referenceMap, null);

        for (Map<String, Object> child : BlockDocCodec.childrenOf(node)) {
            applyFreshIds(child, referenceMap, nodeIds);
        }
    }

    private void rewriteBlockReference(Map<String, Object> attrs, String key, Map<String, String> idMap,
            String ownId) {
        if (!attrs.containsKey(key)) {
            return;
        }
        Object oldValue = attrs.get(key);
        String replacement = oldValue instanceof String ? idMap.get(oldValue) : null;
        if (replacement != null) {
            attrs.put(key, replacement);
        } else if (ownId != null) {
            attrs.put(key, ownId);
        }
    }

    private void replaceDocumentTitle(Map<String, Object> doc, Page page) {
        ensureCanonicalTitle(doc, page);
        String titleText = StrUtil.blankToDefault(page.getTitle(), Page.UNTITLE);
        for (Map<String, Object> node : mutableContent(doc)) {
            if (!BlockDocCodec.TYPE_TITLE.equals(node.get("type"))) {
                continue;
            }
            List<Map<String, Object>> titleChildren = BlockDocCodec.childrenOf(node);
            Map<String, Object> heading;
            if (titleChildren.isEmpty() || !"heading".equals(titleChildren.get(0).get("type"))) {
                String headingId = freshBlockId();
                Map<String, Object> attrs = new LinkedHashMap<>();
                attrs.put("id", headingId);
                attrs.put("level", 1);
                attrs.put("data-toc-id", headingId);
                heading = node("heading", attrs);
                node.put("content", new ArrayList<>(Arrays.asList(heading)));
            } else {
                heading = titleChildren.get(0);
            }
            List<Map<String, Object>> textContent = new ArrayList<>();
            if (StrUtil.isNotBlank(titleText)) {
                Map<String, Object> text = new LinkedHashMap<>();
                text.put("type", "text");
                text.put("text", titleText);
                textContent.add(text);
            }
            heading.put("content", textContent);
            return;
        }
    }

    @Override
    public IPage<Page> queryRecentPage(QueryPageDTO dto) {
        return this.lambdaQuery()
                .eq(dto.getSpaceId() != null, Page::getSpaceId, dto.getSpaceId())
                .eq(dto.getStatus() != null, Page::getStatus, dto.getStatus())
                // Exclude trashed/deleted pages unless explicitly requested
                .ne(dto.getStatus() == null, Page::getStatus, PageStatus.DELETED)
                .ne(dto.getStatus() == null, Page::getStatus, PageStatus.TRASH)
                .like(StrUtil.isNotEmpty(dto.getSearchValue()), Page::getTitle, dto.getSearchValue())
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
    @Transactional(rollbackFor = Exception.class)
    public void copySpacePage(Long spaceId, Long targetSpaceId) {
        List<Page> pages = getBySpaceId(spaceId);
        Set<Long> sourceIds = pages.stream().map(Page::getId).collect(Collectors.toSet());
        pages.stream()
                .filter(page -> ObjectUtil.equal(page.getParentId(), Page.TOP_PAGE_ID)
                        || !sourceIds.contains(page.getParentId()))
                .forEach(page -> copySpaceBranch(page, targetSpaceId, Page.TOP_PAGE_ID));
    }

    private Page copySpaceBranch(Page source, Long targetSpaceId, Long targetParentId) {
        Page target = BeanUtil.copyProperties(source, Page.class,
                "id", "spaceId", "parentId", "ancestors",
                "createTime", "createUser", "createDept", "updateTime", "updateUser");
        target.setSpaceId(targetSpaceId);
        target.setParentId(targetParentId);
        Map<String, Object> copiedDoc = copyDocumentWithFreshIds(pageDocService.readDoc(source.getId()).getDoc(), target);
        replaceDocumentTitle(copiedDoc, target);
        target.setContent(BlockDocCodec.writeJson(copiedDoc));
        Page created = createPage(target, true);

        for (Page child : getChildren(source.getId())) {
            copySpaceBranch(child, targetSpaceId, created.getId());
        }
        return created;
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
    // Inline atom node inserted by the [[ suggestion flow (go-forward format).
    private static final String NODE_TYPE_PAGE_LINK_NODE = "pageLinkNode";
    private static final String NODE_TYPE_BLOCK_LINK = "blockLink";
    private static final String NODE_TYPE_PAGE_MENTION = "pageMention";
    private static final String NODE_TYPE_BLOCK_MENTION = "blockMention";
    private static final String NODE_TYPE_PAGE_EMBED = "pageEmbed";
    private static final String NODE_TYPE_BLOCK_EMBED = "blockEmbed";
    // Node/mark types actually produced by the editor (plugin-block-reference):
    // - PageReference / BlockReference: atom nodes inserted via the selectors
    // - pageLink: a MARK on a text node ([[Title]] bidirectional link), not a node
    // type
    private static final String NODE_TYPE_PAGE_REFERENCE = "PageReference";
    private static final String NODE_TYPE_BLOCK_REFERENCE = "BlockReference";
    private static final String MARK_TYPE_PAGE_LINK = "pageLink";

    @EventListener(PagePublishEvent.class)
    @Async
    public void onPagePublish(PagePublishEvent event) {
        refreshBlock(Arrays.asList(event.getVersionId()));
    }

    @Override
    public void refreshBlock(List<Long> versionIds) {
        // Compatibility event only: old versions are no longer content sources.
        // Rebuild disposable projections from each page's authoritative PageDoc.
        pageVersionService.listByIds(versionIds).stream()
                .map(PageVersion::getSubjectId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .forEach(this::syncPageLinks);
    }

    /**
     * Rebuild the {@code wiki_link} backlink index for a single page from its
     * current block content. Deletes the page's existing outgoing links and
     * re-inserts the freshly extracted set. Best-effort: a failure here never
     * breaks the save that triggered it.
     *
     * @param pageId source page whose outgoing links should be re-synced
     */
    public void syncPageLinks(Long pageId) {
        if (pageId == null) {
            return;
        }
        try {
            // Compatibility callers must not rebuild wiki_link from stale
            // wiki_page_block rows. The projector always reads wiki_block.node.
            wikiLinkProjectionService.syncPage(pageId);
        } catch (Exception e) {
            log.warn("Failed to sync wiki links for pageId={}", pageId, e);
        }
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
    public boolean updateBlock(UpdateBlockDTO updateDto) {
        throw WikiException.PAGE_WRITE_API_RETIRED.newException("请使用 PageDoc ops/reconcile 写入页面");
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
    public String getPageContentFromBlocks(Long pageId) {
        // Compatibility name retained for callers; PageDoc is the only authority.
        return BlockDocCodec.writeJson(pageDocService.readDoc(pageId).getDoc());
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
        return extractLinks(pageVersion.getSubjectId());
    }

    /**
     * Extract the outgoing links of a page from its current block content,
     * de-duplicated so the same (target, kind) is recorded at most once per page.
     */
    private List<WikiLink> extractLinks(Long pageId) {
        List<WikiLink> result = new ArrayList<>();
        if (pageId == null) {
            return result;
        }

        // Get content from block storage
        String rawContent = blockStorageService.assembleTreeJson(pageId);
        if (StrUtil.isBlank(rawContent)) {
            return result;
        }

        PageContent root = JSONUtil.toBean(rawContent, PageContent.class);
        if (root == null || CollUtil.isEmpty(root.getContent())) {
            return result;
        }

        // Walk through content tree and extract links by node type and marks
        List<WikiLink> raw = new ArrayList<>();
        walkForLinks(root, pageId, raw);

        // De-dup: a page references the same target once (keep the first snippet).
        Set<String> seen = new HashSet<>();
        for (WikiLink link : raw) {
            String key = link.getTargetType() + ":" + link.getLinkKind() + ":"
                    + (link.getTargetId() != null ? link.getTargetId() : "")
                    + ":" + (link.getTargetPageId() != null ? link.getTargetPageId() : "");
            if (seen.add(key)) {
                result.add(link);
            }
        }
        return result;
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

        // pageLink is a MARK on a text node ([[Title]] bidirectional link), so the
        // reference lives in node.marks rather than as a dedicated node type.
        if (CollUtil.isNotEmpty(node.getMarks())) {
            for (Mark mark : node.getMarks()) {
                WikiLink markLink = createLinkFromMark(mark, node, sourcePageId);
                if (markLink != null) {
                    links.add(markLink);
                }
            }
        }

        // Recursively walk children
        if (CollUtil.isNotEmpty(node.getContent())) {
            for (PageContent child : node.getContent()) {
                walkForLinks(child, sourcePageId, links);
            }
        }
    }

    /**
     * Build a wiki link from a {@code pageLink} mark carried by a text node.
     * Returns null for any other mark type or when the target is unresolved.
     */
    private WikiLink createLinkFromMark(Mark mark, PageContent node, Long sourcePageId) {
        if (mark == null || !MARK_TYPE_PAGE_LINK.equals(mark.getType())) {
            return null;
        }
        JSONObject attrs = mark.getAttrs();
        if (attrs == null) {
            return null;
        }
        Long targetPageId = attrs.getLong("pageId");
        String targetId = attrs.getStr("pageId");
        if (targetPageId == null && StrUtil.isBlank(targetId)) {
            return null;
        }

        WikiLink link = new WikiLink();
        link.setSourceType(LINK_TYPE_PAGE);
        link.setSourceId(String.valueOf(sourcePageId));
        link.setSourcePageId(sourcePageId);
        link.setTargetType(LINK_TYPE_PAGE);
        link.setLinkKind(LINK_KIND_NORMAL);
        link.setTargetPageId(targetPageId);
        link.setTargetId(targetId);
        if (StrUtil.isNotBlank(node.getText())) {
            link.setSnippet(node.getText());
        }
        return link;
    }

    private WikiLink createLinkFromNode(PageContent node, String type, Long sourcePageId) {
        WikiLink link = new WikiLink();
        link.setSourceType(LINK_TYPE_PAGE);
        link.setSourceId(String.valueOf(sourcePageId));
        link.setSourcePageId(sourcePageId);

        JSONObject attrs = node.getAttrs();

        switch (type) {
            case NODE_TYPE_PAGE_LINK:
            case NODE_TYPE_PAGE_LINK_NODE:
            case NODE_TYPE_PAGE_REFERENCE:
                link.setTargetType(LINK_TYPE_PAGE);
                link.setLinkKind(LINK_KIND_NORMAL);
                if (attrs != null) {
                    link.setTargetPageId(attrs.getLong("pageId"));
                    link.setTargetId(attrs.getStr("pageId"));
                }
                break;
            case NODE_TYPE_BLOCK_REFERENCE:
                link.setTargetType(LINK_TYPE_BLOCK);
                link.setLinkKind(LINK_KIND_EMBED);
                if (attrs != null) {
                    link.setTargetId(attrs.getStr("blockId"));
                    link.setTargetPageId(attrs.getLong("pageId"));
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

        // Skip unresolved references (e.g. a page being created with no id yet).
        if (link.getTargetPageId() == null && StrUtil.isBlank(link.getTargetId())) {
            return null;
        }

        // Build snippet from node text; atom nodes (e.g. pageLinkNode) carry no
        // text, so fall back to the link title stored in their attrs.
        if (StrUtil.isNotBlank(node.getText())) {
            link.setSnippet(node.getText());
        } else if (attrs != null && StrUtil.isNotBlank(attrs.getStr("title"))) {
            link.setSnippet(attrs.getStr("title"));
        }

        return link;
    }

}
