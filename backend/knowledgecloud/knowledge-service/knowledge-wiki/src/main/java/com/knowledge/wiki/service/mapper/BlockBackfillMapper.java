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
     * Every live page, lowest page id first. Pages without legacy rows still need
     * an explicit rev-0 head so an absent head can no longer be mistaken for a
     * deliberately empty document.
     */
    @Select("SELECT id FROM wiki_page WHERE is_deleted = 0 ORDER BY id")
    List<Long> selectPageIds();

    @Select("SELECT COUNT(*) FROM wiki_page p LEFT JOIN wiki_page_head h ON h.page_id = p.id "
            + "WHERE p.is_deleted = 0 AND h.page_id IS NULL")
    long countPagesWithoutHead();

}
