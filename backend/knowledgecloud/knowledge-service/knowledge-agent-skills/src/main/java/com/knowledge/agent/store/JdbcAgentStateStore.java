package com.knowledge.agent.store;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.store.entity.AgentStateSnapshotEntity;
import com.knowledge.agent.store.mapper.AgentStateSnapshotMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * JDBC/MySQL-backed implementation of {@link AgentStateStore}.
 *
 * <p>
 * Persists agent state snapshots to the {@code agent_state_snapshot} table
 * via MyBatis-Plus. Saves are asynchronous and best-effort: a bounded thread
 * pool of 2 workers with a queue of 100 ensures that snapshot persistence can
 * never block or exhaust the agent loop's threads. When the queue is full,
 * the snapshot is silently dropped (the previous snapshot in the database
 * remains valid).
 *
 * <p>
 * The full {@link AgentStateSnapshot} JSON is stored in the {@code snapshot}
 * column. Indexed columns (session_id, conversation_id, agent_id, depth,
 * iteration, timestamp) are extracted from the JSON on write to enable
 * efficient querying — particularly {@link #loadLatest(String)} which resolves
 * the newest snapshot with a single SQL query.
 *
 * <p>
 * Activated via {@code agent.state.backend=jdbc} in application properties.
 * This is the only persistence backend — {@code agent.state.backend=none}
 * disables snapshot persistence entirely.
 *
 * <p>
 * This is a Spring singleton ({@code @Component}) — it is stateless except
 * for the shared thread pool, so concurrent agent loops can safely share one
 * instance.
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "agent.state", name = "backend", havingValue = "jdbc")
public class JdbcAgentStateStore implements AgentStateStore {

    private final AgentStateSnapshotMapper mapper;
    private final ObjectMapper objectMapper;

    /** Bounded executor: 2 threads, queue capacity 100, silent-drop on overflow. */
    private ThreadPoolExecutor saveExecutor;

