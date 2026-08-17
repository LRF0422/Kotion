package com.knowledge.agentcore.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agentcore.entity.AgentLongMemoryEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * MyBatis-Plus mapper for the {@code agent_long_memory} table.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentLongMemoryMapper extends BaseMapper<AgentLongMemoryEntity> {

    @Insert("INSERT INTO agent_long_memory (memory_id, scope, user_id, tenant_id, space_id, page_id, " +
            "type, content, importance, tags, embedding_ref, create_time, update_time, last_access_time) " +
            "VALUES (#{memoryId}, #{scope}, #{userId}, #{tenantId}, #{spaceId}, #{pageId}, " +
            "#{type}, #{content}, #{importance}, #{tags}, #{embeddingRef}, #{createTime}, #{updateTime}, #{lastAccessTime}) " +
            "ON DUPLICATE KEY UPDATE " +
            "scope = VALUES(scope), " +
            "type = VALUES(type), " +
            "content = VALUES(content), " +
            "importance = VALUES(importance), " +
            "tags = VALUES(tags), " +
            "embedding_ref = VALUES(embedding_ref), " +
            "update_time = VALUES(update_time), " +
            "last_access_time = VALUES(last_access_time)")
    void upsertByMemoryId(AgentLongMemoryEntity entity);

    @Select("SELECT * FROM agent_long_memory WHERE memory_id = #{memoryId}")
    AgentLongMemoryEntity selectByMemoryId(@Param("memoryId") String memoryId);

    /** Top-k by (importance, recency) for a scope — deterministic retrieval. */
    @Select("SELECT * FROM agent_long_memory WHERE scope = #{scope} " +
            "ORDER BY importance DESC, last_access_time DESC LIMIT #{limit}")
    List<AgentLongMemoryEntity> selectTopByScope(@Param("scope") String scope,
                                                 @Param("limit") int limit);

    /** All entries in a scope, newest first (UI browsing). */
    @Select("SELECT * FROM agent_long_memory WHERE scope = #{scope} " +
            "ORDER BY create_time DESC LIMIT #{limit}")
    List<AgentLongMemoryEntity> selectByScope(@Param("scope") String scope,
                                              @Param("limit") int limit);
}
