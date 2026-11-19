package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentChatSessionGroupEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * Owner-scoped SQL access for {@code agent_session_group}.
 *
 * <p>The tenant-line interceptor is bypassed for the same reason as
 * {@link AgentChatSessionMapper}: every statement already filters on the
 * caller's {@code tenant_id} + {@code user_id}, and the group rows carry no
 * space/page scope to derive one from.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentChatSessionGroupMapper extends BaseMapper<AgentChatSessionGroupEntity> {

    @Select("SELECT id, tenant_id, user_id, group_id, name, sort_index, create_time, update_time "
            + "FROM agent_session_group "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} "
            + "ORDER BY sort_index ASC, create_time ASC, group_id ASC LIMIT #{limit}")
    List<AgentChatSessionGroupEntity> selectOwned(@Param("tenantId") Long tenantId,
                                                 @Param("userId") Long userId,
                                                 @Param("limit") int limit);

    @Select("SELECT id, tenant_id, user_id, group_id, name, sort_index, create_time, update_time "
            + "FROM agent_session_group "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND group_id = #{groupId}")
    AgentChatSessionGroupEntity selectOwnedOne(@Param("tenantId") Long tenantId,
                                               @Param("userId") Long userId,
                                               @Param("groupId") String groupId);

    /**
     * Insert or update one group's name / position. {@code create_time} is only
     * taken from the INSERT branch, so a rename never reorders the list.
     */
    @Insert("INSERT INTO agent_session_group (tenant_id, user_id, group_id, name, sort_index, "
            + "create_time, update_time) "
            + "VALUES (#{tenantId}, #{userId}, #{groupId}, #{name}, #{sortIndex}, "
            + "#{createTime}, #{updateTime}) "
            + "ON DUPLICATE KEY UPDATE "
            + "name = VALUES(name), "
            + "sort_index = VALUES(sort_index), "
            + "update_time = VALUES(update_time)")
    void upsert(AgentChatSessionGroupEntity entity);

    @Delete("DELETE FROM agent_session_group "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND group_id = #{groupId}")
    int deleteOwned(@Param("tenantId") Long tenantId,
                    @Param("userId") Long userId,
                    @Param("groupId") String groupId);
}