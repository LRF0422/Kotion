package com.knowledge.wiki.service.mapper;

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

}
