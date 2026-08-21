package com.knowledge.wiki.service.mapper;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.wiki.service.entity.PageHead;

public interface PageHeadMapper extends MPJBaseMapper<PageHead> {

    /**
     * Acquire the page's write lock and read its current rev in one round trip.
     * <p>
     * Returns {@code null} when the page has no head row yet — the caller must
     * insert one, and the unique primary key is what makes two concurrent
     * first-writers resolve to a single row.
     * </p>
     */
    @Select("SELECT page_id, rev, last_actor, updated_at FROM wiki_page_head WHERE page_id = #{pageId} FOR UPDATE")
    PageHead selectForUpdate(@Param("pageId") Long pageId);

}
