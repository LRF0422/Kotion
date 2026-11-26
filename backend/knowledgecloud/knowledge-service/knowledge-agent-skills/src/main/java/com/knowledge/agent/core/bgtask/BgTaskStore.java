package com.knowledge.agent.core.bgtask;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentBgTaskEntity;
import com.knowledge.agent.core.entity.AgentBgTaskLogEntity;
import com.knowledge.agent.core.mapper.AgentBgTaskLogMapper;
import com.knowledge.agent.core.mapper.AgentBgTaskMapper;
import com.knowledge.agent.core.session.ChatSessionStore;
import lombok.Data;
import lombok.Getter;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.LongSupplier;

/**
 * Durable store for background tasks — the server half of "client executes,
 * server stores".
 *
 * <p>The client owns execution and reports through
 * {@code create / update / logs / heartbeat / finish}. This class owns:
 * idempotent create, lease issuance/validation, monotonic log sequence,
 * terminal-state idempotency, cancel requests and the disconnected/cancelling
 * sweeps. It never runs plugin work.
 *
 * <p>Every read is owner-scoped by {@code (tenantId, userId)}. The lease token is
 * only stored as a sha256 hash; the raw value is returned once from
 * create/attach.
 */
@Component
public class BgTaskStore {

    public static final String STATE_RUNNING = "running";
    public static final String STATE_CANCELLING = "cancelling";
    public static final String STATE_DISCONNECTED = "disconnected";
    public static final String STATE_SUCCEEDED = "succeeded";
    public static final String STATE_FAILED = "failed";
    public static final String STATE_CANCELLED = "cancelled";

    public static final String MODE_JOB = "job";
    public static final String MODE_WATCH = "watch";

    private static final Set<String> TERMINAL_STATES = Collections.unmodifiableSet(
            new HashSet<String>(Arrays.asList(STATE_SUCCEEDED, STATE_FAILED, STATE_CANCELLED)));
    private static final Set<String> MODES = Collections.unmodifiableSet(
            new HashSet<String>(Arrays.asList(MODE_JOB, MODE_WATCH)));
    private static final Set<String> RESUME_POLICIES = Collections.unmodifiableSet(
            new HashSet<String>(Arrays.asList("never", "manual", "auto")));
    private static final Set<String> LOG_LEVELS = Collections.unmodifiableSet(
            new HashSet<String>(Arrays.asList("debug", "info", "warn", "error")));
    private static final Set<String> LOG_KINDS = Collections.unmodifiableSet(
            new HashSet<String>(Arrays.asList("log", "summary", "state")));

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AgentBgTaskMapper taskMapper;
    private final AgentBgTaskLogMapper logMapper;
    private final ChatSessionStore chatSessionStore;
    private final AgentCoreProperties properties;
    private final ObjectMapper objectMapper;
    private final LongSupplier clock;

    @Autowired
    public BgTaskStore(AgentBgTaskMapper taskMapper,
                       AgentBgTaskLogMapper logMapper,
                       ChatSessionStore chatSessionStore,
                       AgentCoreProperties properties,
                       ObjectMapper objectMapper) {
        this(taskMapper, logMapper, chatSessionStore, properties, objectMapper,
                new LongSupplier() {
                    @Override
                    public long getAsLong() {
                        return System.currentTimeMillis();
                    }
                });
    }

    /** Test seam: deterministic clock. */
    BgTaskStore(AgentBgTaskMapper taskMapper,
                AgentBgTaskLogMapper logMapper,
                ChatSessionStore chatSessionStore,
                AgentCoreProperties properties,
                ObjectMapper objectMapper,
                LongSupplier clock) {
        this.taskMapper = taskMapper;
        this.logMapper = logMapper;
        this.chatSessionStore = chatSessionStore;
        this.properties = properties != null ? properties : new AgentCoreProperties();
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
        this.clock = clock != null ? clock : new LongSupplier() {
            @Override
            public long getAsLong() {
                return System.currentTimeMillis();
            }
        };
    }

    // ==================== write side ====================