    public JdbcAgentStateStore(AgentStateSnapshotMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    void init() {
        saveExecutor = new ThreadPoolExecutor(
                2, 2,
                0L, TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>(100),
                (r, executor) -> {
                    log.warn("JdbcAgentStateStore save queue full (capacity=100), dropping snapshot");
                    // Best-effort: never block the caller. The previous snapshot
                    // in the database remains valid.
                });

        // Verify the snapshot table exists so operators get an early signal
        // if they set agent.state.backend=jdbc without running the DDL.
        try {
            mapper.selectCount(new LambdaQueryWrapper<AgentStateSnapshotEntity>().last("LIMIT 1"));
            log.info("JdbcAgentStateStore: agent_state_snapshot table verified");
        } catch (Exception e) {
            log.error("JdbcAgentStateStore: agent_state_snapshot table not found — " +
                    "run backend/knowledgecloud/doc/sql/blade/agent-skills.sql. " +
                    "Snapshots will be silently dropped.", e);
        }

        log.info("JdbcAgentStateStore initialised");
    }

    @PreDestroy
    void shutdown() {
        if (saveExecutor != null) {
            saveExecutor.shutdown();
            try {
                if (!saveExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                    saveExecutor.shutdownNow();
                }
            } catch (InterruptedException e) {
                saveExecutor.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
    }

    // ------------------------------------------------------------------
    // save / saveBytes
    // ------------------------------------------------------------------

    @Override
    public void save(String sessionId, AgentStateSnapshot snapshot) {
        if (sessionId == null || sessionId.isEmpty() || snapshot == null) {
            return;
        }
        try {
            byte[] json = objectMapper.writeValueAsBytes(snapshot);
            saveBytes(sessionId, json);
        } catch (Exception e) {
            log.warn("JdbcAgentStateStore: failed to serialize snapshot for sessionId={}: {}", sessionId,
                    e.getMessage());
        }
    }

    @Override
    public void saveBytes(String sessionId, byte[] jsonBytes) {
        if (sessionId == null || sessionId.isEmpty() || jsonBytes == null) {
            return;
        }
        try {
            CompletableFuture.runAsync(() -> doSaveBytes(sessionId, jsonBytes), saveExecutor);
        } catch (Exception e) {
            // runAsync should not throw, but be defensive
            log.warn("JdbcAgentStateStore.saveBytes rejected for sessionId={}: {}", sessionId, e.getMessage());
        }
    }

    /**
     * Async worker: deserialize the JSON bytes to extract indexed column
     * values, then upsert by {@code session_id}.
     */
    private void doSaveBytes(String sessionId, byte[] jsonBytes) {
        try {
            AgentStateSnapshot snapshot = objectMapper.readValue(jsonBytes, AgentStateSnapshot.class);
            String json = new String(jsonBytes, java.nio.charset.StandardCharsets.UTF_8);

            AgentStateSnapshotEntity entity = new AgentStateSnapshotEntity();
            entity.setSessionId(sessionId);
            entity.setConversationId(snapshot.getConversationId());
            entity.setAgentId(snapshot.getAgentId());
            entity.setParentAgentId(snapshot.getParentAgentId());
            entity.setDepth(snapshot.getDepth());
            entity.setIteration(snapshot.getIteration());
            entity.setTimestamp(snapshot.getTimestamp());
            entity.setSnapshot(json);

            // Atomic upsert by session_id (unique key) — eliminates the
            // select-then-insert/update race condition that caused
            // DuplicateKeyException under concurrent saves.
            mapper.upsertBySessionId(entity);

            log.debug("JdbcAgentStateStore: saved snapshot for sessionId={}, iteration={}",
                    sessionId, snapshot.getIteration());
        } catch (Exception e) {
            log.warn("JdbcAgentStateStore: failed to persist snapshot for sessionId={}: {}", sessionId, e.getMessage());
        }
    }

    // ------------------------------------------------------------------
    // load
    // ------------------------------------------------------------------

    @Override
    public AgentStateSnapshot load(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) {
            return null;
        }
        try {
            AgentStateSnapshotEntity entity = mapper.selectOne(
                    new LambdaQueryWrapper<AgentStateSnapshotEntity>()
                            .eq(AgentStateSnapshotEntity::getSessionId, sessionId));
            if (entity == null || entity.getSnapshot() == null) {
                return null;
            }
            return objectMapper.readValue(entity.getSnapshot(), AgentStateSnapshot.class);
        } catch (Exception e) {
            log.warn("JdbcAgentStateStore: failed to load snapshot for sessionId={}: {}", sessionId, e.getMessage());
            return null;
        }
    }

    // ------------------------------------------------------------------
    // exists
    // ------------------------------------------------------------------

    @Override
    public boolean exists(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) {
            return false;
        }
        try {
            Long count = mapper.selectCount(
                    new LambdaQueryWrapper<AgentStateSnapshotEntity>()
                            .eq(AgentStateSnapshotEntity::getSessionId, sessionId));
            return count != null && count > 0;
        } catch (Exception e) {
            log.warn("JdbcAgentStateStore: failed to check existence for sessionId={}: {}", sessionId, e.getMessage());
            return false;
        }
    }

    // ------------------------------------------------------------------
    // delete
    // ------------------------------------------------------------------

    @Override
    public void delete(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) {
            return;
        }
        try {
            mapper.delete(
                    new LambdaQueryWrapper<AgentStateSnapshotEntity>()
                            .eq(AgentStateSnapshotEntity::getSessionId, sessionId));
            log.debug("JdbcAgentStateStore: deleted snapshot for sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("JdbcAgentStateStore: failed to delete snapshot for sessionId={}: {}", sessionId, e.getMessage());
        }
    }

    // ------------------------------------------------------------------
    // loadLatest
    // ------------------------------------------------------------------

    @Override
    public AgentStateSnapshot loadLatest(String conversationId) {
        if (conversationId == null || conversationId.isEmpty()) {
            return null;
        }
        try {
            AgentStateSnapshotEntity entity = mapper.selectLatestByConversationId(conversationId);
            if (entity == null || entity.getSnapshot() == null) {
                return null;
            }
            return objectMapper.readValue(entity.getSnapshot(), AgentStateSnapshot.class);
        } catch (Exception e) {
            log.warn("JdbcAgentStateStore: failed to load latest snapshot for conversationId={}: {}",
                    conversationId, e.getMessage());
            return null;
        }
    }
}
