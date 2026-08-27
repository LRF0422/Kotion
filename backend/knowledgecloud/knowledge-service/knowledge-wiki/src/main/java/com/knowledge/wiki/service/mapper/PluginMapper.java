package com.knowledge.wiki.service.mapper;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.dto.QueryAdminPluginDTO;

public interface PluginMapper extends MPJBaseMapper<Plugin> {

    @Select("SELECT * FROM wiki_plugin WHERE id = #{id} AND is_deleted = 0 FOR UPDATE")
    Plugin selectByIdForUpdate(@Param("id") Long id);

    IPage<Plugin> selectAdminReviewPage(IPage<Plugin> page, @Param("query") QueryAdminPluginDTO query);
}