    /**
     * Create a task, or return the existing one for the same
     * {@code clientTaskId}. Retrying create is safe: a live task with the same
     * client gets a fresh lease; a terminal one is returned without a lease.
     */
    @Transactional(rollbackFor = Exception.class)
    public Lease create(long tenantId, long userId, CreateCommand cmd) {
        requireOwner(tenantId, userId);
        if (cmd == null) {
            throw invalid("create", "request is required");
        }
        String clientTaskId = requireText(cmd.getClientTaskId(), 64, "clientTaskId");
        String clientId = trimToNull(cmd.getClientId(), 128);
        long now = clock.getAsLong();

        AgentBgTaskEntity existing = taskMapper.selectByClientTaskId(tenantId, userId, clientTaskId);
        if (existing != null) {
            return resumeExisting(existing, clientId, now, cmd);
        }

        String kind = requireText(cmd.getKind(), 80, "kind");
        String title = requireText(cmd.getTitle(), 512, "title");
        String mode = normalizeMode(cmd.getMode());
        String conversationId = validateConversation(tenantId, userId, trimToNull(cmd.getConversationId(), 128));

        int active = taskMapper.countActive(tenantId, userId);
        if (properties.getBgTask().getMaxActivePerUser() > 0
                && active >= properties.getBgTask().getMaxActivePerUser()) {
            throw new BgTaskException("TASK_LIMIT",
                    "active background tasks exceed the per-user limit ("
                            + properties.getBgTask().getMaxActivePerUser() + ")");
        }
        int retained = taskMapper.countAll(tenantId, userId);
        if (properties.getBgTask().getMaxRetainedPerUser() > 0
                && retained >= properties.getBgTask().getMaxRetainedPerUser()) {
            throw new BgTaskException("TASK_LIMIT",
                    "retained background tasks exceed the per-user limit ("
                            + properties.getBgTask().getMaxRetainedPerUser() + ")");
        }

        boolean resumable = Boolean.TRUE.equals(cmd.getResumable());
        if (resumable && clientId == null) {
            throw invalid("create", "resumable tasks require clientId");
        }

        AgentBgTaskEntity task = new AgentBgTaskEntity();
        task.setTaskId(newTaskId());
        task.setClientTaskId(clientTaskId);
        task.setClientId(clientId);
        task.setTenantId(tenantId);
        task.setUserId(userId);
        task.setConversationId(conversationId);
        task.setRunId(trimToNull(cmd.getRunId(), 64));
        task.setPluginKey(trimToNull(cmd.getPluginKey(), 128));
        task.setToolName(trimToNull(cmd.getToolName(), 128));
        task.setKind(kind);
        task.setTitle(title);
        task.setMode(mode);
        task.setState(STATE_RUNNING);
        task.setProgressJson(serializeOptional(cmd.getProgress(), properties.getBgTask().getMaxProgressBytes(),
                "progress"));
        task.setResultTruncated(0);
        task.setMetaJson(serializeOptional(cmd.getMeta(), properties.getBgTask().getMaxMetaBytes(), "meta"));
        task.setCheckpointJson(null);
        task.setResumable(resumable ? 1 : 0);
        task.setResumePolicy(normalizeResumePolicy(cmd.getResumePolicy(), resumable));
        task.setAttempt(1);
        task.setHeartbeatMs(clampHeartbeat(cmd.getHeartbeatMs()));
        task.setCancelRequested(0);
        task.setLogSeq(0L);
        task.setLogFirstSeq(0L);
        task.setCreatedAt(now);
        task.setUpdatedAt(now);

        taskMapper.insertTask(task);
        return issueLease(task, 1, now);
    }

    /**
     * Attach a (possibly disconnected) task to a client. Increments the attempt,
     * rotates the lease and returns the task's checkpoint so the plugin can
     * resume from where it stopped.
     */
    @Transactional(rollbackFor = Exception.class)
    public Lease attach(long tenantId, long userId, String taskId, String clientId) {
        requireOwner(tenantId, userId);
        AgentBgTaskEntity task = requireTask(tenantId, userId, taskId);
        if (isTerminal(task)) {
            return new Lease(task, null);
        }
        if (STATE_CANCELLING.equals(task.getState())) {
            throw new BgTaskException("TASK_CANCELLING", "task is cancelling; wait for it to finish");
        }

        long now = clock.getAsLong();
        String normalizedClient = trimToNull(clientId, 128);
        boolean sameClient = normalizedClient != null && normalizedClient.equals(task.getClientId());
        boolean leaseExpired = task.getLeaseExpiresAt() == null || task.getLeaseExpiresAt() < now;
        if (!sameClient && !leaseExpired) {
            throw new BgTaskException("TASK_LEASE_HELD",
                    "another client still holds the lease; retry after it expires");
        }

        int nextAttempt = safeInt(task.getAttempt(), 1) + 1;
        return issueLease(task, nextAttempt, now);
    }

