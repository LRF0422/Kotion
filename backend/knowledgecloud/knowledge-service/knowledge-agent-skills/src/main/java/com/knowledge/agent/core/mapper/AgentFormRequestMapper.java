package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentFormRequestEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * Owner-scoped SQL for {@code agent_form_request}.
 *
 * <p>The answer transition is conditional ({@code status='pending'}), so a
 * double submit cannot deliver two different answers. Delivery is a separate
 * flag (`delivered_at`) for the existing "exactly once" contract.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentFormRequestMapper extends BaseMapper<AgentFormRequestEntity> {

    @Select("SELECT * FROM agent_form_request WHERE form_id = #{formId} "
            + "AND tenant_id = #{tenantId} AND user_id = #{userId}")
    AgentFormRequestEntity selectByFormId(@Param("tenantId") Long tenantId,
                                          @Param("userId") Long userId,
                                          @Param("formId") String formId);

    @Select("<script>"
            + "SELECT * FROM agent_form_request WHERE tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND status = #{status} "
            + "<if test='conversationId != null and conversationId != \"\"'>"
            + "AND conversation_id = #{conversationId} </if>"
            + "ORDER BY created_at ASC LIMIT #{limit}"
            + "</script>")
    List<AgentFormRequestEntity> selectByStatus(@Param("tenantId") Long tenantId,
                                                @Param("userId") Long userId,
                                                @Param("status") String status,
                                                @Param("conversationId") String conversationId,
                                                @Param("limit") int limit);

    @Insert("INSERT INTO agent_form_request "
            + "(form_id, conversation_id, run_id, call_id, tenant_id, user_id, title, schema_json, "
            + "status, values_json, rows_json, cancel_reason, created_at, answered_at, delivered_at, expires_at) "
            + "VALUES (#{formId}, #{conversationId}, #{runId,jdbcType=VARCHAR}, #{callId,jdbcType=VARCHAR}, "
            + "#{tenantId}, #{userId}, #{title}, #{schemaJson}, #{status}, "
            + "#{valuesJson,jdbcType=LONGVARCHAR}, #{rowsJson,jdbcType=LONGVARCHAR}, "
            + "#{cancelReason,jdbcType=VARCHAR}, #{createdAt}, #{answeredAt,jdbcType=BIGINT}, "
            + "#{deliveredAt,jdbcType=BIGINT}, #{expiresAt,jdbcType=BIGINT})")
    int insertForm(AgentFormRequestEntity entity);

    /** pending -> answered. A second answer is a no-op. */
    @Update("UPDATE agent_form_request SET status = 'answered', "
            + "values_json = #{valuesJson,jdbcType=LONGVARCHAR}, rows_json = #{rowsJson,jdbcType=LONGVARCHAR}, "
            + "answered_at = #{now} "
            + "WHERE form_id = #{formId} AND tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND status = 'pending' AND (expires_at IS NULL OR expires_at >= #{now})")
    int answer(@Param("tenantId") Long tenantId,
               @Param("userId") Long userId,
               @Param("formId") String formId,
               @Param("valuesJson") String valuesJson,
               @Param("rowsJson") String rowsJson,
               @Param("now") long now);

    @Update("UPDATE agent_form_request SET status = 'cancelled', "
            + "cancel_reason = #{reason,jdbcType=VARCHAR}, answered_at = #{now} "
            + "WHERE form_id = #{formId} AND tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND status = 'pending'")
    int cancel(@Param("tenantId") Long tenantId,
               @Param("userId") Long userId,
               @Param("formId") String formId,
               @Param("reason") String reason,
               @Param("now") long now);

    @Update("UPDATE agent_form_request SET status = 'expired', answered_at = #{now} "
            + "WHERE form_id = #{formId} AND status = 'pending' "
            + "AND expires_at IS NOT NULL AND expires_at < #{now}")
    int expire(@Param("formId") String formId, @Param("now") long now);

    @Update("UPDATE agent_form_request SET delivered_at = #{now} "
            + "WHERE form_id = #{formId} AND tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND status = 'answered' AND delivered_at IS NULL")
    int markDelivered(@Param("tenantId") Long tenantId,
                      @Param("userId") Long userId,
                      @Param("formId") String formId,
                      @Param("now") long now);
}