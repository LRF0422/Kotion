package com.knowledge.wiki.service.mapper;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.wiki.service.entity.Developer;

public interface DeveloperMapper extends MPJBaseMapper<Developer> {

    @Select("SELECT * FROM wiki_developer WHERE user_id = #{userId} AND is_deleted = 0 LIMIT 1")
    Developer selectByUserId(@Param("userId") Long userId);
}
