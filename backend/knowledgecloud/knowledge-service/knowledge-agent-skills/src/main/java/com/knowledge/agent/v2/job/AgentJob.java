package com.knowledge.agent.v2.job;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * An async long-running agent job — the decoupled unit of work behind the task
 * API.
 *
 * <p>Unlike the synchronous {@code /chat} path (where execution lives and dies
 * with one SSE request), a job owns its own lifecycle and event stream so it can
 * run for minutes or hours, pause for frontend tool results, survive client
 * reconnects, and be cancelled independently of any HTTP connection.
 *
 * <p>Mutable status fields are volatile / atomic so the polling and streaming
 * endpoints can read them safely while the engine thread writes.
 */
public class AgentJob {

    private final String taskId;
    private final String sessionId;
    private final String conversationId;
    private final String parentTaskId;
    private final Long userId;
    private final Long tenantId;
    private long createdAt;

    private volatile AgentJobStatus status = AgentJobStatus.QUEUED;
    private volatile String finishReason;
    private volatile String errorMessage;
    private volatile long updatedAt;
    private final AtomicInteger promptTokens = new AtomicInteger(0);
    private final AtomicInteger completionTokens = new AtomicInteger(0);

    /** Highest durably-logged event seq (reconnect checkpoint; cache of the event log). */
    private volatile long lastSeq;

    /** Accumulated assistant output (reconnect reconstruction). */
    private volatile String assistantText;

    public AgentJob(String taskId, String sessionId, String conversationId,
            Long userId, Long tenantId) {
        this(taskId, sessionId, conversationId, userId, tenantId, null);
    }

    public AgentJob(String taskId, String sessionId, String conversationId,
            Long userId, Long tenantId, String parentTaskId) {
        this.taskId = taskId;
        this.sessionId = sessionId;
        this.conversationId = conversationId;
        this.parentTaskId = parentTaskId;
        this.userId = userId;
        this.tenantId = tenantId;
        this.createdAt = System.currentTimeMillis();
        this.updatedAt = this.createdAt;
    }

    public String getTaskId() {
        return taskId;
    }

    public String getSessionId() {
        return sessionId;
    }

    public String getConversationId() {
        return conversationId;
    }

    public String getParentTaskId() {
        return parentTaskId;
    }

    public Long getUserId() {
        return userId;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(long createdAt) {
        if (createdAt > 0) {
            this.createdAt = createdAt;
        }
    }

    public AgentJobStatus getStatus() {
        return status;
    }

    public void setStatus(AgentJobStatus status) {
        this.status = status;
        this.updatedAt = System.currentTimeMillis();
    }

    public String getFinishReason() {
        return finishReason;
    }

    public void setFinishReason(String finishReason) {
        this.finishReason = finishReason;
        this.updatedAt = System.currentTimeMillis();
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
        this.updatedAt = System.currentTimeMillis();
    }

    public long getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(long updatedAt) {
        if (updatedAt > 0) {
            this.updatedAt = updatedAt;
        }
    }

    public int getPromptTokens() {
        return promptTokens.get();
    }

    public int getCompletionTokens() {
        return completionTokens.get();
    }

    public void addUsage(int prompt, int completion) {
        if (prompt > 0) {
            promptTokens.addAndGet(prompt);
        }
        if (completion > 0) {
            completionTokens.addAndGet(completion);
        }
    }

    /**
     * Set the CUMULATIVE usage reported by a session. Sessions are resumed
     * multiple times and the engine always reports totals since session start,
     * so {@link #addUsage} would double-count each suspension.
     */
    public void setUsage(int prompt, int completion) {
        promptTokens.set(Math.max(0, prompt));
        completionTokens.set(Math.max(0, completion));
    }

    public boolean isTerminal() {
        return status.isTerminal();
    }

    public long getLastSeq() {
        return lastSeq;
    }

    public void setLastSeq(long lastSeq) {
        this.lastSeq = lastSeq;
    }

    public String getAssistantText() {
        return assistantText;
    }

    public void setAssistantText(String assistantText) {
        this.assistantText = assistantText;
    }
}
