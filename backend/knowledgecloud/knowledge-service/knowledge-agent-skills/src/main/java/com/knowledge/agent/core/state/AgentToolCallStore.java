package com.knowledge.agent.core.state;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.entity.AgentRunEntity;
import com.knowledge.agent.core.entity.AgentToolCallEntity;
import com.knowledge.agent.core.mapper.AgentRunMapper;
import com.knowledge.agent.core.mapper.AgentToolCallMapper;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.function.LongSupplier;

/**
 * Server-side ledger for frontend tool calls.
 *
 * <p>Protocol: {@code started} before the side effect, {@code completed} after.
 * A restart can thus distinguish "never ran" (safe to run) from "ran but the
 * result never arrived" ({@code started}/{@code uncertain}) and require an
 * explicit user decision instead of silently replaying the side effect.
 *
 * <p>Approvals live on the same row: {@code awaiting_approval -> approved /
 * rejected}, so a restart does not ask the same question twice.
 */
@Component
public class AgentToolCallStore {

    /** Cap for the ledger's result snapshot; the run still gets the full result. */
    public static final int MAX_RESULT_BYTES = 16 * 1024;
    public static final int MAX_ARGS_BYTES = 32 * 1024;
    public static final int MAX_APPROVAL_BYTES = 16 * 1024;
    public static final int MAX_ERROR_CHARS = 4000;

    private final AgentToolCallMapper mapper;
    private final AgentRunMapper runMapper;
    private final ObjectMapper objectMapper;
    private final LongSupplier clock;

    @Autowired
    public AgentToolCallStore(AgentToolCallMapper mapper, AgentRunMapper runMapper,
                              ObjectMapper objectMapper) {
        this(mapper, runMapper, objectMapper, new LongSupplier() {
            @Override
            public long getAsLong() {
                return System.currentTimeMillis();
            }
        });
    }

    /** Test seam. */
    AgentToolCallStore(AgentToolCallMapper mapper, AgentRunMapper runMapper,
                       ObjectMapper objectMapper, LongSupplier clock) {
        this.mapper = mapper;
        this.runMapper = runMapper;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
        this.clock = clock != null ? clock : new LongSupplier() {
            @Override
            public long getAsLong() {
                return System.currentTimeMillis();
            }
        };
    }

    /**
     * Record the intent before executing. Idempotent: a completed call is
     * returned unchanged; a repeated started call increments the attempt.
     */
    @Transactional(rollbackFor = Exception.class)
    public AgentToolCallEntity started(long tenantId, long userId, String runId, String callId,
                                       StartedCommand cmd) {
        AgentRunEntity run = requireRun(tenantId, userId, runId);
        String call = requireText(callId, 64, "callId");
        String tool = requireText(cmd == null ? null : cmd.getToolName(), 128, "toolName");
        String argsHash = resolveArgsHash(cmd);
        String argsJson = serializeOptional(cmd == null ? null : cmd.getArgs(),
                MAX_ARGS_BYTES, "args");
        String idempotencyKey = trimToNull(cmd == null ? null : cmd.getIdempotencyKey(), 128);
        if (idempotencyKey == null) {
            idempotencyKey = sha256(runId + "\n" + call + "\n" + argsHash);
        }

        long now = clock.getAsLong();
        AgentToolCallEntity existing = mapper.selectByRunCall(tenantId, userId, runId, call);
        if (existing == null) {
            AgentToolCallEntity entity = new AgentToolCallEntity();
            entity.setCallId(call);
            entity.setRunId(runId);
            entity.setConversationId(run.getConversationId());
            entity.setTenantId(tenantId);
            entity.setUserId(userId);
            entity.setToolName(tool);
            entity.setArgsHash(argsHash);
            entity.setArgsJson(argsJson);
            entity.setStatus(AgentToolCallEntity.STATUS_STARTED);
            entity.setIdempotencyKey(idempotencyKey);
            entity.setAttempt(1);
            entity.setStartedAt(now);
            entity.setCreateTime(now);
            entity.setUpdateTime(now);
            try {
                mapper.insertCall(entity);
                return entity;
            } catch (RuntimeException e) {
                // A concurrent started/completed won the unique key; re-read it.
                AgentToolCallEntity raced = mapper.selectByRunCall(tenantId, userId, runId, call);
                if (raced == null) {
                    throw e;
                }
                existing = raced;
            }
        }

        if (isFinished(existing)) {
            return existing;
        }
        int attempt = existing.getAttempt() == null ? 1 : existing.getAttempt() + 1;
        int updated = mapper.markStarted(tenantId, userId, runId, call, tool, argsHash,
                argsJson, idempotencyKey, attempt, now);
        if (updated == 0) {
            return requireCall(tenantId, userId, runId, call);
        }
        existing.setStatus(AgentToolCallEntity.STATUS_STARTED);
        existing.setToolName(tool);
        existing.setArgsHash(argsHash);
        existing.setArgsJson(argsJson);
        existing.setIdempotencyKey(idempotencyKey);
        existing.setAttempt(attempt);
        existing.setStartedAt(now);
        existing.setUpdateTime(now);
        return existing;
    }

