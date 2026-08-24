package com.knowledge.wiki.service.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.wiki.service.entity.PageOp;

public interface PageOpMapper extends MPJBaseMapper<PageOp> {

    @Select("SELECT id, page_id, rev, actor, ops, idempotency_key, created_at FROM wiki_page_op "
            + "WHERE page_id = #{pageId} AND rev > #{afterRev} AND rev <= #{toRev} ORDER BY rev ASC")
    List<PageOp> selectForReplay(@Param("pageId") Long pageId, @Param("afterRev") Long afterRev,
            @Param("toRev") Long toRev);

}
