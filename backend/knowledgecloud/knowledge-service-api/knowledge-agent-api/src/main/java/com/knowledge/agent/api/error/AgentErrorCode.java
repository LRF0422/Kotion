package com.knowledge.agent.api.error;

/**
 * Structured error taxonomy for the agent harness.
 *
 * <p>The {@code code} lets the frontend react differently per failure class
 * (auto-retry vs. surface-to-user vs. recoverable-by-model). Each code carries
 * a default {@link #isRetriableByDefault() retriable} hint, but the harness may
 * override it per occurrence via {@link AgentError#isRetriable()}.
 *
 * <p>Wire-compatible: emitted only as an optional {@code code} string on the
 * existing error frame, so older clients ignore it.
 */
public enum AgentErrorCode {

    // ---- LLM layer (usually transient / retriable) ----
    /** LLM call exceeded the first-token or idle timeout. */
    LLM_TIMEOUT(true),
    /** LLM provider returned 429 / rate limit. */
    LLM_RATE_LIMIT(true),
    /** LLM provider unreachable / 5xx / circuit open. */
    LLM_UNAVAILABLE(true),

    // ---- Tool layer (recoverable by feeding the error back to the model) ----
    /** A tool execution exceeded its per-tool timeout. */
    TOOL_TIMEOUT(false),
    /** A tool threw or returned a failure result. */
    TOOL_FAILED(false),

    // ---- Budget / context ----
    /** Context window overflow that could not be compressed. */
    CONTEXT_OVERFLOW(false),
    /** Run budget (depth / time / tokens / sub-agents) exhausted. */
    BUDGET_EXCEEDED(false),

    // ---- Plan mode ----
    /** A mutating tool was requested while in PLAN mode. */
    PLAN_MODE_VIOLATION(false),

    // ---- Terminal ----
    /** The run was cancelled (client disconnect / abort). */
    CANCELLED(false),
    /** Unclassified internal error. */
    INTERNAL(false);

    private final boolean retriableByDefault;

    AgentErrorCode(boolean retriableByDefault) {
        this.retriableByDefault = retriableByDefault;
    }

    /**
     * Whether this class of error is, by default, safe to retry automatically.
     * The harness may still override per occurrence.
     */
    public boolean isRetriableByDefault() {
        return retriableByDefault;
    }
}
