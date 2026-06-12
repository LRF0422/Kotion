package com.knowledge.wiki.service.mapper;

import java.util.Collection;
import java.util.List;

import org.apache.ibatis.annotations.Param;

import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.wiki.service.entity.PageContent;

public interface PageContentMapper extends MPJBaseMapper<PageContent> {

    /**
     * Bulk INSERT ... ON DUPLICATE KEY UPDATE.
     * Efficiently handles both new and content-changed blocks in a single SQL statement.
     *
     * @param list blocks to insert or update
     */
    void batchInsertOnDuplicate(@Param("list") List<PageContent> list);

    /**
     * Lightweight batch UPDATE for structural-only changes (parent_id, path, sort_order).
     * Avoids writing large JSON columns when content is unchanged.
     *
     * @param list blocks with structural changes only
     */
    void batchUpdateStructure(@Param("list") List<PageContent> list);

    /**
     * Collect, in a SINGLE round-trip, the ids of the subtree(s) rooted at any of
     * {@code rootIds} (roots included), following the {@code parent_id} relation
     * via a recursive CTE. Replaces the per-level BFS that cost one query per tree
     * depth. Requires MySQL 8+ and the {@code (page_id, parent_id)} index.
     *
     * @param pageId  the page the blocks belong to
     * @param rootIds anchor block ids
     * @return all subtree block ids (including the roots that exist)
     */
    List<String> selectSubtreeIds(@Param("pageId") Long pageId,
                                  @Param("rootIds") Collection<String> rootIds);

    /**
     * Insert-or-update a single block in one round-trip, incrementing
     * {@code version} on the DB side ({@code version = version + 1}) to avoid the
     * read-then-write race of SELECT-then-UPDATE.
     *
     * @param item the block to upsert
     */
    void upsertBlockVersionInc(@Param("item") PageContent item);

}
