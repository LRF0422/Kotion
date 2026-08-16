package com.knowledge.agent.v3;

/** Minimal durable record owned by the V3 task supervisor. */
public class AgentTaskRecord {
    private String taskId;
    private String conversationId;
    private String sessionId;
    private Long userId;
    private Long tenantId;
    private AgentTaskStatus status;
    private String finishReason;
    private String errorMessage;
    private long lastSeq;
    private String assistantText;
    private long createdAt;
    private long updatedAt;

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }
    public String getConversationId() { return conversationId; }
    public void setConversationId(String conversationId) { this.conversationId = conversationId; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }
    public AgentTaskStatus getStatus() { return status; }
    public void setStatus(AgentTaskStatus status) { this.status = status; }
    public String getFinishReason() { return finishReason; }
    public void setFinishReason(String finishReason) { this.finishReason = finishReason; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public long getLastSeq() { return lastSeq; }
    public void setLastSeq(long lastSeq) { this.lastSeq = lastSeq; }
    public String getAssistantText() { return assistantText; }
    public void setAssistantText(String assistantText) { this.assistantText = assistantText; }
    public long getCreatedAt() { return createdAt; }
    public void setCreatedAt(long createdAt) { this.createdAt = createdAt; }
    public long getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(long updatedAt) { this.updatedAt = updatedAt; }
}
