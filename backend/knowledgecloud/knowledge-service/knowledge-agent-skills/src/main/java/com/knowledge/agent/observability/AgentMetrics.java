package com.knowledge.agent.observability;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Observability seam for the agent harness.
 *
 * <p><b>P0 implementation</b>: structured logging only — intentionally free of
 * any Micrometer / Actuator dependency so it can ship with zero new libraries.
 * Each method emits a single structured line that a log pipeline can scrape into
 * metrics. A later phase can swap the body for a {@code MeterRegistry}-backed
 * implementation (or subclass) once that dependency is approved, without
 * touching call sites.
 *
 * <p>All methods are null-tolerant and must never throw — instrumentation must
 * not be able to break the request path.
 */
@Slf4j
@Component
public class AgentMetrics {

    /** Mark the start of a chat turn. Returns a start timestamp (epoch millis). */
    public long turnStarted(String traceId, String conversationId, String model) {
        log.info("[agent.turn.start] trace={} conversation={} model={}", traceId, conversationId, model);
        return System.currentTimeMillis();
    }

    /** Mark a chat turn finished normally. */
    public void turnFinished(String traceId, long startedAtMs) {
        long durationMs = Math.max(0L, System.currentTimeMillis() - startedAtMs);
        log.info("[agent.turn.duration] trace={} status=ok durationMs={}", traceId, durationMs);
    }

    /** Mark a chat turn finished with an error. */
    public void turnFailed(String traceId, long startedAtMs, String reason) {
        long durationMs = Math.max(0L, System.currentTimeMillis() - startedAtMs);
        log.warn("[agent.turn.duration] trace={} status=error durationMs={} reason={}",
                traceId, durationMs, reason);
    }

    /** Record an error occurrence, tagged by error code (may be null). */
    public void recordError(String traceId, String code, String message) {
        log.warn("[agent.errors] trace={} code={} message={}", traceId, code, message);
    }

    /**
     * Record LLM call latency for one iteration. Hooked from the harness loop in
     * a later phase; provided now so call sites can be wired incrementally.
     */
    public void recordLlmLatency(String traceId, String model, long latencyMs) {
        log.info("[agent.llm.latency] trace={} model={} latencyMs={}", traceId, model, latencyMs);
    }

    /** Record token usage for a finished turn. */
    public void recordTokens(String traceId, int promptTokens, int completionTokens) {
        log.info("[agent.tokens] trace={} prompt={} completion={}", traceId, promptTokens, completionTokens);
    }
}
