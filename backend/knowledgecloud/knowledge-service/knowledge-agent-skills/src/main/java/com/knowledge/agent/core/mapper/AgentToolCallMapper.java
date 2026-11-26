package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentToolCallEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * Owner-scoped SQL for {@code agent_tool_call}.
 *
 * <p>Status transitions are conditional so a retry cannot move a terminal call
 * backwards. The unique {@code (run_id, call_id)} key makes the ledger
 * idempotent across client retries.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentToolCallMapper extends BaseMapper<AgentToolCallEntity> {

    @Select("SELECT * FROM agent_tool_call WHERE run_id = #{runId} AND call_id = #{callId} "
            + "AND tenant_id = #{tenantId} AND user_id = #{userId}")
    AgentToolCallEntity selectByRunCall(@Param("tenantId") Long tenantId,
                                       @Param("userId") Long userId,
                                       @Param("runId") String runId,
                                       @Param("callId") String callId);

    @Select("SELECT * FROM agent_tool_call WHERE run_id = #{runId} "
            + "AND tenant_id = #{tenantId} AND user_id = #{userId} "
            + "ORDER BY create_time ASC LIMIT #{limit}")
    List<AgentToolCallEntity> selectByRun(@Param("tenantId") Long tenantId,
                                          @Param("userId") Long userId,
                                          @Param("runId") String runId,
                                          @Param("limit") int limit);

    @Select("SELECT * FROM agent_tool_call WHERE run_id = #{runId} "
            + "AND tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND status = #{status} ORDER BY create_time ASC LIMIT #{limit}")
    List<AgentToolCallEntity> selectByRunStatus(@Param("tenantId") Long tenantId,
                                                @Param("userId") Long userId,
                                                @Param("runId") String runId,
                                                @Param("status") String status,
                                                @Param("limit") int limit);

    @Insert("INSERT INTO agent_tool_call "
            + "(call_id, run_id, conversation_id, tenant_id, user_id, tool_name, args_hash, args_json, "
            + "status, approval_json, approval_expires_at, approval_note, result_json, result_truncated, "
            + "error, idempotency_key, attempt, started_at, finished_at, create_time, update_time) "
            + "VALUES (#{callId}, #{runId}, #{conversationId,jdbcType=VARCHAR}, #{tenantId}, #{userId}, "
            + "#{toolName}, #{argsHash}, #{argsJson,jdbcType=LONGVARCHAR}, #{status}, "
            + "#{approvalJson,jdbcType=LONGVARCHAR}, #{approvalExpiresAt,jdbcType=BIGINT}, "
            + "#{approvalNote,jdbcType=VARCHAR}, #{resultJson,jdbcType=LONGVARCHAR}, #{resultTruncated}, "
            + "#{error,jdbcType=VARCHAR}, #{idempotencyKey}, #{attempt}, "
            + "#{startedAt,jdbcType=BIGINT}, #{finishedAt,jdbcType=BIGINT}, #{createTime}, #{updateTime})")
    int insertCall(AgentToolCallEntity entity);

    /** pending/awaiting -> started. A completed/started row is left alone. */
    @Update("UPDATE agent_tool_call SET status = 'started', "
            + "tool_name = #{toolName}, args_hash = #{argsHash}, args_json = #{argsJson,jdbcType=LONGVARCHAR}, "
            + "idempotency_key = #{idempotencyKey}, attempt = #{attempt}, "
            + "started_at = #{now}, update_time = #{now} "
            + "WHERE run_id = #{runId} AND call_id = #{callId} "
            + "AND tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND status IN ('pending', 'awaiting_approval', 'approved', 'uncertain')")
    int markStarted(@Param("tenantId") Long tenantId,
                    @Param("userId") Long userId,
                    @Param("runId") String runId,
                    @Param("callId") String callId,
                    @Param("toolName") String toolName,
                    @Param("argsHash") String argsHash,
                    @Param("argsJson") String argsJson,
                    @Param("idempotencyKey") String idempotencyKey,
                    @Param("attempt") int attempt,
                    @Param("now") long now);

    /** started/approved -> completed/failed. A completed row keeps its first result. */
    @Update("UPDATE agent_tool_call SET status = #{status}, "
            + "result_json = #{resultJson,jdbcType=LONGVARCHAR}, result_truncated = #{resultTruncated}, "
            + "error = #{error,jdbcType=VARCHAR}, finished_at = #{now}, update_time = #{now} "
            + "WHERE run_id = #{runId} AND call_id = #{callId} "
            + "AND tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND status IN ('pending', 'approved', 'started', 'uncertain', 'awaiting_approval')")
    int markFinished(@Param("tenantId") Long tenantId,
                     @Param("userId") Long userId,
                     @Param("runId") String runId,
                     @Param("callId") String callId,
                     @Param("status") String status,
                     @Param("resultJson") String resultJson,
                     @Param("resultTruncated") int resultTruncated,
                     @Param("error") String error,
                     @Param("now") long now);

    /** started -> uncertain (restart found an execution with no known outcome). */
    @Update("UPDATE agent_tool_call SET status = 'uncertain', update_time = #{now} "
            + "WHERE run_id = #{runId} AND call_id = #{callId} "
            + "AND tenant_id = #{tenantId} AND user_id = #{userId} AND status = 'started'")
    int markUncertain(@Param("tenantId") Long tenantId,
                      @Param("userId") Long userId,
                      @Param("runId") String runId,
                      @Param("callId") String callId,
                      @Param("now") long now);

    @Update("UPDATE agent_tool_call SET status = 'awaiting_approval', "
            + "approval_json = #{approvalJson}, approval_expires_at = #{expiresAt,jdbcType=BIGINT}, "
            + "update_time = #{now} "
            + "WHERE run_id = #{runId} AND call_id = #{callId} "
            + "AND tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND status IN ('pending', 'awaiting_approval')")
    int requestApproval(@Param("tenantId") Long tenantId,
                        @Param("userId") Long userId,
                        @Param("runId") String runId,
                        @Param("callId") String callId,
                        @Param("approvalJson") String approvalJson,
                        @Param("expiresAt") Long expiresAt,
                        @Param("now") long now);

    @Update("UPDATE agent_tool_call SET status = #{status}, "
            + "approval_note = #{note,jdbcType=VARCHAR}, update_time = #{now} "
            + "WHERE run_id = #{runId} AND call_id = #{callId} "
            + "AND tenant_id = #{tenantId} AND user_id = #{userId} AND status = 'awaiting_approval'")
    int decideApproval(@Param("tenantId") Long tenantId,
                       @Param("userId") Long userId,
                       @Param("runId") String runId,
                       @Param("callId") String callId,
                       @Param("status") String status,
                       @Param("note") String note,
                       @Param("now") long now);

    @Select("SELECT COUNT(*) FROM agent_tool_call WHERE run_id = #{runId} "
            + "AND tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND status IN ('pending', 'awaiting_approval', 'approved', 'started', 'uncertain')")
    int countOpen(@Param("tenantId") Long tenantId,
                  @Param("userId") Long userId,
                  @Param("runId") String runId);
}