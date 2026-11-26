package com.knowledge.agent.core.web.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.bgtask.BgTaskStore;
import com.knowledge.agent.core.entity.AgentBgTaskEntity;
import com.knowledge.agent.core.entity.AgentBgTaskLogEntity;
import lombok.Data;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Request/response payloads for {@code /api/agent/v1/bg-tasks}.
 *
 * <p>Kept as nested types so the wire contract stays in one place. JSON
 * fields are parsed lazily (progress/result/meta/checkpoint) so a row that was
 * written by an older client still renders instead of failing the whole list.
 */
public final class BgTaskDtos {

    private BgTaskDtos() {
    }

    // ==================== requests ====================

    @Data
    public static class CreateRequest {
        private String clientTaskId;
        private String clientId;
        private String kind;
        private String title;
        private String mode;
        private String conversationId;
        private String runId;
        private String pluginKey;
        private String tool;
        private Object progress;
        private Object meta;
        private Integer heartbeatMs;
        private Boolean resumable;
        private String resumePolicy;
    }

    @Data
    public static class UpdateRequest {
        private String leaseToken;
        private Object progress;
        private Object meta;
        private Object checkpoint;
        private String title;
    }

    @Data
    public static class LogsRequest {
        private String leaseToken;
        private String batchId;
        private List<LogEntryRequest> entries;
    }

    @Data
    public static class LogEntryRequest {
        private String kind;
        private String level;
        private String message;
        private Long at;
    }

    @Data
    public static class HeartbeatRequest {
        private String leaseToken;
    }

    @Data
    public static class FinishRequest {
        private String leaseToken;
        private String state;
        private String message;
        private Object result;
        private String error;
    }

    @Data
    public static class AttachRequest {
        private String clientId;
    }

    // ==================== responses ====================

    @Data
    public static class TaskView {
        private String taskId;
        private String clientTaskId;
        private String clientId;
        private String conversationId;
        private String runId;
        private String pluginKey;
        private String tool;
        private String kind;
        private String title;
        private String mode;
        private String state;
        private Object progress;
        private Object result;
        private Boolean resultTruncated;
        private String error;
        private Long createdAt;
        private Long updatedAt;
        private Long finishedAt;
        private Integer attempt;
        private Boolean resumable;
        private String resumePolicy;
        private Long logSeq;
        private Long logFirstSeq;
        private Object meta;
        private Object checkpoint;
        private String hint;

        public static TaskView of(AgentBgTaskEntity task, ObjectMapper mapper, boolean includePrivate) {
            if (task == null) {
                return null;
            }
            TaskView view = new TaskView();
            view.setTaskId(task.getTaskId());
            view.setClientTaskId(task.getClientTaskId());
            view.setClientId(task.getClientId());
            view.setConversationId(task.getConversationId());
            view.setRunId(task.getRunId());
            view.setPluginKey(task.getPluginKey());
            view.setTool(task.getToolName());
            view.setKind(task.getKind());
            view.setTitle(task.getTitle());
            view.setMode(task.getMode());
            view.setState(task.getState());
            view.setProgress(parse(task.getProgressJson(), mapper));
            view.setResult(parse(task.getResultJson(), mapper));
            view.setResultTruncated(task.getResultTruncated() != null && task.getResultTruncated() == 1);
            view.setError(task.getError());
            view.setCreatedAt(task.getCreatedAt());
            view.setUpdatedAt(task.getUpdatedAt());
            view.setFinishedAt(task.getFinishedAt());
            view.setAttempt(task.getAttempt());
            view.setResumable(task.getResumable() != null && task.getResumable() == 1);
            view.setResumePolicy(task.getResumePolicy());
            view.setLogSeq(task.getLogSeq());
            view.setLogFirstSeq(task.getLogFirstSeq());
            if (includePrivate) {
                view.setMeta(parse(task.getMetaJson(), mapper));
                view.setCheckpoint(parse(task.getCheckpointJson(), mapper));
            }
            view.setHint(hintOf(task));
            return view;
        }