    /** Update progress/meta/checkpoint/title. Null fields are left untouched. */
    @Transactional(rollbackFor = Exception.class)
    public AgentBgTaskEntity update(long tenantId, long userId, String taskId,
                                    String leaseToken, UpdateCommand cmd) {
        AgentBgTaskEntity task = requireTask(tenantId, userId, taskId);
        if (STATE_DISCONNECTED.equals(task.getState())) {
            throw new BgTaskException("TASK_DISCONNECTED", "task is disconnected; attach to resume it");
        }
        long now = clock.getAsLong();
        ensureLease(task, leaseToken, now);
        if (isTerminal(task)) {
            throw new BgTaskException("TASK_TERMINAL", "task is already " + task.getState());
        }
        if (cmd == null) {
            throw invalid("update", "request is required");
        }

        String title = cmd.getTitle() == null
                ? null : requireText(cmd.getTitle(), 512, "title");
        String progressJson = serializeOptional(cmd.getProgress(),
                properties.getBgTask().getMaxProgressBytes(), "progress");
        String metaJson = serializeOptional(cmd.getMeta(),
                properties.getBgTask().getMaxMetaBytes(), "meta");
        String checkpointJson = serializeOptional(cmd.getCheckpoint(),
                properties.getBgTask().getMaxCheckpointBytes(), "checkpoint");

        taskMapper.updateMutable(taskId, tenantId, userId, title, progressJson, metaJson, checkpointJson, now);
        if (title != null) {
            task.setTitle(title);
        }
        if (progressJson != null) {
            task.setProgressJson(progressJson);
        }
        if (metaJson != null) {
            task.setMetaJson(metaJson);
        }
        if (checkpointJson != null) {
            task.setCheckpointJson(checkpointJson);
        }
        task.setUpdatedAt(now);
        return task;
    }

    /**
     * Append one client batch. The task row is locked to allocate a monotonic
     * seq; a repeated {@code batchId} is a no-op (idempotent retry).
     */
    @Transactional(rollbackFor = Exception.class)
    public LogAppend appendLogs(long tenantId, long userId, String taskId,
                                String leaseToken, String batchId, List<LogEntry> entries) {
        requireOwner(tenantId, userId);
        String batch = requireText(batchId, 64, "batchId");
        if (entries == null || entries.isEmpty()) {
            AgentBgTaskEntity current = requireTask(tenantId, userId, taskId);
            return new LogAppend(0, safeLong(current.getLogSeq()), 0);
        }
        if (entries.size() > properties.getBgTask().getMaxLogsPerBatch()) {
            throw new BgTaskException("TASK_LOG_BATCH_TOO_LARGE",
                    "one batch may contain at most " + properties.getBgTask().getMaxLogsPerBatch() + " entries");
        }

        AgentBgTaskEntity task = taskMapper.lockByTaskId(taskId);
        if (task == null || !ownerMatches(task, tenantId, userId)) {
            throw new BgTaskException("TASK_NOT_FOUND", "no such task: " + taskId);
        }
        if (STATE_DISCONNECTED.equals(task.getState())) {
            throw new BgTaskException("TASK_DISCONNECTED", "task is disconnected; attach to resume it");
        }
        long now = clock.getAsLong();
        ensureLease(task, leaseToken, now);
        if (isTerminal(task)) {
            throw new BgTaskException("TASK_TERMINAL", "task is already " + task.getState());
        }
        if (logMapper.countBatch(taskId, batch) > 0) {
            return new LogAppend(0, safeLong(task.getLogSeq()), 0);
        }

        long base = safeLong(task.getLogSeq());
        int maxChars = properties.getBgTask().getMaxLogLineChars();
        List<AgentBgTaskLogEntity> rows = new ArrayList<AgentBgTaskLogEntity>(entries.size());
        for (int i = 0; i < entries.size(); i++) {
            LogEntry entry = entries.get(i);
            if (entry == null) {
                throw invalid("logs", "entry " + i + " is null");
            }
            AgentBgTaskLogEntity row = new AgentBgTaskLogEntity();
            row.setTaskId(taskId);
            row.setSeq(base + i + 1);
            row.setBatchId(batch);
            row.setBatchSeq(i);
            row.setKind(normalizeLogKind(entry.getKind()));
            row.setLevel(normalizeLogLevel(entry.getLevel()));
            row.setMessage(truncate(entry.getMessage(), maxChars));
            row.setAt(entry.getAt() == null || entry.getAt() <= 0 ? now : entry.getAt());
            row.setCreateTime(now);
            rows.add(row);
        }
        logMapper.insertBatch(rows);
        long nextSeq = base + rows.size();
        taskMapper.updateLogSeq(taskId, nextSeq, now);
        trimLogs(task, nextSeq, now);
        return new LogAppend(rows.size(), nextSeq, 0);
    }

