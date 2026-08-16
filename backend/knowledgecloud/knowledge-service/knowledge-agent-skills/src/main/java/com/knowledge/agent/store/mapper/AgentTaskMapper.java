package com.knowledge.agent.store.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.store.entity.AgentTaskEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * MyBatis-Plus mapper for {@link AgentTaskEntity}.
 *
 * <p>Bypasses the tenant-line interceptor (tasks are already tenant-scoped in
 * the service layer) and upserts atomically by {@code task_id}.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentTaskMapper extends BaseMapper<AgentTaskEntity> {

    @Insert("INSERT INTO agent_task " +
            "(task_id, session_id, conversation_id, parent_task_id, user_id, tenant_id, status, finish_reason, " +
            "prompt_tokens, completion_tokens, total_tokens, error_message, last_seq, assistant_text, " +
            "create_time, update_time) " +
            "VALUES (#{taskId}, #{sessionId}, #{conversationId}, #{parentTaskId}, #{userId}, #{tenantId}, #{status}, #{finishReason}, " +
            "#{promptTokens}, #{completionTokens}, #{totalTokens}, #{errorMessage}, #{lastSeq}, #{assistantText}, " +
            "#{createTime}, #{updateTime}) " +
            "ON DUPLICATE KEY UPDATE " +
            "session_id = VALUES(session_id), " +
            "conversation_id = VALUES(conversation_id), " +
            "parent_task_id = VALUES(parent_task_id), " +
            "status = VALUES(status), " +
            "finish_reason = VALUES(finish_reason), " +
            "prompt_tokens = VALUES(prompt_tokens), " +
            "completion_tokens = VALUES(completion_tokens), " +
            "total_tokens = VALUES(total_tokens), " +
            "error_message = VALUES(error_message), " +
            "last_seq = VALUES(last_seq), " +
            "assistant_text = VALUES(assistant_text), " +
            "update_time = VALUES(update_time)")
    void upsertByTaskId(AgentTaskEntity entity);

    /**
     * Active (non-terminal) task count for a tenant — the cross-restart
     * concurrency quota signal.
     */
    @Select("SELECT COUNT(*) FROM agent_task WHERE tenant_id = #{tenantId} " +
            "AND status IN ('QUEUED','RUNNING','SUSPENDED','WAITING_TOOLS')")
    long countActiveByTenant(@Param("tenantId") Long tenantId);

    /** RUNNING/QUEUED rows older than the cutoff (stale executor sweep). */
    @Select("SELECT * FROM agent_task WHERE tenant_id = #{tenantId} " +
            "AND status IN ('RUNNING','QUEUED') AND update_time < #{cutoffMs} " +
            "ORDER BY update_time ASC LIMIT #{limit}")
    List<AgentTaskEntity> selectStaleRunning(@Param("tenantId") Long tenantId,
                                              @Param("cutoffMs") long cutoffMs,
                                              @Param("limit") int limit);

    /** Most recent task for a session (legacy session-based resume). */
    @Select("SELECT * FROM agent_task WHERE session_id = #{sessionId} " +
            "ORDER BY create_time DESC LIMIT 1")
    AgentTaskEntity selectLatestBySessionId(@Param("sessionId") String sessionId);
}
