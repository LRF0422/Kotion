package com.knowledge.agent.core.task;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.mapper.AgentChatSessionMapper;
import com.knowledge.agent.core.run.TodoItem;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * One-time backfill of the cross-session task index from historical
 * transcripts.
 *
 * <p>{@code UpdateTodosTool} only indexes lists from the moment the new code
 * runs. Sessions that predate it still carry their last whole-list snapshot in
 * the projected transcript ({@code agent_chat_session.messages_json}, the
 * {@code todos} field of the last {@code ai} node) — without this pass the
 * user's previously lost unfinished tasks would remain invisible.
 *
 * <p>The work queue is the {@code tasks_indexed} marker on
 * {@code agent_chat_session}: V45 flips every pre-existing row to 0, and rows
 * created afterwards default to 1 (their writes go to the index directly). Each
 * processed row is marked 1 whether or not it produced tasks and even when
 * parsing/writing failed: retrying a permanently broken transcript on every
 * boot would just burn startup time, and the failure is logged either way.
 *
 * <p>Timing/liveness: scheduled from {@link ApplicationReadyEvent} on a daemon
 * thread, so a big backfill never delays startup (and never keeps the JVM
 * alive). Multi-instance: instances race on the same 0-rows, but the work is
 * idempotent (whole-snapshot replace + a marker), so a duplicate pass only
 * costs a little work — no coordination table is added for a one-time job.
 */
@Slf4j
@Component
public class SessionTaskBackfill {

    /** Thread name — also what operational tooling greps for. */
    static final String THREAD_NAME = "agent-session-task-backfill";

    private final AgentChatSessionMapper sessionMapper;
    private final SessionTaskStore taskStore;
    private final ObjectMapper objectMapper;
    private final AgentCoreProperties properties;

    /** Guards against a doubly delivered ready event starting a second thread. */
    private final AtomicBoolean started = new AtomicBoolean(false);

    public SessionTaskBackfill(AgentChatSessionMapper sessionMapper,
                               SessionTaskStore taskStore,
                               ObjectMapper objectMapper,
                               AgentCoreProperties properties) {
        this.sessionMapper = sessionMapper;
        this.taskStore = taskStore;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    /**
     * Startup hook: fire-and-forget the backfill on a daemon thread. Disabled by
     * {@code agent.session-tasks.backfill-enabled=false}.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void schedule() {
        AgentCoreProperties.SessionTasks config = config();
        if (!config.isBackfillEnabled()) {
            log.debug("Session task backfill disabled (agent.session-tasks.backfill-enabled=false)");
            return;
        }
        if (!started.compareAndSet(false, true)) {
            return;
        }
        Thread thread = new Thread(this::runSafely, THREAD_NAME);
        thread.setDaemon(true);
        thread.start();
    }

    private void runSafely() {
        try {
            backfill();
        } catch (Exception e) {
            log.warn("Session task backfill aborted: {}", e.toString());
        }
    }

    /**
     * Process up to {@code backfillLimit} pending sessions in
     * {@code backfillBatchSize} batches. Visible for tests; never starts a
     * thread itself.
     */
    public void backfill() {
        AgentCoreProperties.SessionTasks config = config();
        int limit = Math.max(0, config.getBackfillLimit());
        int batchSize = Math.max(1, config.getBackfillBatchSize());
        if (limit == 0) {
            log.info("Session task backfill skipped: agent.session-tasks.backfill-limit=0");
            return;
        }
        long startedAt = System.currentTimeMillis();
        int processed = 0;
        int written = 0;
        int failed = 0;
        int markFailed = 0;
        while (processed < limit) {
            int batchLimit = Math.min(batchSize, limit - processed);
            List<AgentChatSessionEntity> batch;
            try {
                batch = sessionMapper.selectTasksBackfillCandidates(batchLimit);
            } catch (Exception e) {
                // The queue stays 0-marked; the next boot retries the remainder.
                log.warn("Session task backfill batch query failed after {} row(s): {}",
                        processed, e.toString());
                break;
            }
            if (batch == null || batch.isEmpty()) {
                break;
            }
            for (AgentChatSessionEntity row : batch) {
                if (processed >= limit) {
                    break;
                }
                processed++;
                if (row == null || row.getId() == null) {
                    continue;
                }
                try {
                    List<TodoItem> items = extractLastTodos(row.getMessagesJson(), objectMapper);
                    if (!items.isEmpty()) {
                        taskStore.replaceSnapshot(row.getTenantId(), row.getUserId(),
                                row.getSessionId(), null, items);
                        written++;
                    }
                } catch (Exception e) {
                    failed++;
                    log.warn("Session task backfill failed for session {}: {}",
                            row.getSessionId(), e.toString());
                }
                try {
                    sessionMapper.markTasksIndexed(row.getId());
                } catch (Exception e) {
                    // Not marked -> retried next boot. Never abort the pass.
                    markFailed++;
                    log.warn("Session task backfill could not mark session row {}: {}",
                            row.getId(), e.toString());
                }
            }
            if (batch.size() < batchLimit) {
                break;
            }
        }
        log.info("Session task backfill finished: processed={}, sessions with tasks={}, "
                        + "failures={}, markFailures={}, took={}ms",
                processed, written, failed, markFailed, System.currentTimeMillis() - startedAt);
    }

    /**
     * The session's last task list from its projected transcript.
     *
     * <p>{@code messages_json} is a flat array of UI nodes; every engine run is
     * one {@code sender == "ai"} node and {@code SessionTranscriptProjector}
     * attaches the run's final whole-list snapshot as its {@code todos} array
     * (items: {@code id / title / status}). The LAST ai node that carries a
     * {@code todos} array wins — it is the newest snapshot of the session.
     *
     * <p>Pure and defensive: malformed JSON, a non-array root or non-array
     * {@code todos} all yield an empty list so one bad row can never abort the
     * backfill.
     */
    static List<TodoItem> extractLastTodos(String messagesJson, ObjectMapper mapper) {
        if (mapper == null || messagesJson == null || messagesJson.trim().isEmpty()) {
            return Collections.emptyList();
        }
        JsonNode root;
        try {
            root = mapper.readTree(messagesJson);
        } catch (Exception e) {
            return Collections.emptyList();
        }
        if (root == null || !root.isArray()) {
            return Collections.emptyList();
        }
        JsonNode latest = null;
        for (JsonNode node : root) {
            if (!node.isObject() || !"ai".equals(node.path("sender").asText())) {
                continue;
            }
            JsonNode todos = node.get("todos");
            if (todos != null && todos.isArray()) {
                latest = todos;
            }
        }
        if (latest == null || latest.size() == 0) {
            return Collections.emptyList();
        }
        List<TodoItem> items = new ArrayList<>(latest.size());
        for (JsonNode entry : latest) {
            if (!entry.isObject()) {
                continue;
            }
            String title = entry.path("title").asText("").trim();
            if (title.isEmpty()) {
                continue;
            }
            String id = entry.path("id").asText("").trim();
            String status = TodoItem.normalizeStatus(entry.path("status").asText(null));
            items.add(TodoItem.of(id, title, status));
        }
        return items;
    }

    /** Test seam: whether {@link #schedule()} already started the worker. */
    boolean isStarted() {
        return started.get();
    }

    private AgentCoreProperties.SessionTasks config() {
        AgentCoreProperties.SessionTasks config =
                properties != null ? properties.getSessionTasks() : null;
        return config != null ? config : new AgentCoreProperties.SessionTasks();
    }
}