    /** Heartbeat: refresh the lease; report whether cancellation was requested. */
    @Transactional(rollbackFor = Exception.class)
    public Heartbeat heartbeat(long tenantId, long userId, String taskId, String leaseToken) {
        AgentBgTaskEntity task = requireTask(tenantId, userId, taskId);
        if (isTerminal(task)) {
            return new Heartbeat(task, false);
        }
        if (STATE_DISCONNECTED.equals(task.getState())) {
            throw new BgTaskException("TASK_DISCONNECTED",
                    "task is disconnected; attach to resume it");
        }
        long now = clock.getAsLong();
        ensureLeaseHash(task, leaseToken);
        int heartbeatMs = currentHeartbeatMs(task);
        long expiresAt = now + (long) heartbeatMs * Math.max(1, properties.getBgTask().getLeaseMultiplier());
        taskMapper.touchLease(taskId, task.getLeaseTokenHash(), now, expiresAt);
        task.setLastHeartbeatAt(now);
        task.setLeaseExpiresAt(expiresAt);
        task.setUpdatedAt(now);
        return new Heartbeat(task, isTrue(task.getCancelRequested()));
    }

    /**
     * Finish the task. Terminal state is idempotent; a second finish returns the
     * first result. An oversized result is rejected <b>before</b> the state
     * change, so a successful job never becomes a ghost {@code running} row.
     */
    @Transactional(rollbackFor = Exception.class)
    public AgentBgTaskEntity finish(long tenantId, long userId, String taskId,
                                    String leaseToken, String state, Object result,
                                    String error, String message) {
        AgentBgTaskEntity task = requireTask(tenantId, userId, taskId);
        if (isTerminal(task)) {
            return task;
        }
        if (STATE_DISCONNECTED.equals(task.getState())) {
            throw new BgTaskException("TASK_DISCONNECTED",
                    "task is disconnected; attach before finishing it");
        }
        long now = clock.getAsLong();
        ensureLease(task, leaseToken, now);

        String terminal = normalizeTerminal(state);
        String effectiveError = truncateToNull(error, properties.getBgTask().getMaxErrorChars());
        if (isTrue(task.getCancelRequested()) && STATE_SUCCEEDED.equals(terminal)) {
            // The work finished after the caller detached: keep the fact, but do
            // not resurrect the task as a fresh success.
            terminal = STATE_CANCELLED;
            effectiveError = "任务已取消：取消后仍完成了，结果不入队";
        }
        if (effectiveError == null && message != null && !STATE_SUCCEEDED.equals(terminal)) {
            effectiveError = truncateToNull(message, properties.getBgTask().getMaxErrorChars());
        }

        String resultJson = null;
        if (result != null) {
            byte[] bytes = serializeBytes(result, "result");
            if (bytes.length > properties.getBgTask().getMaxResultBytes()) {
                throw new BgTaskException("TASK_RESULT_TOO_LARGE",
                        "result serializes to " + bytes.length + " bytes (max "
                                + properties.getBgTask().getMaxResultBytes() + ")");
            }
            resultJson = new String(bytes, StandardCharsets.UTF_8);
        }

        int updated = taskMapper.finish(taskId, terminal, resultJson, 0, effectiveError, now);
        if (updated == 0) {
            // Another path already finished it; the first terminal state wins.
            return requireTask(tenantId, userId, taskId);
        }
        task.setState(terminal);
        task.setResultJson(resultJson);
        task.setResultTruncated(0);
        task.setError(effectiveError);
        task.setFinishedAt(now);
        task.setUpdatedAt(now);
        task.setLastHeartbeatAt(now);
        task.setLeaseTokenHash(null);
        task.setLeaseExpiresAt(null);
        return task;
    }

