package com.knowledge.agent.store.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.store.entity.AgentTaskEntity;
import org.apache.ibatis.annotations.Insert;

/**
 * MyBatis-Plus mapper for {@link AgentTaskEntity}.
 *
 * <p>Bypasses the tenant-line interceptor (tasks are already tenant-scoped in
 * the service layer) and upserts atomically by {@code task_id}.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentTaskMapper extends BaseMapper<AgentTaskEntity> {

    @Insert("INSERT INTO agent_task " +
            "(task_id, session_id, conversation_id, user_id, tenant_id, status, finish_reason, " +
            "prompt_tokens, completion_tokens, total_tokens, error_message, last_seq, assistant_text, " +
            "create_time, update_time) " +
            "VALUES (#{taskId}, #{sessionId}, #{conversationId}, #{userId}, #{tenantId}, #{status}, #{finishReason}, " +
            "#{promptTokens}, #{completionTokens}, #{totalTokens}, #{errorMessage}, #{lastSeq}, #{assistantText}, " +
            "#{createTime}, #{updateTime}) " +
            "ON DUPLICATE KEY UPDATE " +
            "session_id = VALUES(session_id), " +
            "conversation_id = VALUES(conversation_id), " +
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
}
