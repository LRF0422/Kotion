package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentUserProfileConsentEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** Owner-scoped SQL access for the profile opt-in. */
@InterceptorIgnore(tenantLine = "true")
public interface AgentUserProfileConsentMapper extends BaseMapper<AgentUserProfileConsentEntity> {

    @Select("SELECT * FROM agent_user_profile_consent "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId}")
    AgentUserProfileConsentEntity selectByOwner(@Param("tenantId") Long tenantId,
                                                @Param("userId") Long userId);

    @Insert("INSERT INTO agent_user_profile_consent (tenant_id, user_id, enabled, agreed_at, "
            + "create_time, update_time) "
            + "VALUES (#{tenantId}, #{userId}, #{enabled}, #{agreedAt}, #{createTime}, #{updateTime}) "
            + "ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), agreed_at = VALUES(agreed_at), "
            + "update_time = VALUES(update_time)")
    void upsertConsent(AgentUserProfileConsentEntity entity);

    @Delete("DELETE FROM agent_user_profile_consent "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId}")
    int deleteByOwner(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
}
