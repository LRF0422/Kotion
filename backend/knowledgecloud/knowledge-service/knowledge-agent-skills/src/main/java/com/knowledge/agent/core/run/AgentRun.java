package com.knowledge.agent.core.run;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * AgentCore run — one agent execution unit ("用户输入 → 多轮 think/act/observe → 终态").
 *
 * <p>This is the hot, serializable run state (Redis {@code agent:run:hot:{runId}},
 * MySQL {@code agent_run} mirror). Execution state that must survive a crash
 * (messages, scratchpad, pending tools) lives in the {@code Checkpoint}; this
 * class carries lifecycle, accounting and UI-facing state.
 */
@Data
public class AgentRun {

    /** Run id (UUID). */
    private String runId;

    /** Conversation/thread id. */
    private String conversationId;

    /** Parent run id for sub-agent delegation. */
    private String parentRunId;

    private Long userId;

    private Long tenantId;

    /** Caller JWT token (hot state only — not mirrored to JDBC). */
    private String token;

    private String model;

    /** execute | plan */
    private String mode = "execute";

    /** Editor space scope (memory scoping). */
    private String spaceId;

    /** Editor page scope (memory scoping). */
    private String pageId;

    private String status = RunStatus.QUEUED.name();

    private String finishReason;

    /** plan_approval | budget (when SUSPENDED). */
    private String suspendReason;

    private String errorCode;

    private String errorMessage;

    /** Highest durably-logged event seq. */
    private long lastSeq;

    private long promptTokens;

    private long completionTokens;

    /** Accumulated assistant output (reconnect reconstruction). */
    private String assistantText;

    /** Pending frontend tool calls (non-empty while WAITING_TOOLS). */
    private List<PendingToolCall> pendingToolCalls = new ArrayList<>();

    /** Plan mode gate: opens after plan approval. */
    private boolean planGateOpen;

    /** The step number about to run next (recovery hint). */
    private int nextStep;

    private long createTime;

    private long updateTime;

    public static AgentRun create(String runId, String conversationId, Long userId, Long tenantId,
                                  String model, String mode, long now) {
        AgentRun run = new AgentRun();
        run.setRunId(runId);
        run.setConversationId(conversationId);
        run.setUserId(userId);
        run.setTenantId(tenantId);
        run.setModel(model);
        run.setMode(mode == null || mode.isEmpty() ? "execute" : mode);
        run.setStatus(RunStatus.QUEUED.name());
        run.setPlanGateOpen(!"plan".equalsIgnoreCase(run.getMode()));
        run.setCreateTime(now);
        run.setUpdateTime(now);
        return run;
    }

    public RunStatus statusEnum() {
        try {
            return RunStatus.valueOf(status);
        } catch (Exception e) {
            return RunStatus.QUEUED;
        }
    }

    public void touch() {
        this.updateTime = System.currentTimeMillis();
    }
}
