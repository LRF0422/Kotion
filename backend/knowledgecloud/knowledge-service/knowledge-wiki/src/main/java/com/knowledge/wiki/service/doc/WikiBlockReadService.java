package com.knowledge.wiki.service.doc;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.wiki.service.converter.WikiBlockViewConverter;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.entity.dto.QueryPageBlockDTO;
import com.knowledge.wiki.service.entity.enums.PageStatus;
import com.knowledge.wiki.service.entity.vo.PageBlockDetailVO;
import com.knowledge.wiki.service.entity.vo.PageBlockVO;
import com.knowledge.wiki.service.entity.vo.WikiBlockVO;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.mapper.WikiBlockMapper;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPermissionService;
import com.knowledge.wiki.service.service.ISpaceService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;

/** Read facade for block-reference, detail, and MySQL search fallback APIs. */
@Service
public class WikiBlockReadService {

    @Autowired
    private WikiBlockMapper wikiBlockMapper;

    @Autowired
    private IPageService pageService;

    @Autowired
    private ISpaceService spaceService;

    @Autowired
    private IPermissionService permissionService;

    public IPage<WikiBlockVO> queryBlocks(QueryPageBlockDTO dto) {
        Map<Long, com.knowledge.wiki.service.entity.Page> pages = readablePages(dto.getPageId(), dto.getSpaceId());
        Page<WikiBlockVO> empty = new Page<>(dto.getCurrent(), dto.getPageSize());
        if (pages.isEmpty()) {
            return empty;
        }

        LambdaQueryWrapper<WikiBlock> query = new LambdaQueryWrapper<WikiBlock>()
                .in(WikiBlock::getPageId, pages.keySet())
                .like(StrUtil.isNotBlank(dto.getSearchValue()), WikiBlock::getText, dto.getSearchValue())
                .eq(StrUtil.isNotBlank(dto.getType()), WikiBlock::getType, dto.getType())
                .orderByDesc(WikiBlock::getRev)
                .orderByAsc(WikiBlock::getPageId, WikiBlock::getBlockRank);
        IPage<WikiBlock> rows = wikiBlockMapper.selectPage(dto.<WikiBlock>page(), query);
        Map<Long, Space> spaces = loadSpaces(pages.values());

        List<WikiBlockVO> records = rows.getRecords().stream()
                .map(row -> {
                    com.knowledge.wiki.service.entity.Page page = pages.get(row.getPageId());
                    return WikiBlockViewConverter.toListVO(row, page,
                            page == null ? null : spaces.get(page.getSpaceId()));
                })
                .collect(Collectors.toList());

        Page<WikiBlockVO> result = new Page<>(rows.getCurrent(), rows.getSize(), rows.getTotal());
        result.setPages(rows.getPages());
        result.setRecords(records);
        return result;
    }

    public PageBlockVO getBlockInfo(String blockId) {
        WikiBlock block = requireReadableBlock(blockId);
        if (block == null) {
            return null;
        }
        com.knowledge.wiki.service.entity.Page page = pageService.getById(block.getPageId());
        Space space = page == null || page.getSpaceId() == null ? null : spaceService.getById(page.getSpaceId());
        return WikiBlockViewConverter.toLightVO(block, page, space);
    }

    public PageBlockDetailVO getBlockDetail(String blockId) {
        WikiBlock block = requireReadableBlock(blockId);
        if (block == null) {
            return null;
        }
        com.knowledge.wiki.service.entity.Page page = pageService.getById(block.getPageId());
        Space space = page == null || page.getSpaceId() == null ? null : spaceService.getById(page.getSpaceId());
        return WikiBlockViewConverter.toDetailVO(block, page, space);
    }

    /** Hydrate RediSearch ids from wiki_block, preserving hit order and access filters. */
    public List<PageBlockDetailVO> getBlockDetails(List<String> blockIds) {
        if (CollUtil.isEmpty(blockIds)) {
            return new ArrayList<>();
        }
        List<WikiBlock> rows = wikiBlockMapper.selectList(new LambdaQueryWrapper<WikiBlock>()
                .in(WikiBlock::getBlockId, blockIds));
        if (CollUtil.isEmpty(rows)) {
            return new ArrayList<>();
        }
        Map<String, WikiBlock> byId = rows.stream()
                .collect(Collectors.toMap(WikiBlock::getBlockId, row -> row, (left, right) -> left));
        Set<Long> pageIds = rows.stream().map(WikiBlock::getPageId).collect(Collectors.toSet());
        Map<Long, com.knowledge.wiki.service.entity.Page> pages = readablePages(pageIds);
        Map<Long, Space> spaces = loadSpaces(pages.values());

        List<PageBlockDetailVO> result = new ArrayList<>();
        for (String blockId : blockIds) {
            WikiBlock row = byId.get(blockId);
            if (row == null) {
                continue;
            }
            com.knowledge.wiki.service.entity.Page page = pages.get(row.getPageId());
            if (page == null) {
                continue;
            }
            result.add(WikiBlockViewConverter.toDetailVO(row, page, spaces.get(page.getSpaceId())));
        }
        return result;
    }

