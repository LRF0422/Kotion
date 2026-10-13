package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentLongMemoryEntity;
import org.apache.ibatis.annotations.Delete;
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

    /**
     * Every entry owned by one user across all scopes, newest first (memory
     * management UI). {@code scope} embeds the user id, but a plain prefix match
     * would also catch {@code u:12*} for user {@code 1} — so ownership is
     * enforced on {@code user_id} instead, which is the same guard
     * {@link #selectByMemoryId} + ownership check uses at runtime.
     *
     * <p>The tenant line interceptor is disabled for this mapper, so the tenant
     * condition is written out here; rows saved by a context without a tenant
     * ({@code tenant_id IS NULL}) stay visible to their owner.
     *
     * <p>{@code memory_id} breaks ties on {@code create_time}: without it, rows
     * sharing a timestamp could shuffle between OFFSET pages and be returned
     * twice (or skipped) while the UI pages through them.
     */
    @Select("<script>SELECT * FROM agent_long_memory WHERE user_id = #{userId} " +
            "<if test='tenantId != null'> AND (tenant_id = #{tenantId} OR tenant_id IS NULL) </if>" +
            "<if test='type != null'> AND type = #{type} </if>" +
            "ORDER BY create_time DESC, memory_id DESC LIMIT #{limit} OFFSET #{offset}</script>")
    List<AgentLongMemoryEntity> selectByUserId(@Param("userId") Long userId,
                                               @Param("tenantId") Long tenantId,
                                               @Param("type") String type,
                                               @Param("limit") int limit,
                                               @Param("offset") int offset);

    /** Count of the same set {@link #selectByUserId} pages through (UI total). */
    @Select("<script>SELECT COUNT(*) FROM agent_long_memory WHERE user_id = #{userId} " +
            "<if test='tenantId != null'> AND (tenant_id = #{tenantId} OR tenant_id IS NULL) </if>" +
            "<if test='type != null'> AND type = #{type} </if></script>")
    int countByUserId(@Param("userId") Long userId,
                      @Param("tenantId") Long tenantId,
                      @Param("type") String type);

    /** Delete every entry owned by one user (purge); returns the rows removed. */
    @Delete("<script>DELETE FROM agent_long_memory WHERE user_id = #{userId} " +
            "<if test='tenantId != null'> AND (tenant_id = #{tenantId} OR tenant_id IS NULL) </if>" +
            "</script>")
    int deleteByUserId(@Param("userId") Long userId, @Param("tenantId") Long tenantId);
}
