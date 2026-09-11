package com.knowledge.wiki.service.mapper;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.wiki.service.entity.PluginRating;

public interface PluginRatingMapper extends MPJBaseMapper<PluginRating> {

    @Select("SELECT COUNT(*) FROM wiki_plugin_rating WHERE plugin_id = #{pluginId} AND is_deleted = 0")
    long countByPlugin(@Param("pluginId") Long pluginId);

    @Select("SELECT COALESCE(AVG(score), 0) FROM wiki_plugin_rating WHERE plugin_id = #{pluginId} AND is_deleted = 0")
    double averageScore(@Param("pluginId") Long pluginId);
}