    /**
     * Record the outcome. Idempotent: the first terminal row wins; a retry
     * cannot overwrite a completed result.
     */
    @Transactional(rollbackFor = Exception.class)
    public AgentToolCallEntity completed(long tenantId, long userId, String runId, String callId,
                                         CompletedCommand cmd) {
        requireRun(tenantId, userId, runId);
        String call = requireText(callId, 64, "callId");
        long now = clock.getAsLong();
        AgentToolCallEntity existing = mapper.selectByRunCall(tenantId, userId, runId, call);
        if (existing != null && isFinished(existing)) {
            return existing;
        }

        boolean ok = cmd == null || cmd.isOk();
        String status = ok ? AgentToolCallEntity.STATUS_COMPLETED : AgentToolCallEntity.STATUS_FAILED;
        String resultJson = null;
        int truncated = 0;
        if (ok && cmd != null && cmd.getResult() != null) {
            byte[] bytes = serializeBytes(cmd.getResult(), "result");
            if (bytes.length > MAX_RESULT_BYTES) {
                resultJson = "{\"truncated\":true,\"bytes\":" + bytes.length + "}";
                truncated = 1;
            } else {
                resultJson = new String(bytes, StandardCharsets.UTF_8);
            }
        }
        String error = truncateToNull(cmd == null ? null : cmd.getError(), MAX_ERROR_CHARS);
        if (!ok && error == null) {
            error = "工具执行失败（未提供原因）";
        }

        int updated = mapper.markFinished(tenantId, userId, runId, call, status,
                resultJson, truncated, error, now);
        if (updated == 0) {
            return requireCall(tenantId, userId, runId, call);
        }
        existing.setStatus(status);
        existing.setResultJson(resultJson);
        existing.setResultTruncated(truncated);
        existing.setError(error);
        existing.setFinishedAt(now);
        existing.setUpdateTime(now);
        return existing;
    }

    /** A restart found {@code started} but no known outcome. */
    @Transactional(rollbackFor = Exception.class)
    public AgentToolCallEntity uncertain(long tenantId, long userId, String runId, String callId) {
        requireRun(tenantId, userId, runId);
        String call = requireText(callId, 64, "callId");
        long now = clock.getAsLong();
        mapper.markUncertain(tenantId, userId, runId, call, now);
        return requireCall(tenantId, userId, runId, call);
    }

    /** Persist an approval request before rendering the card. */
    @Transactional(rollbackFor = Exception.class)
    public AgentToolCallEntity requestApproval(long tenantId, long userId, String runId, String callId,
                                               ApprovalCommand cmd) {
        AgentRunEntity run = requireRun(tenantId, userId, runId);
        String call = requireText(callId, 64, "callId");
        if (cmd == null || cmd.getRequest() == null) {
            throw new AgentStateException("APPROVAL_REQUIRED", "approval request is required");
        }
        String approvalJson = serializeOptional(cmd.getRequest(), MAX_APPROVAL_BYTES, "approval");
        long now = clock.getAsLong();
        Long expiresAt = cmd.getTimeoutMs() != null && cmd.getTimeoutMs() > 0
                ? now + cmd.getTimeoutMs() : null;

        AgentToolCallEntity existing = mapper.selectByRunCall(tenantId, userId, runId, call);
        if (existing == null) {
            AgentToolCallEntity entity = new AgentToolCallEntity();
            entity.setCallId(call);
            entity.setRunId(runId);
            entity.setConversationId(run.getConversationId());
            entity.setTenantId(tenantId);
            entity.setUserId(userId);
            String toolName = trimToNull(cmd.getToolName(), 128);
            entity.setToolName(toolName == null ? "unknown" : toolName);
            entity.setArgsHash(trimToNull(cmd.getArgsHash(), 64) == null ? "" : cmd.getArgsHash().trim());
            entity.setStatus(AgentToolCallEntity.STATUS_AWAITING_APPROVAL);
            entity.setApprovalJson(approvalJson);
            entity.setApprovalExpiresAt(expiresAt);
            entity.setIdempotencyKey(sha256(runId + "\n" + call + "\n" + entity.getArgsHash()));
            entity.setAttempt(1);
            entity.setCreateTime(now);
            entity.setUpdateTime(now);
            mapper.insertCall(entity);
            return entity;
        }
        if (isFinished(existing)) {
            return existing;
        }
        int updated = mapper.requestApproval(tenantId, userId, runId, call, approvalJson, expiresAt, now);
        if (updated == 0) {
            return requireCall(tenantId, userId, runId, call);
        }
        existing.setStatus(AgentToolCallEntity.STATUS_AWAITING_APPROVAL);
        existing.setApprovalJson(approvalJson);
        existing.setApprovalExpiresAt(expiresAt);
        existing.setUpdateTime(now);
        return existing;
    }

