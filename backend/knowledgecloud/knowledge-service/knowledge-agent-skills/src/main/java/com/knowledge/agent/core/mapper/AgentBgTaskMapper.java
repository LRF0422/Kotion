package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentBgTaskEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * Owner-scoped SQL for {@code agent_bg_task}.
 *
 * <p>Every public read filters by {@code (tenant_id, user_id)}; lease-token
 * checks are done in {@code BgTaskStore} after the row is loaded. Writes that
 * must be race-safe use conditional {@code UPDATE ... WHERE state = ...}.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentBgTaskMapper extends BaseMapper<AgentBgTaskEntity> {

    @Select("SELECT * FROM agent_bg_task "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND task_id = #{taskId}")
    AgentBgTaskEntity selectByOwner(@Param("tenantId") Long tenantId,
                                    @Param("userId") Long userId,
                                    @Param("taskId") String taskId);

    @Select("SELECT * FROM agent_bg_task "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND client_task_id = #{clientTaskId}")
    AgentBgTaskEntity selectByClientTaskId(@Param("tenantId") Long tenantId,
                                           @Param("userId") Long userId,
                                           @Param("clientTaskId") String clientTaskId);

    /** Lock one task row for log-sequence allocation (caller holds the lease). */
    @Select("SELECT * FROM agent_bg_task WHERE task_id = #{taskId} FOR UPDATE")
    AgentBgTaskEntity lockByTaskId(@Param("taskId") String taskId);

    @Insert("INSERT INTO agent_bg_task (task_id, client_task_id, client_id, tenant_id, user_id, "
            + "conversation_id, run_id, plugin_key, tool_name, kind, title, mode, state, "
            + "progress_json, result_truncated, resumable, resume_policy, attempt, heartbeat_ms, "
            + "lease_token_hash, lease_expires_at, last_heartbeat_at, cancel_requested, "
            + "log_seq, log_first_seq, created_at, updated_at) "
            + "VALUES (#{taskId}, #{clientTaskId}, #{clientId,jdbcType=VARCHAR}, #{tenantId}, #{userId}, "
            + "#{conversationId,jdbcType=VARCHAR}, #{runId,jdbcType=VARCHAR}, "
            + "#{pluginKey,jdbcType=VARCHAR}, #{toolName,jdbcType=VARCHAR}, #{kind}, #{title}, #{mode}, #{state}, "
            + "#{progressJson,jdbcType=LONGVARCHAR}, #{resultTruncated}, #{resumable}, #{resumePolicy}, "
            + "#{attempt}, #{heartbeatMs}, "
            + "#{leaseTokenHash,jdbcType=VARCHAR}, #{leaseExpiresAt,jdbcType=BIGINT}, "
            + "#{lastHeartbeatAt,jdbcType=BIGINT}, #{cancelRequested}, "
            + "#{logSeq}, #{logFirstSeq}, #{createdAt}, #{updatedAt})")
    int insertTask(AgentBgTaskEntity entity);

    /** Refresh the lease and the runner attempt (create / attach / resume). */
    @Update("UPDATE agent_bg_task SET state = #{state}, attempt = #{attempt}, "
            + "lease_token_hash = #{leaseTokenHash}, lease_expires_at = #{leaseExpiresAt}, "
            + "last_heartbeat_at = #{lastHeartbeatAt}, cancel_requested = #{cancelRequested}, "
            + "cancel_deadline = #{cancelDeadline,jdbcType=BIGINT}, updated_at = #{updatedAt} "
            + "WHERE task_id = #{taskId} AND tenant_id = #{tenantId} AND user_id = #{userId}")
    int updateLease(AgentBgTaskEntity entity);

    /** Update only the fields the client described; null means "leave it". */
    @Update("<script>"
            + "UPDATE agent_bg_task SET updated_at = #{now}"
            + "<if test='title != null'>, title = #{title}</if>"
            + "<if test='progressJson != null'>, progress_json = #{progressJson}</if>"
            + "<if test='metaJson != null'>, meta_json = #{metaJson}</if>"
            + "<if test='checkpointJson != null'>, checkpoint_json = #{checkpointJson}</if>"
            + " WHERE task_id = #{taskId} AND tenant_id = #{tenantId} AND user_id = #{userId}"
            + "</script>")
    int updateMutable(@Param("taskId") String taskId,
                      @Param("tenantId") Long tenantId,
                      @Param("userId") Long userId,
                      @Param("title") String title,
                      @Param("progressJson") String progressJson,
                      @Param("metaJson") String metaJson,
                      @Param("checkpointJson") String checkpointJson,
                      @Param("now") long now);

    @Update("UPDATE agent_bg_task SET log_seq = #{logSeq}, updated_at = #{now} "
            + "WHERE task_id = #{taskId}")
    int updateLogSeq(@Param("taskId") String taskId,
                     @Param("logSeq") long logSeq,
                     @Param("now") long now);

    @Update("UPDATE agent_bg_task SET log_first_seq = #{firstSeq}, updated_at = #{now} "
            + "WHERE task_id = #{taskId}")
    int updateLogFirstSeq(@Param("taskId") String taskId,
                          @Param("firstSeq") long firstSeq,
                          @Param("now") long now);

    @Update("UPDATE agent_bg_task SET last_heartbeat_at = #{now}, lease_expires_at = #{expiresAt}, "
            + "updated_at = #{now} "
            + "WHERE task_id = #{taskId} AND lease_token_hash = #{leaseHash}")
    int touchLease(@Param("taskId") String taskId,
                   @Param("leaseHash") String leaseHash,
                   @Param("now") long now,
                   @Param("expiresAt") long expiresAt);

    /**
     * Move to a terminal state. The {@code WHERE} guard makes a second finish a
     * no-op instead of overwriting the first result.
     */
    @Update("UPDATE agent_bg_task SET state = #{state}, "
            + "result_json = #{resultJson,jdbcType=LONGVARCHAR}, "
            + "result_truncated = #{resultTruncated}, "
            + "error = #{error,jdbcType=VARCHAR}, finished_at = #{now}, updated_at = #{now}, "
            + "last_heartbeat_at = #{now}, lease_token_hash = NULL, lease_expires_at = NULL "
            + "WHERE task_id = #{taskId} AND state NOT IN ('succeeded', 'failed', 'cancelled')")
    int finish(@Param("taskId") String taskId,
               @Param("state") String state,
               @Param("resultJson") String resultJson,
               @Param("resultTruncated") int resultTruncated,
               @Param("error") String error,
               @Param("now") long now);

    /** Request cancellation on a live task; the client sees it on its next heartbeat. */
    @Update("UPDATE agent_bg_task SET state = 'cancelling', cancel_requested = 1, "
            + "cancel_deadline = #{deadline}, updated_at = #{now} "
            + "WHERE task_id = #{taskId} AND state = 'running'")
    int requestCancel(@Param("taskId") String taskId,
                      @Param("deadline") long deadline,
                      @Param("now") long now);

    /** A disconnected task has no executor left: cancel immediately. */
    @Update("UPDATE agent_bg_task SET state = 'cancelled', cancel_requested = 1, "
            + "finished_at = #{now}, updated_at = #{now}, "
            + "lease_token_hash = NULL, lease_expires_at = NULL "
            + "WHERE task_id = #{taskId} AND state = 'disconnected'")
    int cancelDisconnected(@Param("taskId") String taskId, @Param("now") long now);

    /** A cancelling task the client never acknowledged: force it closed. */
    @Update("UPDATE agent_bg_task SET state = 'cancelled', "
            + "error = COALESCE(error, '客户端未确认取消'), finished_at = #{now}, updated_at = #{now}, "
            + "lease_token_hash = NULL, lease_expires_at = NULL "
            + "WHERE task_id = #{taskId} AND state = 'cancelling' "
            + "AND cancel_deadline IS NOT NULL AND cancel_deadline < #{now}")
    int cancelExpired(@Param("taskId") String taskId, @Param("now") long now);

    /** Lease expired: the executor is gone, but external work may still run. */
    @Update("UPDATE agent_bg_task SET state = 'disconnected', updated_at = #{now}, "
            + "lease_token_hash = NULL, lease_expires_at = NULL "
            + "WHERE task_id = #{taskId} AND state = 'running' "
            + "AND lease_expires_at IS NOT NULL AND lease_expires_at < #{now}")
    int markDisconnected(@Param("taskId") String taskId, @Param("now") long now);

    @Select("SELECT * FROM agent_bg_task WHERE state = 'running' "
            + "AND lease_expires_at IS NOT NULL AND lease_expires_at < #{now} "
            + "ORDER BY lease_expires_at ASC LIMIT #{limit}")
    List<AgentBgTaskEntity> selectExpiredRunning(@Param("now") long now,
                                                  @Param("limit") int limit);

    @Select("SELECT * FROM agent_bg_task WHERE state = 'cancelling' "
            + "AND cancel_deadline IS NOT NULL AND cancel_deadline < #{now} "
            + "ORDER BY cancel_deadline ASC LIMIT #{limit}")
    List<AgentBgTaskEntity> selectExpiredCancelling(@Param("now") long now,
                                                     @Param("limit") int limit);

    @Select("<script>"
            + "SELECT * FROM agent_bg_task "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} "
            + "<if test='state != null and state != \"\"'>AND state = #{state} </if>"
            + "<if test='conversationId != null and conversationId != \"\"'>"
            + "AND conversation_id = #{conversationId} </if>"
            + "<if test='pluginKey != null and pluginKey != \"\"'>AND plugin_key = #{pluginKey} </if>"
            + "<if test='clientId != null and clientId != \"\"'>AND client_id = #{clientId} </if>"
            + "ORDER BY updated_at DESC, id DESC LIMIT #{limit}"
            + "</script>")
    List<AgentBgTaskEntity> selectByOwnerList(@Param("tenantId") Long tenantId,
                                              @Param("userId") Long userId,
                                              @Param("state") String state,
                                              @Param("conversationId") String conversationId,
                                              @Param("pluginKey") String pluginKey,
                                              @Param("clientId") String clientId,
                                              @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM agent_bg_task "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND state IN ('running', 'cancelling')")
    int countActive(@Param("tenantId") Long tenantId, @Param("userId") Long userId);

    @Select("SELECT COUNT(*) FROM agent_bg_task "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId}")
    int countAll(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
}