    /** Authoritative MySQL LIKE fallback for Redis search. */
    public List<PageBlockDetailVO> search(String keyword, Long pageId, Long spaceId, int limit) {
        if (StrUtil.isBlank(keyword)) {
            return new ArrayList<>();
        }
        Map<Long, com.knowledge.wiki.service.entity.Page> pages = readablePages(pageId, spaceId);
        if (pages.isEmpty()) {
            return new ArrayList<>();
        }
        int safeLimit = limit > 0 ? Math.min(limit, 500) : 50;
        List<WikiBlock> rows = wikiBlockMapper.selectList(new LambdaQueryWrapper<WikiBlock>()
                .in(WikiBlock::getPageId, pages.keySet())
                .like(WikiBlock::getText, keyword)
                .orderByDesc(WikiBlock::getRev)
                .last("LIMIT " + safeLimit));
        Map<Long, Space> spaces = loadSpaces(pages.values());
        return rows.stream().map(row -> {
            com.knowledge.wiki.service.entity.Page page = pages.get(row.getPageId());
            return WikiBlockViewConverter.toDetailVO(row, page,
                    page == null ? null : spaces.get(page.getSpaceId()));
        }).collect(Collectors.toList());
    }

    private WikiBlock requireReadableBlock(String blockId) {
        if (StrUtil.isBlank(blockId)) {
            throw WikiException.INVALID_PARAMETER.newException("块ID不能为空");
        }
        WikiBlock block = wikiBlockMapper.selectById(blockId);
        if (block == null) {
            return null;
        }
        com.knowledge.wiki.service.entity.Page page = pageService.getById(block.getPageId());
        if (!isLive(page)) {
            return null;
        }
        permissionService.checkPagePermission(SecurityContextUtil.getUserId(), page,
                IPermissionService.PERMISSION_READ);
        return block;
    }

    private Map<Long, com.knowledge.wiki.service.entity.Page> readablePages(Long pageId, Long spaceId) {
        List<com.knowledge.wiki.service.entity.Page> candidates;
        if (pageId != null) {
            com.knowledge.wiki.service.entity.Page page = pageService.getById(pageId);
            candidates = page == null || (spaceId != null && !spaceId.equals(page.getSpaceId()))
                    ? Collections.emptyList()
                    : Collections.singletonList(page);
        } else {
            candidates = pageService.lambdaQuery()
                    .eq(spaceId != null, com.knowledge.wiki.service.entity.Page::getSpaceId, spaceId)
                    .ne(com.knowledge.wiki.service.entity.Page::getStatus, PageStatus.DELETED)
                    .ne(com.knowledge.wiki.service.entity.Page::getStatus, PageStatus.TRASH)
                    .list();
        }
        return readablePages(candidates);
    }

    private Map<Long, com.knowledge.wiki.service.entity.Page> readablePages(Set<Long> pageIds) {
        if (CollUtil.isEmpty(pageIds)) {
            return new HashMap<>();
        }
        return readablePages(pageService.listByIds(pageIds));
    }

    private Map<Long, com.knowledge.wiki.service.entity.Page> readablePages(
            Iterable<com.knowledge.wiki.service.entity.Page> candidates) {
        Long userId = SecurityContextUtil.getUserId();
        Map<Long, com.knowledge.wiki.service.entity.Page> result = new LinkedHashMap<>();
        for (com.knowledge.wiki.service.entity.Page page : candidates) {
            if (isLive(page) && permissionService.effectivePagePermission(userId, page) != null) {
                result.put(page.getId(), page);
            }
        }
        return result;
    }

    private static boolean isLive(com.knowledge.wiki.service.entity.Page page) {
        return page != null && page.getStatus() != PageStatus.DELETED && page.getStatus() != PageStatus.TRASH;
    }

    private Map<Long, Space> loadSpaces(Iterable<com.knowledge.wiki.service.entity.Page> pages) {
        List<Long> ids = new ArrayList<>();
        for (com.knowledge.wiki.service.entity.Page page : pages) {
            if (page.getSpaceId() != null && !ids.contains(page.getSpaceId())) {
                ids.add(page.getSpaceId());
            }
        }
        if (ids.isEmpty()) {
            return new HashMap<>();
        }
        return spaceService.listByIds(ids).stream()
                .collect(Collectors.toMap(Space::getId, space -> space, (left, right) -> left));
    }
}
