package com.knowledge.agent.orchestrator;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * File-based store for {@link AgentSpec} definitions.
 *
 * <p>
 * Persists generated agent definitions as JSON files under
 * {@code {baseDir}/agent-definitions/{name}.json}. The orchestrator can
 * optionally call {@link #save(AgentSpec)} to persist generated agent
 * definitions for future reuse (e.g. caching common decomposition patterns).
 *
 * <p>
 * Follows the same async-write pattern as {@link com.knowledge.agent.store.FileAgentStateStore}:
 * a bounded thread pool of 2 workers with a queue of 100 ensures that
 * persistence can never block or exhaust threads. When the queue is full,
 * the save is silently dropped.
 *
 * <p>
 * This is a Spring singleton ({@code @Component}) — it is stateless except
 * for configuration and the shared thread pool, so concurrent orchestrator
 * calls can safely share one instance.
 */
@Slf4j
@Component
public class AgentDefinitionStore {

    private final ObjectMapper objectMapper;

    @Value("${agent.state.dir:/tmp/agent-states}")
    private String baseDir;

    /** Bounded executor: 2 threads, queue capacity 100, discard on overflow. */
    private ThreadPoolExecutor saveExecutor;

    public AgentDefinitionStore(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    void init() {
        saveExecutor = new ThreadPoolExecutor(
                2, 2,
                0L, TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>(100),
                (r, executor) -> {
                    log.warn("AgentDefinitionStore save queue full (capacity=100), dropping save");
                });
        log.info("AgentDefinitionStore initialised: baseDir={}", baseDir);
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

    /**
     * Save an agent definition to disk asynchronously.
     *
     * @param spec the agent spec to persist (keyed by {@code spec.name})
     */
    public void save(AgentSpec spec) {
        if (spec == null || spec.getName() == null || spec.getName().isEmpty()) {
            return;
        }
        try {
            CompletableFuture.runAsync(() -> doSave(spec), saveExecutor);
        } catch (Exception e) {
            log.warn("AgentDefinitionStore.save rejected for '{}': {}",
                    spec.getName(), e.getMessage());
        }
    }

    private void doSave(AgentSpec spec) {
        try {
            Path dir = Paths.get(baseDir, "agent-definitions");
            Files.createDirectories(dir);
            Path file = dir.resolve(sanitizeFileName(spec.getName()) + ".json");
            byte[] json = objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValueAsBytes(spec);
            // Write atomically: temp then move
            Path tmp = dir.resolve(spec.getName() + ".json.tmp");
            Files.write(tmp, json);
            Files.move(tmp, file,
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                    java.nio.file.StandardCopyOption.ATOMIC_MOVE);
            log.debug("AgentDefinitionStore: saved agent definition '{}'", spec.getName());
        } catch (Exception e) {
            log.warn("AgentDefinitionStore: failed to save '{}': {}",
                    spec.getName(), e.getMessage());
        }
    }

    /**
     * Load an agent definition by name.
     *
     * @param name the agent name (filename without extension)
     * @return the loaded {@link AgentSpec}, or null if not found / error
     */
    public AgentSpec load(String name) {
        if (name == null || name.isEmpty()) {
            return null;
        }
        try {
            Path file = Paths.get(baseDir, "agent-definitions",
                    sanitizeFileName(name) + ".json");
            if (!Files.exists(file)) {
                return null;
            }
            byte[] json = Files.readAllBytes(file);
            return objectMapper.readValue(json, AgentSpec.class);
        } catch (IOException e) {
            log.warn("AgentDefinitionStore: failed to load '{}': {}", name, e.getMessage());
            return null;
        }
    }

    /**
     * List all saved agent definition names.
     *
     * @return list of names (without the .json extension)
     */
    public List<String> listAll() {
        List<String> names = new ArrayList<>();
        Path dir = Paths.get(baseDir, "agent-definitions");
        if (!Files.isDirectory(dir)) {
            return names;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.json")) {
            for (Path file : stream) {
                String fileName = file.getFileName().toString();
                if (fileName.endsWith(".json")) {
                    names.add(fileName.substring(0, fileName.length() - 5));
                }
            }
        } catch (IOException e) {
            log.warn("AgentDefinitionStore: failed to list definitions: {}", e.getMessage());
        }
        return names;
    }

    /**
     * Delete an agent definition by name.
     *
     * @param name the agent name (filename without extension)
     */
    public void delete(String name) {
        if (name == null || name.isEmpty()) {
            return;
        }
        try {
            Path file = Paths.get(baseDir, "agent-definitions",
                    sanitizeFileName(name) + ".json");
            Files.deleteIfExists(file);
            log.debug("AgentDefinitionStore: deleted agent definition '{}'", name);
        } catch (IOException e) {
            log.warn("AgentDefinitionStore: failed to delete '{}': {}", name, e.getMessage());
        }
    }

    /**
     * Sanitize a name for use as a filename (strip path separators, etc.).
     */
    private String sanitizeFileName(String name) {
        return name.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
