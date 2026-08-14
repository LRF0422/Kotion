package com.knowledge.agent.observability;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Lightweight counters for the async task lifecycle.
 *
 * <p>Deliberately dependency-free (like {@link AgentMetrics}): counters are
 * exposed through {@link #snapshot()} for the admin metrics endpoint and
 * logged periodically. A later phase can publish them to a
 * {@code MeterRegistry} without touching call sites.
 */
@Slf4j
@Component
public class AgentJobMetrics {

    private final AtomicLong created = new AtomicLong();
    private final AtomicLong completed = new AtomicLong();
    private final AtomicLong failed = new AtomicLong();
    private final AtomicLong cancelled = new AtomicLong();
    private final AtomicLong suspended = new AtomicLong();
    private final AtomicLong revived = new AtomicLong();

    public void taskCreated() {
        created.incrementAndGet();
    }

    public void taskCompleted() {
        completed.incrementAndGet();
    }

    public void taskFailed() {
        failed.incrementAndGet();
    }

    public void taskCancelled() {
        cancelled.incrementAndGet();
    }

    /** Task paused (frontend tools / budget exhaustion) — counted once per pause. */
    public void taskSuspended() {
        suspended.incrementAndGet();
    }

    public void taskRevived() {
        revived.incrementAndGet();
    }

    /** Snapshot for the admin metrics endpoint. */
    public Map<String, Object> snapshot() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("created", created.get());
        out.put("completed", completed.get());
        out.put("failed", failed.get());
        out.put("cancelled", cancelled.get());
        out.put("suspended", suspended.get());
        out.put("revived", revived.get());
        return out;
    }
}
