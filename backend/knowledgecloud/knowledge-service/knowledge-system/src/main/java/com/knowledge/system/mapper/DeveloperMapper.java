package com.knowledge.system.mapper;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.system.domain.Developer;

public interface DeveloperMapper extends MPJBaseMapper<Developer> {

    @Select("SELECT * FROM knowledge_developer WHERE user_id = #{userId} AND is_deleted = 0 LIMIT 1")
    Developer selectByUserId(@Param("userId") Long userId);
}
