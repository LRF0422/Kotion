package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * Durable background task record ({@code agent_bg_task}).
 *
 * <p>Client executes; server stores. The row is the source of truth for state,
 * progress, result, checkpoint and the lease. Logs live in
 * {@code agent_bg_task_log}; watch subscriptions and the note outbox are
 * separate tables.
 */
@Data
@TableName("agent_bg_task")
public class AgentBgTaskEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** Server task id ({@code bt_ + uuid}). */
    private String taskId;

    /** Client idempotency key: retrying create must not create a second task. */
    private String clientTaskId;

    /** Client install id that can attach/resume this task. */
    private String clientId;

    private Long tenantId;

    private Long userId;

    /** Conversation task; null for plugin-level tasks. */
    private String conversationId;

    /** Run that started it (audit only). */
    private String runId;

    /** Plugin key (metadata, not identity). */
    private String pluginKey;

    private String toolName;

    private String kind;

    private String title;

    /** {@code job} or {@code watch}. */
    private String mode;

    /** running | cancelling | disconnected | succeeded | failed | cancelled. */
    private String state;

    /** Serialized TaskProgress. */
    private String progressJson;

    /** Serialized result; capped by the store. */
    private String resultJson;

    /** 1 when the result was truncated by the store. */
    private Integer resultTruncated;

    private String error;

    /** Serialized plugin metadata; capped by the store. */
    private String metaJson;

    /** Serialized plugin resume checkpoint; capped by the store. */
    private String checkpointJson;

    /** 1 when the plugin registered a resume handler. */
    private Integer resumable;

    /** never | manual | auto. */
    private String resumePolicy;

    /** Execution attempt; incremented on attach. */
    private Integer attempt;

    /** Client heartbeat interval in ms (lease TTL = multiplier * this). */
    private Integer heartbeatMs;

    /** sha256 of the current lease token; the raw token is never stored. */
    private String leaseTokenHash;

    private Long leaseExpiresAt;

    private Long lastHeartbeatAt;

    /** 1 after cancel was requested. */
    private Integer cancelRequested;

    /** Force-cancel after this instant (client did not acknowledge). */
    private Long cancelDeadline;

    /** Set when the agent has been shown the terminal result. */
    private Long consumedAt;

    /** Highest allocated log seq. */
    private Long logSeq;

    /** Lowest retained log seq (0 = nothing dropped yet). */
    private Long logFirstSeq;

    private Long createdAt;

    private Long updatedAt;

    private Long finishedAt;
}