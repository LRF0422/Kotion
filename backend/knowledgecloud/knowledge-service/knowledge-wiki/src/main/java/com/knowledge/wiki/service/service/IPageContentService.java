package com.knowledge.wiki.service.service;

import java.util.List;
import java.util.Set;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.PageContent;

public interface IPageContentService extends MPJBaseService<PageContent> {

    /**
     * Find all block rows for a given page, ordered by sortOrder.
     *
     * @param pageId the page ID
     * @return list of flat block rows
     */
    List<PageContent> findByPageId(Long pageId);

    /**
     * Insert or update a single block row.
     *
     * @param block the block to upsert
     */
    void upsertBlock(PageContent block);

    /**
     * Delete block rows for a page that are NOT in the given ID set.
     *
     * @param pageId  the page ID
     * @param keepIds block IDs to keep
     */
    void deleteByPageIdAndNotInIds(Long pageId, Set<String> keepIds);

}