    /**
     * Request cancellation. A running task is marked {@code cancelling} and the
     * client sees it on its next heartbeat; a disconnected task has no executor
     * left and is cancelled immediately.
     */
    @Transactional(rollbackFor = Exception.class)
    public AgentBgTaskEntity cancel(long tenantId, long userId, String taskId) {
        AgentBgTaskEntity task = requireTask(tenantId, userId, taskId);
        if (isTerminal(task)) {
            return task;
        }
        long now = clock.getAsLong();
        if (STATE_DISCONNECTED.equals(task.getState())) {
            taskMapper.cancelDisconnected(taskId, now);
            task.setState(STATE_CANCELLED);
            task.setCancelRequested(1);
            task.setFinishedAt(now);
            task.setUpdatedAt(now);
            task.setLeaseTokenHash(null);
            task.setLeaseExpiresAt(null);
            return task;
        }
        if (STATE_RUNNING.equals(task.getState())) {
            long deadline = now + properties.getBgTask().getCancelGraceMs();
            taskMapper.requestCancel(taskId, deadline, now);
            task.setState(STATE_CANCELLING);
            task.setCancelRequested(1);
            task.setCancelDeadline(deadline);
            task.setUpdatedAt(now);
        }
        return task;
    }

    // ==================== read side ====================

    public AgentBgTaskEntity get(long tenantId, long userId, String taskId) {
        requireOwner(tenantId, userId);
        return requireTask(tenantId, userId, taskId);
    }

    public List<AgentBgTaskEntity> list(long tenantId, long userId, String state,
                                        String conversationId, String pluginKey,
                                        String clientId, int limit) {
        requireOwner(tenantId, userId);
        int max = properties.getBgTask().getMaxListLimit();
        int effective = limit <= 0 ? max : Math.min(limit, max);
        List<AgentBgTaskEntity> rows = taskMapper.selectByOwnerList(tenantId, userId,
                trimToNull(state, 24), trimToNull(conversationId, 128),
                trimToNull(pluginKey, 128), trimToNull(clientId, 128), effective);
        return rows != null ? rows : Collections.<AgentBgTaskEntity>emptyList();
    }

    public LogPage logsSince(long tenantId, long userId, String taskId, long sinceSeq, int limit) {
        AgentBgTaskEntity task = requireTask(tenantId, userId, taskId);
        int effective = limit <= 0 ? 200 : Math.min(limit, 500);
        long cursor = Math.max(0, sinceSeq);
        List<AgentBgTaskLogEntity> rows = logMapper.selectSince(taskId, cursor, effective);
        long firstSeq = safeLong(task.getLogFirstSeq());
        long dropped = Math.max(0, firstSeq - 1 - cursor);
        long nextSeq = cursor;
        if (rows != null && !rows.isEmpty()) {
            nextSeq = safeLong(rows.get(rows.size() - 1).getSeq());
        } else if (dropped > 0) {
            // The cursor is older than the retained ring: jump to the oldest
            // retained boundary instead of making the client poll forever.
            nextSeq = Math.max(cursor, firstSeq - 1);
        }
        long total = logMapper.countByTask(taskId);
        return new LogPage(rows != null ? rows : Collections.<AgentBgTaskLogEntity>emptyList(),
                nextSeq, dropped, total);
    }

    // ==================== sweeps ====================

