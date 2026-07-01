package com.knowledge.agent.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * File-based implementation of {@link AgentStateStore}.
 *
 * <p>
 * Persists agent state snapshots as JSON files under
 * {@code {baseDir}/sessions/{sessionId}.json}. Saves are asynchronous and
 * best-effort: a bounded thread pool of 2 workers with a queue of 100 ensures
 * that snapshot persistence can never block or exhaust the agent loop's
 * threads. When the queue is full, the snapshot is silently dropped (the
 * previous snapshot on disk remains valid).
 *
 * <p>
 * This is a Spring singleton ({@code @Component}) — it is stateless except
 * for configuration and the shared thread pool, so concurrent agent loops
 * can safely share one instance.
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "agent.state", name = "backend", havingValue = "file")
public class FileAgentStateStore implements AgentStateStore {

    private final ObjectMapper objectMapper;

    @Value("${agent.state.dir:/tmp/agent-states}")
    private String baseDir;

    /** Bounded executor: 2 threads, queue capacity 100, discard-oldest on overflow. */
    private ThreadPoolExecutor saveExecutor;

    public FileAgentStateStore(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    void init() {
        saveExecutor = new ThreadPoolExecutor(
                2, 2,
                0L, TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>(100),
                (r, executor) -> {
                    log.warn("AgentStateStore save queue full (capacity=100), dropping snapshot");
                    // Best-effort: never block the caller. The previous snapshot
                    // on disk remains valid.
                });
        log.info("FileAgentStateStore initialised: baseDir={}", baseDir);
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

    @Override
    public void save(String sessionId, AgentStateSnapshot snapshot) {
        if (sessionId == null || sessionId.isEmpty() || snapshot == null) {
            return;
        }
        try {
            CompletableFuture.runAsync(() -> doSave(sessionId, snapshot), saveExecutor);
        } catch (Exception e) {
            // runAsync should not throw, but be defensive
            log.warn("AgentStateStore.save rejected for sessionId={}: {}", sessionId, e.getMessage());
        }
    }

    @Override
    public void saveBytes(String sessionId, byte[] jsonBytes) {
        if (sessionId == null || sessionId.isEmpty() || jsonBytes == null) {
            return;
        }
        try {
            CompletableFuture.runAsync(() -> writeBytes(sessionId, jsonBytes), saveExecutor);
        } catch (Exception e) {
            log.warn("AgentStateStore.saveBytes rejected for sessionId={}: {}", sessionId, e.getMessage());
        }
    }

    private void doSave(String sessionId, AgentStateSnapshot snapshot) {
        try {
            byte[] json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(snapshot);
            writeBytes(sessionId, json);
            log.debug("AgentStateStore: saved snapshot for sessionId={}, iteration={}",
                    sessionId, snapshot.getIteration());
        } catch (Exception e) {
            log.warn("AgentStateStore: failed to serialize snapshot for sessionId={}: {}", sessionId, e.getMessage());
        }
    }

    /**
     * Shared file-writing logic used by both {@link #doSave} (which serializes
     * first) and {@link #saveBytes} (which receives pre-serialized bytes).
     *
     * <p>Uses a unique temp file name per save to avoid corruption when
     * concurrent saves for the same session overlap in the executor.
     * Falls back from {@code ATOMIC_MOVE} to a non-atomic move on
     * filesystems that don't support it, and cleans up the temp file on
     * failure.
     */
    private void writeBytes(String sessionId, byte[] json) {
        try {
            Path sessionsDir = Paths.get(baseDir, "sessions");
            Files.createDirectories(sessionsDir);
            Path file = sessionsDir.resolve(sessionId + ".json");
            // Unique temp file per save — prevents concurrent saves from
            // corrupting each other's temp file.
            Path tmp = sessionsDir.resolve(sessionId + "." + System.nanoTime() + ".json.tmp");
            Files.write(tmp, json);
            try {
                Files.move(tmp, file,
                        StandardCopyOption.REPLACE_EXISTING,
                        StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                log.warn("ATOMIC_MOVE not supported, falling back to non-atomic move: {}", e.getMessage());
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            } catch (Exception e) {
                log.warn("Failed to move snapshot file: {}", e.getMessage());
                Files.deleteIfExists(tmp); // cleanup orphaned temp file
            }
        } catch (Exception e) {
            log.warn("AgentStateStore: failed to write snapshot for sessionId={}: {}", sessionId, e.getMessage());
        }
    }

    @Override
    public AgentStateSnapshot load(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) {
            return null;
        }
        try {
            Path file = Paths.get(baseDir, "sessions", sessionId + ".json");
            if (!Files.exists(file)) {
                return null;
            }
            byte[] json = Files.readAllBytes(file);
            return objectMapper.readValue(json, AgentStateSnapshot.class);
        } catch (IOException e) {
            log.warn("AgentStateStore: failed to load snapshot for sessionId={}: {}", sessionId, e.getMessage());
            return null;
        }
    }

    @Override
    public boolean exists(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) {
            return false;
        }
        return Files.exists(Paths.get(baseDir, "sessions", sessionId + ".json"));
    }

    @Override
    public void delete(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) {
            return;
        }
        try {
            Path file = Paths.get(baseDir, "sessions", sessionId + ".json");
            Files.deleteIfExists(file);
            log.debug("AgentStateStore: deleted snapshot for sessionId={}", sessionId);
        } catch (IOException e) {
            log.warn("AgentStateStore: failed to delete snapshot for sessionId={}: {}", sessionId, e.getMessage());
        }
    }

    /**
     * Load the most recent snapshot for a conversation by scanning all
     * session files, deserializing each, filtering by conversationId, and
     * returning the one with the highest timestamp.
     *
     * <p>This is O(n) in the number of session files, but the number of
     * concurrent sessions is typically small, and this is only called on
     * recovery (not on the hot path).
     */
    @Override
    public AgentStateSnapshot loadLatest(String conversationId) {
        if (conversationId == null || conversationId.isEmpty()) {
            return null;
        }
        Path sessionsDir = Paths.get(baseDir, "sessions");
        if (!Files.isDirectory(sessionsDir)) {
            return null;
        }
        AgentStateSnapshot latest = null;
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(sessionsDir, "*.json")) {
            for (Path file : stream) {
                try {
                    byte[] json = Files.readAllBytes(file);
                    AgentStateSnapshot snapshot = objectMapper.readValue(json, AgentStateSnapshot.class);
                    if (conversationId.equals(snapshot.getConversationId())) {
                        if (latest == null || snapshot.getTimestamp() > latest.getTimestamp()) {
                            latest = snapshot;
                        }
                    }
                } catch (Exception e) {
                    // Skip corrupt files
                    log.debug("AgentStateStore.loadLatest: skipping unreadable file {}", file);
                }
            }
        } catch (IOException e) {
            log.warn("AgentStateStore.loadLatest: failed to scan sessions dir: {}", e.getMessage());
        }
        return latest;
    }
}
