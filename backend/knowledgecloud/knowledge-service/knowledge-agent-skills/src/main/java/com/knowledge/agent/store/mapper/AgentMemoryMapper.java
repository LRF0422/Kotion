package com.knowledge.agent.store.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.store.entity.AgentMemoryEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * MyBatis-Plus mapper for {@link AgentMemoryEntity}.
 *
 * <p>Cold-path fallback for the Redis-primary memory store. Keyword recall is a
 * simple {@code LIKE} over the scope's contents, ordered by importance then
 * recency.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentMemoryMapper extends BaseMapper<AgentMemoryEntity> {

    @Insert("INSERT INTO agent_memory " +
            "(memory_id, scope, user_id, tenant_id, type, content, importance, tags, " +
            "create_time, update_time, last_access_time) " +
            "VALUES (#{memoryId}, #{scope}, #{userId}, #{tenantId}, #{type}, #{content}, #{importance}, #{tags}, " +
            "#{createTime}, #{updateTime}, #{lastAccessTime}) " +
            "ON DUPLICATE KEY UPDATE " +
            "content = VALUES(content), " +
            "type = VALUES(type), " +
            "importance = VALUES(importance), " +
            "tags = VALUES(tags), " +
            "update_time = VALUES(update_time), " +
            "last_access_time = VALUES(last_access_time)")
    void upsertByMemoryId(AgentMemoryEntity entity);

    @Select("SELECT * FROM agent_memory WHERE scope = #{scope} " +
            "AND (content LIKE CONCAT('%', #{query}, '%') " +
            "     OR tags LIKE CONCAT('%', #{query}, '%') " +
            "     OR type LIKE CONCAT('%', #{query}, '%')) " +
            "ORDER BY importance DESC, last_access_time DESC LIMIT #{limit}")
    List<AgentMemoryEntity> search(@Param("scope") String scope,
                                   @Param("query") String query,
                                   @Param("limit") int limit);

    @Select("SELECT * FROM agent_memory WHERE scope = #{scope} " +
            "ORDER BY importance DESC, last_access_time DESC LIMIT #{limit}")
    List<AgentMemoryEntity> latest(@Param("scope") String scope, @Param("limit") int limit);
}
