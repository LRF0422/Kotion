package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
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
                        return;
                }
                // Avoid `NOT IN (huge list)` — for a million-block page that SQL is
                // oversized and the optimizer drops the index. Instead read this page's
                // ids (single-column index scan), diff in memory (the to-delete set is
                // usually tiny), then delete it in small IN batches.
                List<PageContent> rows = this.lambdaQuery()
                                .select(PageContent::getId)
                                .eq(PageContent::getPageId, pageId)
                                .list();
                List<String> toDelete = new ArrayList<>();
                for (PageContent r : rows) {
                        if (!keepIds.contains(r.getId())) {
                                toDelete.add(r.getId());
                        }
                }
                if (toDelete.isEmpty()) {
                        return;
                }
                final int batch = 1000;
                for (int i = 0; i < toDelete.size(); i += batch) {
                        List<String> chunk = toDelete.subList(i, Math.min(i + batch, toDelete.size()));
                        this.lambdaUpdate()
                                        .eq(PageContent::getPageId, pageId)
                                        .in(PageContent::getId, chunk)
                                        .remove();
                }
        }

}