    /**
     * Mark expired running leases as disconnected and force-close cancelling
     * tasks whose client never acknowledged. Conditional updates make this
     * idempotent across instances.
     */
    @Transactional(rollbackFor = Exception.class)
    public SweepResult sweep(long now) {
        int limit = Math.max(1, properties.getBgTask().getSweepLimit());
        int disconnected = 0;
        int cancelled = 0;

        List<AgentBgTaskEntity> expired = taskMapper.selectExpiredRunning(now, limit);
        if (expired != null) {
            for (AgentBgTaskEntity task : expired) {
                if (task == null || task.getTaskId() == null) {
                    continue;
                }
                int updated = taskMapper.markDisconnected(task.getTaskId(), now);
                if (updated > 0) {
                    appendSystemLog(task.getTaskId(), "warn", "客户端已断开（租约过期）", now);
                    disconnected++;
                }
            }
        }

        List<AgentBgTaskEntity> cancelling = taskMapper.selectExpiredCancelling(now, limit);
        if (cancelling != null) {
            for (AgentBgTaskEntity task : cancelling) {
                if (task == null || task.getTaskId() == null) {
                    continue;
                }
                int updated = taskMapper.cancelExpired(task.getTaskId(), now);
                if (updated > 0) {
                    appendSystemLog(task.getTaskId(), "warn", "取消超时，已强制收敛", now);
                    cancelled++;
                }
            }
        }
        return new SweepResult(disconnected, cancelled);
    }

    // ==================== internals ====================

    private Lease resumeExisting(AgentBgTaskEntity task, String clientId, long now, CreateCommand cmd) {
        if (isTerminal(task)) {
            return new Lease(task, null);
        }
        if (STATE_CANCELLING.equals(task.getState())) {
            throw new BgTaskException("TASK_CANCELLING", "task is cancelling; wait for it to finish");
        }
        boolean sameClient = clientId != null && clientId.equals(task.getClientId());
        boolean leaseExpired = task.getLeaseExpiresAt() == null || task.getLeaseExpiresAt() < now;
        if (!sameClient && !leaseExpired) {
            throw new BgTaskException("TASK_CLIENT_CONFLICT",
                    "the existing task belongs to another live client");
        }
        if (cmd != null && cmd.getHeartbeatMs() != null) {
            task.setHeartbeatMs(clampHeartbeat(cmd.getHeartbeatMs()));
        }
        int attempt = safeInt(task.getAttempt(), 1);
        if (leaseExpired) {
            attempt++;
        }
        return issueLease(task, attempt, now);
    }

    private Lease issueLease(AgentBgTaskEntity task, int attempt, long now) {
        String token = newLeaseToken();
        int heartbeatMs = currentHeartbeatMs(task);
        long expiresAt = now + (long) heartbeatMs * Math.max(1, properties.getBgTask().getLeaseMultiplier());

        task.setState(STATE_RUNNING);
        task.setAttempt(attempt);
        task.setHeartbeatMs(heartbeatMs);
        task.setLeaseTokenHash(sha256(token));
        task.setLeaseExpiresAt(expiresAt);
        task.setLastHeartbeatAt(now);
        task.setCancelRequested(0);
        task.setCancelDeadline(null);
        task.setUpdatedAt(now);
        taskMapper.updateLease(task);
        return new Lease(task, token);
    }

    private AgentBgTaskEntity requireTask(long tenantId, long userId, String taskId) {
        String id = requireText(taskId, 64, "taskId");
        AgentBgTaskEntity task = taskMapper.selectByOwner(tenantId, userId, id);
        if (task == null) {
            throw new BgTaskException("TASK_NOT_FOUND", "no such task: " + id);
        }
        return task;
    }

    private void ensureLease(AgentBgTaskEntity task, String leaseToken, long now) {
        ensureLeaseHash(task, leaseToken);
        if (task.getLeaseExpiresAt() != null && task.getLeaseExpiresAt() < now) {
            throw new BgTaskException("TASK_LEASE_EXPIRED",
                    "lease expired; send a heartbeat or attach to resume");
        }
    }

    private void ensureLeaseHash(AgentBgTaskEntity task, String leaseToken) {
        String expected = task.getLeaseTokenHash();
        if (leaseToken == null || leaseToken.length() == 0 || expected == null
                || !constantTimeEquals(expected, sha256(leaseToken))) {
            throw new BgTaskException("TASK_LEASE_INVALID", "lease token does not match");
        }
    }

    private String validateConversation(long tenantId, long userId, String conversationId) {
        if (conversationId == null || chatSessionStore == null) {
            return conversationId;
        }
        Object session = chatSessionStore.get(tenantId, userId, conversationId);
        if (session == null) {
            throw new BgTaskException("TASK_CONVERSATION_NOT_FOUND",
                    "conversation does not belong to the caller: " + conversationId);
        }
        return conversationId;
    }

