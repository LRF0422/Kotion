package com.knowledge.agent.store.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.store.entity.AgentStateSnapshotEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * MyBatis-Plus mapper for {@link AgentStateSnapshotEntity}.
 *
 * <p>
 * Annotated with {@link InterceptorIgnore} to bypass the tenant line
 * interceptor — agent state snapshots are global and have no
 * {@code tenant_id} column.
 *
 * <p>
 * The {@code @MapperScan("com.knowledge.**.mapper.**")} in
 * {@code MybatisPlusConfiguration} will automatically register this mapper.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentStateSnapshotMapper extends BaseMapper<AgentStateSnapshotEntity> {

    /**
     * Select the most recent snapshot row for a conversation, ordered by
     * timestamp descending.
     *
     * @param conversationId the conversation ID
     * @return the latest entity row, or {@code null} if none exists
     */
    @Select("SELECT * FROM agent_state_snapshot WHERE conversation_id = #{conversationId} " +
            "ORDER BY timestamp DESC LIMIT 1")
    AgentStateSnapshotEntity selectLatestByConversationId(@Param("conversationId") String conversationId);

    /**
     * Atomic upsert by {@code session_id} (unique key). Uses MySQL's
     * {@code INSERT ... ON DUPLICATE KEY UPDATE} to eliminate the race
     * condition inherent in a check-then-act (select → insert/update) sequence.
     *
     * @param entity the snapshot entity to insert or update
     */
    @Insert("INSERT INTO agent_state_snapshot " +
            "(session_id, conversation_id, agent_id, parent_agent_id, depth, " +
            "iteration, snapshot, timestamp) " +
            "VALUES (#{sessionId}, #{conversationId}, #{agentId}, #{parentAgentId}, " +
            "#{depth}, #{iteration}, #{snapshot}, #{timestamp}) " +
            "ON DUPLICATE KEY UPDATE " +
            "conversation_id = VALUES(conversation_id), " +
            "agent_id = VALUES(agent_id), " +
            "parent_agent_id = VALUES(parent_agent_id), " +
            "depth = VALUES(depth), " +
            "iteration = VALUES(iteration), " +
            "snapshot = VALUES(snapshot), " +
            "timestamp = VALUES(timestamp)")
    void upsertBySessionId(AgentStateSnapshotEntity entity);
}
