package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentProfileExtractionEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** Owner-scoped SQL access for the per-session extraction watermark. */
@InterceptorIgnore(tenantLine = "true")
public interface AgentProfileExtractionMapper extends BaseMapper<AgentProfileExtractionEntity> {

    @Select("SELECT * FROM agent_profile_extraction "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND session_id = #{sessionId}")
    AgentProfileExtractionEntity selectBySession(@Param("tenantId") Long tenantId,
                                                 @Param("userId") Long userId,
                                                 @Param("sessionId") String sessionId);

    @Insert("INSERT INTO agent_profile_extraction (tenant_id, user_id, session_id, "
            + "extracted_message_count, last_run_id, model, status, create_time, update_time) "
            + "VALUES (#{tenantId}, #{userId}, #{sessionId}, #{extractedMessageCount}, #{lastRunId}, "
            + "#{model}, #{status}, #{createTime}, #{updateTime}) "
            + "ON DUPLICATE KEY UPDATE "
            + "extracted_message_count = VALUES(extracted_message_count), "
            + "last_run_id = VALUES(last_run_id), model = VALUES(model), status = VALUES(status), "
            + "update_time = VALUES(update_time)")
    void upsertWatermark(AgentProfileExtractionEntity entity);

    @Delete("DELETE FROM agent_profile_extraction "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId}")
    int deleteByOwner(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
}
