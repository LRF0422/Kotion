package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for the {@code agent_run} table — a durable mirror of one
 * agent run. Redis ({@code agent:run:hot:{runId}}) is the primary read/write
 * path; this table is the cold fallback and the cross-restart quota signal.
 * Timestamps are epoch millis.
 */
@Data
@TableName("agent_run")
public class AgentRunEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** Run id (UUID). */
    private String runId;

    /** Conversation/thread id. */
    private String conversationId;

    /** Parent run id for sub-agent delegation. */
    private String parentRunId;

    private Long userId;

    private Long tenantId;

    private String model;

    /** execute | plan */
    private String mode;

    /** Editor space scope (memory scoping). */
    private String spaceId;

    /** Editor page scope (memory scoping). */
    private String pageId;

    /** QUEUED|RUNNING|WAITING_TOOLS|SUSPENDED|COMPLETED|FAILED|CANCELLED */
    private String status;

    private String finishReason;

    /** plan_approval | budget (when SUSPENDED). */
    private String suspendReason;

    private String errorCode;

    private String errorMessage;

    /** Highest durably-logged event seq. */
    private Long lastSeq;

    private Integer promptTokens;

    private Integer completionTokens;

    private Long createTime;

    private Long updateTime;
}
