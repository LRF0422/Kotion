package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentRunEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * MyBatis-Plus mapper for {@link AgentRunEntity}. Bypasses the tenant-line
 * interceptor (runs are already tenant-scoped in the service layer) and
 * upserts atomically by {@code run_id}.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentRunMapper extends BaseMapper<AgentRunEntity> {

    @Insert("INSERT INTO agent_run " +
            "(run_id, conversation_id, parent_run_id, user_id, tenant_id, model, mode, space_id, page_id, status, " +
            "finish_reason, suspend_reason, error_code, error_message, last_seq, prompt_tokens, " +
            "completion_tokens, cached_prompt_tokens, create_time, update_time) " +
            "VALUES (#{runId}, #{conversationId}, #{parentRunId}, #{userId}, #{tenantId}, #{model}, #{mode}, #{spaceId}, #{pageId}, #{status}, " +
            "#{finishReason}, #{suspendReason}, #{errorCode}, #{errorMessage}, #{lastSeq}, #{promptTokens}, " +
            "#{completionTokens}, #{cachedPromptTokens}, #{createTime}, #{updateTime}) " +
            "ON DUPLICATE KEY UPDATE " +
            "conversation_id = VALUES(conversation_id), " +
            "parent_run_id = VALUES(parent_run_id), " +
            "space_id = VALUES(space_id), " +
            "page_id = VALUES(page_id), " +
            "status = VALUES(status), " +
            "finish_reason = VALUES(finish_reason), " +
            "suspend_reason = VALUES(suspend_reason), " +
            "error_code = VALUES(error_code), " +
            "error_message = VALUES(error_message), " +
            "last_seq = VALUES(last_seq), " +
            "prompt_tokens = VALUES(prompt_tokens), " +
            "completion_tokens = VALUES(completion_tokens), " +
            "cached_prompt_tokens = VALUES(cached_prompt_tokens), " +
            "update_time = VALUES(update_time)")
    void upsertByRunId(AgentRunEntity entity);

    /** Active (non-terminal) run count for a tenant — concurrency quota signal. */
    @Select("SELECT COUNT(*) FROM agent_run WHERE tenant_id = #{tenantId} " +
            "AND status IN ('QUEUED','RUNNING','SUSPENDED','WAITING_TOOLS')")
    long countActiveByTenant(@Param("tenantId") Long tenantId);

    /** 某用户当日 token 累计（输入 + 输出）——管理端用量。 */
    @Select("SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) FROM agent_run " +
            "WHERE user_id = #{userId} AND create_time >= #{startMs}")
    long sumDailyTokensByUser(@Param("userId") Long userId, @Param("startMs") long startMs);

    /** 某用户当日根 run 数（子 agent 不重复计）——每日次数额度。 */
    @Select("SELECT COUNT(*) FROM agent_run WHERE user_id = #{userId} " +
            "AND parent_run_id IS NULL AND create_time >= #{startMs}")
    long countDailyRootRunsByUser(@Param("userId") Long userId, @Param("startMs") long startMs);

    /** 某用户区间内按模型的 token 汇总——积分折算用。 */
    @Select("SELECT model AS model, COALESCE(SUM(prompt_tokens), 0) AS promptTokens, " +
            "COALESCE(SUM(cached_prompt_tokens), 0) AS cachedPromptTokens, " +
            "COALESCE(SUM(completion_tokens), 0) AS completionTokens FROM agent_run " +
            "WHERE user_id = #{userId} AND parent_run_id IS NULL AND create_time >= #{startMs} " +
            "GROUP BY model")
    java.util.List<java.util.Map<String, Object>> selectTokenRowsByUser(
            @Param("userId") Long userId, @Param("startMs") long startMs);

    /** 某用户当前活跃 run 数——权益并发信号。 */
    @Select("SELECT COUNT(*) FROM agent_run WHERE user_id = #{userId} " +
            "AND status IN ('RUNNING','QUEUED','WAITING_TOOLS','SUSPENDED')")
    long countActiveByUser(@Param("userId") Long userId);

    /** Active runs in one conversation, oldest first (single-active auto-cancel). */
    @Select("SELECT * FROM agent_run WHERE conversation_id = #{conversationId} " +
            "AND user_id = #{userId} AND tenant_id = #{tenantId} " +
            "AND status IN ('QUEUED','RUNNING','WAITING_TOOLS','SUSPENDED') " +
            "ORDER BY create_time ASC LIMIT #{limit}")
    List<AgentRunEntity> selectActiveByConversation(
            @Param("conversationId") String conversationId,
            @Param("userId") Long userId,
            @Param("tenantId") Long tenantId,
            @Param("limit") int limit);

    /** Child runs of a parent run (sub-agent delegation tree). */
    @Select("SELECT * FROM agent_run WHERE parent_run_id = #{parentRunId} ORDER BY create_time ASC")
    List<AgentRunEntity> selectByParentRunId(@Param("parentRunId") String parentRunId);

    // ---- admin usage analytics (replaces agent_usage_record) ----

    /** Daily token trend from agent_run (epoch millis cutoff). */
    @Select("SELECT FROM_UNIXTIME(create_time / 1000, '%Y-%m-%d') AS date, " +
            "SUM(prompt_tokens) AS promptTokens, SUM(completion_tokens) AS completionTokens, " +
            "SUM(prompt_tokens + completion_tokens) AS totalTokens, " +
            "SUM(CASE WHEN parent_run_id IS NULL THEN 1 ELSE 0 END) AS sessions " +
            "FROM agent_run WHERE create_time >= #{startMs} " +
            "AND (#{tenantId} IS NULL OR tenant_id = #{tenantId}) " +
            "GROUP BY FROM_UNIXTIME(create_time / 1000, '%Y-%m-%d') ORDER BY date")
    List<com.knowledge.agent.core.web.vo.UsageStatsVO.DailyTokens> selectDailyTokens(
            @Param("startMs") long startMs, @Param("tenantId") Long tenantId);

    /** Top users by token consumption (name resolved from knowledge_user). */
    @Select("SELECT r.user_id AS userId, MAX(u.user_name) AS userName, " +
            "SUM(CASE WHEN r.parent_run_id IS NULL THEN 1 ELSE 0 END) AS sessions, " +
            "SUM(r.prompt_tokens) AS promptTokens, SUM(r.completion_tokens) AS completionTokens, " +
            "SUM(r.prompt_tokens + r.completion_tokens) AS totalTokens " +
            "FROM agent_run r LEFT JOIN knowledge_user u ON u.id = r.user_id " +
            "WHERE r.create_time >= #{startMs} AND r.user_id IS NOT NULL " +
            "AND (#{tenantId} IS NULL OR r.tenant_id = #{tenantId}) " +
            "GROUP BY r.user_id ORDER BY totalTokens DESC LIMIT #{limit}")
    List<com.knowledge.agent.core.web.vo.UsageStatsVO.ByUser> selectUsageByUser(@Param("startMs") long startMs,
                                                                              @Param("limit") int limit,
                                                                              @Param("tenantId") Long tenantId);

    /** Usage grouped by model with estimated cost from agent_model_price. */
    // Cache-aware cost: cached prompt tokens are billed at the cache unit
    // price (falling back to the full prompt price when unset); sessions count
    // only root runs so delegated children do not inflate the number.
    @Select("SELECT r.model AS modelName, " +
            "SUM(CASE WHEN r.parent_run_id IS NULL THEN 1 ELSE 0 END) AS sessions, " +
            "SUM(r.prompt_tokens) AS promptTokens, SUM(r.completion_tokens) AS completionTokens, " +
            "SUM(r.prompt_tokens + r.completion_tokens) AS totalTokens, " +
            "ROUND(SUM(GREATEST(r.prompt_tokens - r.cached_prompt_tokens, 0)) / 1000 * IFNULL(p.prompt_price, 0) " +
            "  + SUM(r.cached_prompt_tokens) / 1000 * IFNULL(p.cache_prompt_price, IFNULL(p.prompt_price, 0)) " +
            "  + SUM(r.completion_tokens) / 1000 * IFNULL(p.completion_price, 0), 4) AS cost, " +
            "IFNULL(p.currency, 'CNY') AS currency " +
            "FROM agent_run r LEFT JOIN agent_model_price p ON p.model_name = r.model " +
            "WHERE r.create_time >= #{startMs} " +
            "AND (#{tenantId} IS NULL OR r.tenant_id = #{tenantId}) " +
            "GROUP BY r.model, p.prompt_price, p.cache_prompt_price, p.completion_price, p.currency " +
            "ORDER BY totalTokens DESC")
    List<com.knowledge.agent.core.web.vo.UsageStatsVO.ByModel> selectUsageByModel(
            @Param("startMs") long startMs, @Param("tenantId") Long tenantId);

    /** Active rows not updated since the cutoff (stale executor sweep). */
    @Select("SELECT * FROM agent_run WHERE status IN ('RUNNING','QUEUED','WAITING_TOOLS','SUSPENDED') " +
            "AND update_time < #{cutoffMs} ORDER BY update_time ASC LIMIT #{limit}")
    List<AgentRunEntity> selectStaleActive(@Param("cutoffMs") long cutoffMs,
                                           @Param("limit") int limit);
}
