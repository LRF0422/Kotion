package com.knowledge.agent.store.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.store.entity.AgentUserProfileEntity;
import org.apache.ibatis.annotations.Insert;

/**
 * MyBatis-Plus mapper for {@link AgentUserProfileEntity} — durable user-profile
 * mirror (cold fallback for the Redis-primary profile store).
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentUserProfileMapper extends BaseMapper<AgentUserProfileEntity> {

    @Insert("INSERT INTO agent_user_profile " +
            "(user_id, tenant_id, profile_json, language, preferred_model, tool_usage_json, skill_usage_json, " +
            "interaction_count, total_tokens, create_time, update_time) " +
            "VALUES (#{userId}, #{tenantId}, #{profileJson}, #{language}, #{preferredModel}, #{toolUsageJson}, " +
            "#{skillUsageJson}, #{interactionCount}, #{totalTokens}, #{createTime}, #{updateTime}) " +
            "ON DUPLICATE KEY UPDATE " +
            "profile_json = VALUES(profile_json), " +
            "language = VALUES(language), " +
            "preferred_model = VALUES(preferred_model), " +
            "tool_usage_json = VALUES(tool_usage_json), " +
            "skill_usage_json = VALUES(skill_usage_json), " +
            "interaction_count = VALUES(interaction_count), " +
            "total_tokens = VALUES(total_tokens), " +
            "update_time = VALUES(update_time)")
    void upsertByUserTenant(AgentUserProfileEntity entity);
}
