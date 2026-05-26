package com.knowledge.wiki.service.service.impl;

import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.mapper.PageContentMapper;
import com.knowledge.wiki.service.service.IPageContentService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;

@Service
public class PageContentServiceImpl extends MPJBaseServiceImpl<PageContentMapper, PageContent>
                implements IPageContentService {

        @Override
        public List<PageContent> findByPageId(Long pageId) {
                return this.lambdaQuery()
                                .eq(PageContent::getPageId, pageId)
                                .orderByAsc(PageContent::getSortOrder)
                                .list();
        }

        @Override
        public void upsertBlock(PageContent block) {
                if (block == null || StrUtil.isBlank(block.getId())) {
                        return;
                }
                PageContent existing = this.lambdaQuery()
                                .eq(PageContent::getId, block.getId())
                                .one();
                if (existing != null) {
                        // Merge onto existing entity so updateById has the correct PK and audit fields
                        existing.setType(block.getType());
                        existing.setAttrs(block.getAttrs());
                        existing.setContent(block.getContent());
                        existing.setMarks(block.getMarks());
                        existing.setText(block.getText());
                        existing.setParentId(block.getParentId());
                        existing.setPath(block.getPath());
                        existing.setSortOrder(block.getSortOrder());
                        existing.setVersion(block.getVersion());
                        this.updateById(existing);
                } else {
                        this.save(block);
                }
        }

        @Override
        public void deleteByPageIdAndNotInIds(Long pageId, Set<String> keepIds) {
                if (pageId == null) {
                        return;
                }
                if (CollUtil.isEmpty(keepIds)) {
                        // No blocks to keep — delete all for this page
                        this.lambdaUpdate()
                                        .eq(PageContent::getPageId, pageId)
                                        .remove();
                } else {
                        this.lambdaUpdate()
                                        .eq(PageContent::getPageId, pageId)
                                        .notIn(PageContent::getId, keepIds)
                                        .remove();
                }
        }

}
