package com.knowledge.wiki.service.mapper;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Param;

import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.wiki.service.entity.PluginTag;

public interface PluginTagMapper extends MPJBaseMapper<PluginTag> {

    @Delete("DELETE FROM wiki_plugin_tag WHERE plugin_id = #{pluginId}")
    int deletePhysicallyByPluginId(@Param("pluginId") Long pluginId);
}
