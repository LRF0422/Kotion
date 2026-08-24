package com.knowledge.wiki.service.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.wiki.service.entity.PageCheckpoint;

public interface PageCheckpointMapper extends MPJBaseMapper<PageCheckpoint> {

    @Select("SELECT id, page_id, rev, kind, label, doc, block_count, actor, source_rev, created_at "
            + "FROM wiki_page_checkpoint WHERE page_id = #{pageId} AND rev <= #{rev} "
            + "ORDER BY rev DESC, id DESC LIMIT 1")
    PageCheckpoint selectNearestAtOrBefore(@Param("pageId") Long pageId, @Param("rev") Long rev);

    @Select({ "<script>",
            "SELECT id, page_id, rev, kind, label, block_count, actor, source_rev, created_at ",
            "FROM wiki_page_checkpoint WHERE page_id = #{pageId} ",
            "<if test='beforeRev != null'>AND rev &lt; #{beforeRev} </if>",
            "ORDER BY rev DESC, id DESC LIMIT #{limit}",
            "</script>" })
    List<PageCheckpoint> selectHistory(@Param("pageId") Long pageId, @Param("beforeRev") Long beforeRev,
            @Param("limit") int limit);

    @Select("SELECT id, page_id, rev, kind, label, block_count, actor, source_rev, created_at "
            + "FROM wiki_page_checkpoint WHERE page_id = #{pageId} AND rev = #{rev} LIMIT 1")
    PageCheckpoint selectByPageAndRev(@Param("pageId") Long pageId, @Param("rev") Long rev);

    @Select("SELECT COUNT(*) FROM wiki_page_checkpoint WHERE page_id = #{pageId}")
    int countByPage(@Param("pageId") Long pageId);

    @Update("UPDATE wiki_page_checkpoint SET kind = #{kind}, label = #{label}, actor = #{actor}, "
            + "source_rev = #{sourceRev}, created_at = #{createdAt} WHERE id = #{id}")
    int updateMetadata(PageCheckpoint checkpoint);

}