        private static String hintOf(AgentBgTaskEntity task) {
            String state = task.getState();
            if ("cancelling".equals(state)) {
                return "取消已请求，等待客户端确认";
            }
            if ("disconnected".equals(state)) {
                boolean resumable = task.getResumable() != null && task.getResumable() == 1;
                return resumable ? "客户端已断开，可恢复" : "客户端已断开";
            }
            return null;
        }
    }

    @Data
    public static class LeaseView {
        private TaskView task;
        private String leaseToken;
        private Integer heartbeatMs;
        private Long leaseExpiresAt;
        private Long lastSeq;

        public static LeaseView of(BgTaskStore.Lease lease, ObjectMapper mapper, boolean includePrivate) {
            LeaseView view = new LeaseView();
            view.setTask(TaskView.of(lease.getTask(), mapper, includePrivate));
            view.setLeaseToken(lease.getLeaseToken());
            view.setHeartbeatMs(lease.getTask() == null ? null : lease.getTask().getHeartbeatMs());
            view.setLeaseExpiresAt(lease.getTask() == null ? null : lease.getTask().getLeaseExpiresAt());
            view.setLastSeq(lease.getTask() == null ? null : lease.getTask().getLogSeq());
            return view;
        }
    }

    @Data
    public static class LogEntryView {
        private Long seq;
        private String kind;
        private String level;
        private String message;
        private Long at;

        public static LogEntryView of(AgentBgTaskLogEntity row) {
            LogEntryView view = new LogEntryView();
            view.setSeq(row.getSeq());
            view.setKind(row.getKind());
            view.setLevel(row.getLevel());
            view.setMessage(row.getMessage());
            view.setAt(row.getAt());
            return view;
        }
    }

    @Data
    public static class LogPageView {
        private List<LogEntryView> entries = Collections.emptyList();
        private long nextSeq;
        private long dropped;
        private long total;

        public static LogPageView of(BgTaskStore.LogPage page) {
            LogPageView view = new LogPageView();
            List<LogEntryView> entries = new ArrayList<LogEntryView>();
            if (page.getEntries() != null) {
                for (AgentBgTaskLogEntity row : page.getEntries()) {
                    if (row != null) {
                        entries.add(LogEntryView.of(row));
                    }
                }
            }
            view.setEntries(entries);
            view.setNextSeq(page.getNextSeq());
            view.setDropped(page.getDropped());
            view.setTotal(page.getTotal());
            return view;
        }
    }

    @Data
    public static class LogAppendView {
        private int added;
        private long nextSeq;
        private long dropped;

        public static LogAppendView of(BgTaskStore.LogAppend append) {
            LogAppendView view = new LogAppendView();
            view.setAdded(append.getAdded());
            view.setNextSeq(append.getNextSeq());
            view.setDropped(append.getDropped());
            return view;
        }
    }

    @Data
    public static class HeartbeatView {
        private String taskId;
        private String state;
        private boolean cancelRequested;
        private Long leaseExpiresAt;
        private Long logSeq;

        public static HeartbeatView of(BgTaskStore.Heartbeat heartbeat) {
            HeartbeatView view = new HeartbeatView();
            AgentBgTaskEntity task = heartbeat.getTask();
            view.setTaskId(task == null ? null : task.getTaskId());
            view.setState(task == null ? null : task.getState());
            view.setCancelRequested(heartbeat.isCancelRequested());
            view.setLeaseExpiresAt(task == null ? null : task.getLeaseExpiresAt());
            view.setLogSeq(task == null ? null : task.getLogSeq());
            return view;
        }
    }

    @Data
    public static class ListView {
        private int count;
        private List<TaskView> tasks = Collections.emptyList();
    }

    private static Object parse(String json, ObjectMapper mapper) {
        if (json == null || json.trim().isEmpty()) {
            return null;
        }
        try {
            return mapper.readValue(json, Object.class);
        } catch (Exception e) {
            // A row written by an older/incompatible client must not break the list.
            return json;
        }
    }
}