package com.knowledge.agent.v2.job;

/**
 * Lifecycle of an async long-running agent job.
 *
 * <pre>
 * QUEUED → RUNNING → SUSPENDED/WAITING_TOOLS → RUNNING → COMPLETED
 *                       ↓                          ↘ FAILED / CANCELLED
 * </pre>
 *
 * <p>{@link #SUSPENDED} and {@link #WAITING_TOOLS} are pausable (resumable)
 * states; {@link #isTerminal()} is true only for the three end states.
 */
public enum AgentJobStatus {
    QUEUED,
    RUNNING,
    SUSPENDED,
    WAITING_TOOLS,
    COMPLETED,
    FAILED,
    CANCELLED;

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == CANCELLED;
    }

    public boolean isPaused() {
        return this == SUSPENDED || this == WAITING_TOOLS;
    }
}
