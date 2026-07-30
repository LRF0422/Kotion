package com.knowledge.agent.store.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.store.entity.AgentUsageRecordEntity;
import com.knowledge.agent.store.vo.UsageStatsVO;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * MyBatis-Plus mapper for {@link AgentUsageRecordEntity}.
 *
 * <p>
 * Annotated with {@link InterceptorIgnore} to bypass the tenant line
 * interceptor — usage records are aggregated globally by platform admins.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentUsageRecordMapper extends BaseMapper<AgentUsageRecordEntity> {

    /**
     * Atomic upsert by {@code session_id} (unique key). A suspend → resume
     * cycle re-reports cumulative totals of the same session, so the last
     * write wins instead of inserting a duplicate row.
     */
    @Insert("INSERT INTO agent_usage_record " +
            "(session_id, conversation_id, user_id, tenant_id, user_name, model_name, " +
            "prompt_tokens, completion_tokens, total_tokens, duration_ms, finish_reason, create_time) " +
            "VALUES (#{sessionId}, #{conversationId}, #{userId}, #{tenantId}, #{userName}, #{modelName}, " +
            "#{promptTokens}, #{completionTokens}, #{totalTokens}, #{durationMs}, #{finishReason}, #{createTime}) " +
            "ON DUPLICATE KEY UPDATE " +
            "prompt_tokens = VALUES(prompt_tokens), " +
            "completion_tokens = VALUES(completion_tokens), " +
            "total_tokens = VALUES(total_tokens), " +
            "duration_ms = VALUES(duration_ms), " +
            "finish_reason = VALUES(finish_reason)")
    void upsertBySessionId(AgentUsageRecordEntity entity);

    /**
     * Daily token consumption trend since the given date (yyyy-MM-dd).
     */
    @Select("SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS date, " +
            "SUM(prompt_tokens) AS promptTokens, SUM(completion_tokens) AS completionTokens, " +
            "SUM(total_tokens) AS totalTokens, COUNT(*) AS sessions " +
            "FROM agent_usage_record " +
            "WHERE create_time >= #{startDate} " +
            "GROUP BY DATE_FORMAT(create_time, '%Y-%m-%d') " +
            "ORDER BY date")
    List<UsageStatsVO.DailyTokens> selectDailyTokens(@Param("startDate") String startDate);

    /**
     * Top users by total token consumption since the given date.
     */
    @Select("SELECT user_id AS userId, MAX(user_name) AS userName, COUNT(*) AS sessions, " +
            "SUM(prompt_tokens) AS promptTokens, SUM(completion_tokens) AS completionTokens, " +
            "SUM(total_tokens) AS totalTokens " +
            "FROM agent_usage_record " +
            "WHERE create_time >= #{startDate} AND user_id IS NOT NULL " +
            "GROUP BY user_id " +
            "ORDER BY totalTokens DESC " +
            "LIMIT #{limit}")
    List<UsageStatsVO.ByUser> selectUsageByUser(@Param("startDate") String startDate,
                                                @Param("limit") Integer limit);

    /**
     * Usage grouped by model with estimated cost (price per 1K tokens from
     * {@code agent_model_price}; cost is 0 when no price is configured).
     */
    @Select("SELECT r.model_name AS modelName, COUNT(*) AS sessions, " +
            "SUM(r.prompt_tokens) AS promptTokens, SUM(r.completion_tokens) AS completionTokens, " +
            "SUM(r.total_tokens) AS totalTokens, " +
            "ROUND(SUM(r.prompt_tokens) / 1000 * IFNULL(p.prompt_price, 0) " +
            "  + SUM(r.completion_tokens) / 1000 * IFNULL(p.completion_price, 0), 4) AS cost, " +
            "IFNULL(p.currency, 'CNY') AS currency " +
            "FROM agent_usage_record r " +
            "LEFT JOIN agent_model_price p ON p.model_name = r.model_name " +
            "WHERE r.create_time >= #{startDate} " +
            "GROUP BY r.model_name, p.prompt_price, p.completion_price, p.currency " +
            "ORDER BY totalTokens DESC")
    List<UsageStatsVO.ByModel> selectUsageByModel(@Param("startDate") String startDate);
}
