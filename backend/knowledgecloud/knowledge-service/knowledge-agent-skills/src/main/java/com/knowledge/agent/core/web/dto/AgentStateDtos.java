package com.knowledge.agent.core.web.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.entity.AgentFormRequestEntity;
import com.knowledge.agent.core.entity.AgentRunEntity;
import com.knowledge.agent.core.entity.AgentToolCallEntity;
import lombok.Data;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Wire contract for runtime-state persistence:
 * tool-call ledger, approvals, forms and active-run discovery.
 */
public final class AgentStateDtos {

    private AgentStateDtos() {
    }

    // ==================== tool calls ====================

    @Data
    public static class ToolStartedRequest {
        private String toolName;
        private String argsHash;
        private Object args;
        private String idempotencyKey;
    }

    @Data
    public static class ToolCompletedRequest {
        private Boolean ok;
        private Object result;
        private String error;
    }

    @Data
    public static class ToolApprovalRequest {
        private String toolName;
        private String argsHash;
        private Object request;
        private Long timeoutMs;
    }

    @Data
    public static class ToolDecisionRequest {
        private Boolean allowed;
        private String note;
    }

    @Data
    public static class ToolCallView {
        private String callId;
        private String runId;
        private String conversationId;
        private String toolName;
        private String status;
        private String argsHash;
        private Object args;
        private Object approval;
        private Long approvalExpiresAt;
        private String approvalNote;
        private Object result;
        private Boolean resultTruncated;
        private String error;
        private String idempotencyKey;
        private Integer attempt;
        private Long startedAt;
        private Long finishedAt;
        private Long createdAt;

        public static ToolCallView of(AgentToolCallEntity entity, ObjectMapper mapper, boolean includePayloads) {
            if (entity == null) {
                return null;
            }
            ToolCallView view = new ToolCallView();
            view.setCallId(entity.getCallId());
            view.setRunId(entity.getRunId());
            view.setConversationId(entity.getConversationId());
            view.setToolName(entity.getToolName());
            view.setStatus(entity.getStatus());
            view.setArgsHash(entity.getArgsHash());
            if (includePayloads) {
                view.setArgs(parse(entity.getArgsJson(), mapper));
                view.setResult(parse(entity.getResultJson(), mapper));
            }
            view.setApproval(parse(entity.getApprovalJson(), mapper));
            view.setApprovalExpiresAt(entity.getApprovalExpiresAt());
            view.setApprovalNote(entity.getApprovalNote());
            view.setResultTruncated(entity.getResultTruncated() != null && entity.getResultTruncated() == 1);
            view.setError(entity.getError());
            view.setIdempotencyKey(entity.getIdempotencyKey());
            view.setAttempt(entity.getAttempt());
            view.setStartedAt(entity.getStartedAt());
            view.setFinishedAt(entity.getFinishedAt());
            view.setCreatedAt(entity.getCreateTime());
            return view;
        }
    }

    @Data
    public static class ToolCallListView {
        private int count;
        private List<ToolCallView> calls = Collections.emptyList();
    }

    // ==================== forms ====================

    @Data
    public static class FormCreateRequest {
        private String conversationId;
        private String runId;
        private String callId;
        private String title;
        private Object schema;
        private Long expiresAt;
    }

    @Data
    public static class FormAnswerRequest {
        private Object values;
        private Object rows;
    }

    @Data
    public static class FormCancelRequest {
        private String reason;
    }

    @Data
    public static class FormView {
        private String formId;
        private String conversationId;
        private String runId;
        private String callId;
        private String title;
        private Object schema;
        private String status;
        private Object values;
        private Object rows;
        private String cancelReason;
        private Long createdAt;
        private Long answeredAt;
        private Long deliveredAt;
        private Long expiresAt;

        public static FormView of(AgentFormRequestEntity entity, ObjectMapper mapper) {
            if (entity == null) {
                return null;
            }
            FormView view = new FormView();
            view.setFormId(entity.getFormId());
            view.setConversationId(entity.getConversationId());
            view.setRunId(entity.getRunId());
            view.setCallId(entity.getCallId());
            view.setTitle(entity.getTitle());
            view.setSchema(parse(entity.getSchemaJson(), mapper));
            view.setStatus(entity.getStatus());
            view.setValues(parse(entity.getValuesJson(), mapper));
            view.setRows(parse(entity.getRowsJson(), mapper));
            view.setCancelReason(entity.getCancelReason());
            view.setCreatedAt(entity.getCreatedAt());
            view.setAnsweredAt(entity.getAnsweredAt());
            view.setDeliveredAt(entity.getDeliveredAt());
            view.setExpiresAt(entity.getExpiresAt());
            return view;
        }
    }

    @Data
    public static class FormListView {
        private int count;
        private List<FormView> forms = Collections.emptyList();
    }

    // ==================== active runs ====================

    @Data
    public static class ActiveRunView {
        private String runId;
        private String conversationId;
        private String status;
        private String suspendReason;
        private Long lastSeq;
        private Long updatedAt;
        private Long createdAt;

        public static ActiveRunView of(AgentRunEntity entity) {
            if (entity == null) {
                return null;
            }
            ActiveRunView view = new ActiveRunView();
            view.setRunId(entity.getRunId());
            view.setConversationId(entity.getConversationId());
            view.setStatus(entity.getStatus());
            view.setSuspendReason(entity.getSuspendReason());
            view.setLastSeq(entity.getLastSeq());
            view.setUpdatedAt(entity.getUpdateTime());
            view.setCreatedAt(entity.getCreateTime());
            return view;
        }
    }

    @Data
    public static class ActiveRunListView {
        private int count;
        private List<ActiveRunView> runs = Collections.emptyList();
    }

    // ==================== helpers ====================

    private static Object parse(String json, ObjectMapper mapper) {
        if (json == null || json.trim().isEmpty()) {
            return null;
        }
        try {
            return mapper.readValue(json, Object.class);
        } catch (Exception e) {
            return json;
        }
    }

    public static List<ToolCallView> toolCalls(List<AgentToolCallEntity> rows, ObjectMapper mapper,
                                               boolean includePayloads) {
        List<ToolCallView> views = new ArrayList<ToolCallView>();
        if (rows != null) {
            for (AgentToolCallEntity row : rows) {
                if (row != null) {
                    views.add(ToolCallView.of(row, mapper, includePayloads));
                }
            }
        }
        return views;
    }

    public static List<FormView> forms(List<AgentFormRequestEntity> rows, ObjectMapper mapper) {
        List<FormView> views = new ArrayList<FormView>();
        if (rows != null) {
            for (AgentFormRequestEntity row : rows) {
                if (row != null) {
                    views.add(FormView.of(row, mapper));
                }
            }
        }
        return views;
    }

    public static List<ActiveRunView> activeRuns(List<AgentRunEntity> rows) {
        List<ActiveRunView> views = new ArrayList<ActiveRunView>();
        if (rows != null) {
            for (AgentRunEntity row : rows) {
                if (row != null) {
                    views.add(ActiveRunView.of(row));
                }
            }
        }
        return views;
    }
}