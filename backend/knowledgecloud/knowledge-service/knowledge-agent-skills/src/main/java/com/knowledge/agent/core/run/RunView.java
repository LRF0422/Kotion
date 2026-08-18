package com.knowledge.agent.core.run;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * API-facing run state view (JSON contract, never leaks internal handles).
 */
@Data
public class RunView {

    private String runId;

    private String conversationId;

    private String parentRunId;

    private String model;

    private String mode;

    private String spaceId;

    private String pageId;

    private String status;

    private String finishReason;

    private String suspendReason;

    private String errorCode;

    private String errorMessage;

    private long lastSeq;

    private long promptTokens;

    private long completionTokens;

    /** Prompt tokens served from the provider's context cache (cache-hit signal). */
    private long cachedPromptTokens;

    /** Accumulated assistant output (reconnect reconstruction). */
    private String assistantText;

    /** Pending frontend tool calls (when WAITING_TOOLS). */
    private List<PendingToolCall> pendingTools = new ArrayList<>();

    private long createTime;

    private long updateTime;

    public static RunView of(AgentRun run) {
        RunView view = new RunView();
        view.setRunId(run.getRunId());
        view.setConversationId(run.getConversationId());
        view.setParentRunId(run.getParentRunId());
        view.setModel(run.getModel());
        view.setMode(run.getMode());
        view.setSpaceId(run.getSpaceId());
        view.setPageId(run.getPageId());
        view.setStatus(run.getStatus());
        view.setFinishReason(run.getFinishReason());
        view.setSuspendReason(run.getSuspendReason());
        view.setErrorCode(run.getErrorCode());
        view.setErrorMessage(run.getErrorMessage());
        view.setLastSeq(run.getLastSeq());
        view.setPromptTokens(run.getPromptTokens());
        view.setCompletionTokens(run.getCompletionTokens());
        view.setCachedPromptTokens(run.getCachedPromptTokens());
        view.setAssistantText(run.getAssistantText());
        if (run.getPendingToolCalls() != null) {
            view.getPendingTools().addAll(run.getPendingToolCalls());
        }
        view.setCreateTime(run.getCreateTime());
        view.setUpdateTime(run.getUpdateTime());
        return view;
    }
}