    /** Approve/reject an awaiting request; a second decision is a no-op. */
    @Transactional(rollbackFor = Exception.class)
    public AgentToolCallEntity decideApproval(long tenantId, long userId, String runId, String callId,
                                              DecisionCommand cmd) {
        requireRun(tenantId, userId, runId);
        String call = requireText(callId, 64, "callId");
        if (cmd == null) {
            throw new AgentStateException("APPROVAL_DECISION_REQUIRED", "approval decision is required");
        }
        long now = clock.getAsLong();
        String status = cmd.isAllowed()
                ? AgentToolCallEntity.STATUS_APPROVED : AgentToolCallEntity.STATUS_REJECTED;
        int updated = mapper.decideApproval(tenantId, userId, runId, call, status,
                truncateToNull(cmd.getNote(), MAX_ERROR_CHARS), now);
        if (updated == 0) {
            return requireCall(tenantId, userId, runId, call);
        }
        AgentToolCallEntity existing = requireCall(tenantId, userId, runId, call);
        existing.setStatus(status);
        existing.setApprovalNote(cmd.getNote());
        existing.setUpdateTime(now);
        return existing;
    }

    public AgentToolCallEntity get(long tenantId, long userId, String runId, String callId) {
        requireRun(tenantId, userId, runId);
        return requireCall(tenantId, userId, runId, callId);
    }

    public List<AgentToolCallEntity> list(long tenantId, long userId, String runId,
                                          String status, int limit) {
        requireRun(tenantId, userId, runId);
        int effective = limit <= 0 ? 100 : Math.min(limit, 200);
        List<AgentToolCallEntity> rows = trimToNull(status, 24) == null
                ? mapper.selectByRun(tenantId, userId, runId, effective)
                : mapper.selectByRunStatus(tenantId, userId, runId, status.trim(), effective);
        return rows != null ? rows : Collections.<AgentToolCallEntity>emptyList();
    }

    // ==================== internals ====================

    private AgentRunEntity requireRun(long tenantId, long userId, String runId) {
        String id = requireText(runId, 64, "runId");
        AgentRunEntity run = runMapper.selectByRunId(id);
        if (run == null || run.getTenantId() == null || run.getUserId() == null
                || run.getTenantId().longValue() != tenantId
                || run.getUserId().longValue() != userId) {
            throw new AgentStateException("RUN_NOT_FOUND", "no such run: " + id);
        }
        return run;
    }

    private AgentToolCallEntity requireCall(long tenantId, long userId, String runId, String callId) {
        AgentToolCallEntity entity = mapper.selectByRunCall(tenantId, userId, runId, callId);
        if (entity == null) {
            throw new AgentStateException("TOOL_CALL_NOT_FOUND", "no such tool call: " + callId);
        }
        return entity;
    }

    private String resolveArgsHash(StartedCommand cmd) {
        String supplied = trimToNull(cmd == null ? null : cmd.getArgsHash(), 64);
        if (supplied != null) {
            return supplied;
        }
        if (cmd != null && cmd.getArgs() != null) {
            return sha256(new String(serializeBytes(cmd.getArgs(), "args"), StandardCharsets.UTF_8));
        }
        return sha256("");
    }

    private String serializeOptional(Object value, int maxBytes, String field) {
        if (value == null) {
            return null;
        }
        byte[] bytes = serializeBytes(value, field);
        if (bytes.length > maxBytes) {
            throw new AgentStateException("PAYLOAD_TOO_LARGE",
                    field + " serializes to " + bytes.length + " bytes (max " + maxBytes + ")");
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private byte[] serializeBytes(Object value, String field) {
        try {
            return objectMapper.writeValueAsBytes(value);
        } catch (JsonProcessingException e) {
            throw new AgentStateException("PAYLOAD_INVALID",
                    field + " is not JSON-serializable: " + e.getOriginalMessage());
        }
    }

    private static boolean isFinished(AgentToolCallEntity entity) {
        if (entity == null) {
            return false;
        }
        String status = entity.getStatus();
        return AgentToolCallEntity.STATUS_COMPLETED.equals(status)
                || AgentToolCallEntity.STATUS_FAILED.equals(status)
                || AgentToolCallEntity.STATUS_CANCELLED.equals(status)
                || AgentToolCallEntity.STATUS_REJECTED.equals(status);
    }

    private static String requireText(String value, int max, String field) {
        String text = trimToNull(value, max);
        if (text == null) {
            throw new AgentStateException("INVALID_ARGUMENT", field + " is required");
        }
        return text;
    }

    private static String trimToNull(String value, int max) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        if (text.length() == 0) {
            return null;
        }
        return text.length() > max ? text.substring(0, max) : text;
    }

    private static String truncateToNull(String value, int max) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        if (text.length() == 0) {
            return null;
        }
        return text.length() > max ? text.substring(0, max) : text;
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                out.append(String.format("%02x", b & 0xff));
            }
            return out.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    @Data
    public static class StartedCommand {
        private String toolName;
        private String argsHash;
        private Object args;
        private String idempotencyKey;
    }

    @Data
    public static class CompletedCommand {
        private boolean ok = true;
        private Object result;
        private String error;
    }

    @Data
    public static class ApprovalCommand {
        private String toolName;
        private String argsHash;
        private Object request;
        private Long timeoutMs;
    }

    @Data
    public static class DecisionCommand {
        private boolean allowed;
        private String note;
    }
}