package com.knowledge.wiki.service.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.wiki.service.entity.WikiBlock;

/**
 * Queries the one-time legacy backfill needs and nothing else needs.
 * <p>
 * Kept in its own interface rather than added to {@code PageContentMapper} so
 * that retiring {@code wiki_page_block} is a single-file deletion instead of an
 * edit to a mapper other code still depends on.
 * </p>
 * <p>
 * Typed on {@link WikiBlock} only because a MyBatis-Plus mapper needs an entity;
 * the declared statement is hand-written SQL against the legacy table and does
 * not touch it.
 * </p>
 */
public interface BlockBackfillMapper extends BaseMapper<WikiBlock> {

    /**
     * Every page that has legacy block rows, lowest page id first.
     * <p>
     * The logical-delete filter is spelled out because MyBatis-Plus only appends
     * it to statements it generates itself, and this one is hand-written.
     * </p>
     */
    @Select("SELECT DISTINCT page_id FROM wiki_page_block WHERE is_deleted = 0 AND page_id IS NOT NULL ORDER BY page_id")
    List<Long> selectLegacyPageIds();

}
