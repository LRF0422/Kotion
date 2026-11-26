package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * Durable execution ledger for one frontend tool call
 * ({@code agent_tool_call}).
 *
 * <p>The model asks for a tool, the client executes it. This row is the
 * server-side truth for "did it start, did it finish, was it approved" so a
 * restart can decide between re-execute / resubmit / ask the user, instead of
 * silently replaying a side effect.
 */
@Data
@TableName("agent_tool_call")
public class AgentToolCallEntity implements Serializable {

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_AWAITING_APPROVAL = "awaiting_approval";
    public static final String STATUS_APPROVED = "approved";
    public static final String STATUS_REJECTED = "rejected";
    public static final String STATUS_STARTED = "started";
    public static final String STATUS_COMPLETED = "completed";
    public static final String STATUS_FAILED = "failed";
    public static final String STATUS_CANCELLED = "cancelled";
    public static final String STATUS_UNCERTAIN = "uncertain";

    @TableId(type = IdType.AUTO)
    private Long id;

    private String callId;

    private String runId;

    private String conversationId;

    private Long tenantId;

    private Long userId;

    private String toolName;

    /** sha256 of the canonical args; args_json may be omitted for secrets. */
    private String argsHash;

    private String argsJson;

    /** pending | awaiting_approval | approved | rejected | started | completed | failed | cancelled | uncertain */
    private String status;

    private String approvalJson;

    private Long approvalExpiresAt;

    private String approvalNote;

    private String resultJson;

    private Integer resultTruncated;

    private String error;

    private String idempotencyKey;

    private Integer attempt;

    private Long startedAt;

    private Long finishedAt;

    private Long createTime;

    private Long updateTime;
}