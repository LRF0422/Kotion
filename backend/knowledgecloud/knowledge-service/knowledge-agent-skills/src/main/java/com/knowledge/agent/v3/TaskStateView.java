package com.knowledge.agent.v3;

import java.util.List;
import java.util.Map;

public class TaskStateView {
    public String taskId;
    public String sessionId;
    public String conversationId;
    public AgentTaskStatus status;
    public String finishReason;
    public String errorMessage;
    public String assistantText;
    public long lastSeq;
    public List<Map<String, Object>> pendingTools;
}