    private void appendSystemLog(String taskId, String level, String message, long now) {
        AgentBgTaskEntity locked = taskMapper.lockByTaskId(taskId);
        if (locked == null) {
            return;
        }
        long base = safeLong(locked.getLogSeq());
        AgentBgTaskLogEntity row = new AgentBgTaskLogEntity();
        row.setTaskId(taskId);
        row.setSeq(base + 1);
        row.setBatchId("sys-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        row.setBatchSeq(0);
        row.setKind("state");
        row.setLevel(level);
        row.setMessage(truncate(message, properties.getBgTask().getMaxLogLineChars()));
        row.setAt(now);
        row.setCreateTime(now);
        logMapper.insertBatch(Collections.singletonList(row));
        long nextSeq = base + 1;
        taskMapper.updateLogSeq(taskId, nextSeq, now);
        trimLogs(locked, nextSeq, now);
    }

    /**
     * Keep only the newest {@code maxLogLinesPerTask} rows. {@code log_seq} stays
     * monotonic; {@code log_first_seq} is what lets readers report {@code dropped}.
     */
    private void trimLogs(AgentBgTaskEntity task, long nextSeq, long now) {
        int max = properties.getBgTask().getMaxLogLinesPerTask();
        if (max <= 0 || task == null || task.getTaskId() == null) {
            return;
        }
        long first = safeLong(task.getLogFirstSeq());
        long keepFrom = nextSeq - max + 1;
        if (keepFrom <= first) {
            return;
        }
        logMapper.deleteBelowSeq(task.getTaskId(), keepFrom);
        taskMapper.updateLogFirstSeq(task.getTaskId(), keepFrom, now);
        task.setLogFirstSeq(keepFrom);
    }

    private int clampHeartbeat(Integer requested) {
        int value = requested == null ? properties.getBgTask().getDefaultHeartbeatMs() : requested;
        int min = properties.getBgTask().getMinHeartbeatMs();
        int max = properties.getBgTask().getMaxHeartbeatMs();
        if (value < min) {
            value = min;
        }
        if (value > max) {
            value = max;
        }
        return value;
    }

    private int currentHeartbeatMs(AgentBgTaskEntity task) {
        Integer stored = task.getHeartbeatMs();
        return stored == null || stored <= 0
                ? properties.getBgTask().getDefaultHeartbeatMs() : stored;
    }

    private String normalizeMode(String raw) {
        String mode = trimToNull(raw, 16);
        if (mode == null) {
            return MODE_JOB;
        }
        String lower = mode.toLowerCase();
        if (!MODES.contains(lower)) {
            throw invalid("create", "mode must be job or watch");
        }
        return lower;
    }

    private String normalizeResumePolicy(String raw, boolean resumable) {
        String policy = trimToNull(raw, 16);
        if (policy == null) {
            return resumable ? "manual" : "never";
        }
        String lower = policy.toLowerCase();
        if (!RESUME_POLICIES.contains(lower)) {
            throw invalid("create", "resumePolicy must be never, manual or auto");
        }
        return resumable ? lower : "never";
    }

    private String normalizeTerminal(String raw) {
        String state = trimToNull(raw, 24);
        if (state == null) {
            throw invalid("finish", "state is required");
        }
        String lower = state.toLowerCase();
        if (!TERMINAL_STATES.contains(lower)) {
            throw invalid("finish", "state must be succeeded, failed or cancelled");
        }
        return lower;
    }

    private String normalizeLogLevel(String raw) {
        String level = trimToNull(raw, 8);
        if (level == null) {
            return "info";
        }
        String lower = level.toLowerCase();
        return LOG_LEVELS.contains(lower) ? lower : "info";
    }

    private String normalizeLogKind(String raw) {
        String kind = trimToNull(raw, 16);
        if (kind == null) {
            return "log";
        }
        String lower = kind.toLowerCase();
        return LOG_KINDS.contains(lower) ? lower : "log";
    }

    private String serializeOptional(Object value, int maxBytes, String field) {
        if (value == null) {
            return null;
        }
        byte[] bytes = serializeBytes(value, field);
        if (bytes.length > maxBytes) {
            throw new BgTaskException("TASK_PAYLOAD_TOO_LARGE",
                    field + " serializes to " + bytes.length + " bytes (max " + maxBytes + ")");
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private byte[] serializeBytes(Object value, String field) {
        try {
            return objectMapper.writeValueAsBytes(value);
        } catch (JsonProcessingException e) {
            throw new BgTaskException("TASK_PAYLOAD_INVALID",
                    field + " is not JSON-serializable: " + e.getOriginalMessage());
        }
    }

    private static boolean ownerMatches(AgentBgTaskEntity task, long tenantId, long userId) {
        return task.getTenantId() != null && task.getUserId() != null
                && task.getTenantId().longValue() == tenantId
                && task.getUserId().longValue() == userId;
    }

    private static boolean isTerminal(AgentBgTaskEntity task) {
        return task != null && TERMINAL_STATES.contains(task.getState());
    }

    private static boolean isTrue(Integer value) {
        return value != null && value.intValue() == 1;
    }

    private static long safeLong(Long value) {
        return value == null ? 0L : value.longValue();
    }

    private static int safeInt(Integer value, int fallback) {
        return value == null || value.intValue() <= 0 ? fallback : value.intValue();
    }

    private static void requireOwner(long tenantId, long userId) {
        if (tenantId <= 0 || userId <= 0) {
            throw new BgTaskException("TASK_IDENTITY_REQUIRED", "tenantId and userId are required");
        }
    }

    private static String requireText(String value, int max, String field) {
        String text = trimToNull(value, max);
        if (text == null) {
            throw new BgTaskException("TASK_INVALID_ARGUMENT", field + " is required");
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

    private static String truncate(String value, int max) {
        if (value == null) {
            return "";
        }
        return value.length() > max ? value.substring(0, max) : value;
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

    private static BgTaskException invalid(String op, String detail) {
        return new BgTaskException("TASK_INVALID_ARGUMENT", op + ": " + detail);
    }

    private static String newTaskId() {
        return "bt_" + UUID.randomUUID().toString().replace("-", "");
    }

    private static String newLeaseToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
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

    private static boolean constantTimeEquals(String expected, String actual) {
        if (expected == null || actual == null) {
            return false;
        }
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }

    // ==================== command/result types ====================

    @Data
    public static class CreateCommand {
        private String clientTaskId;
        private String clientId;
        private String kind;
        private String title;
        private String mode;
        private String conversationId;
        private String runId;
        private String pluginKey;
        private String toolName;
        private Object progress;
        private Object meta;
        private Integer heartbeatMs;
        private Boolean resumable;
        private String resumePolicy;
    }

    @Data
    public static class UpdateCommand {
        private Object progress;
        private Object meta;
        private Object checkpoint;
        private String title;
    }

    @Getter
    @Setter
    public static class LogEntry {
        private String kind;
        private String level;
        private String message;
        private Long at;

        public LogEntry() {
        }

        public LogEntry(String kind, String level, String message, Long at) {
            this.kind = kind;
            this.level = level;
            this.message = message;
            this.at = at;
        }
    }

    @Getter
    public static class Lease {
        private final AgentBgTaskEntity task;
        private final String leaseToken;

        public Lease(AgentBgTaskEntity task, String leaseToken) {
            this.task = task;
            this.leaseToken = leaseToken;
        }
    }

    @Getter
    public static class LogAppend {
        private final int added;
        private final long nextSeq;
        private final long dropped;

        public LogAppend(int added, long nextSeq, long dropped) {
            this.added = added;
            this.nextSeq = nextSeq;
            this.dropped = dropped;
        }
    }

    @Getter
    public static class LogPage {
        private final List<AgentBgTaskLogEntity> entries;
        private final long nextSeq;
        private final long dropped;
        private final long total;

        public LogPage(List<AgentBgTaskLogEntity> entries, long nextSeq, long dropped, long total) {
            this.entries = entries;
            this.nextSeq = nextSeq;
            this.dropped = dropped;
            this.total = total;
        }
    }

    @Getter
    public static class Heartbeat {
        private final AgentBgTaskEntity task;
        private final boolean cancelRequested;

        public Heartbeat(AgentBgTaskEntity task, boolean cancelRequested) {
            this.task = task;
            this.cancelRequested = cancelRequested;
        }
    }

    @Getter
    public static class SweepResult {
        private final int disconnected;
        private final int cancelled;

        public SweepResult(int disconnected, int cancelled) {
            this.disconnected = disconnected;
            this.cancelled = cancelled;
        }
    }
}