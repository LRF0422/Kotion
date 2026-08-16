package com.knowledge.agent.v3;

/** V3 task lifecycle. Keep states explicit; no overloaded SUSPENDED semantics. */
public enum AgentTaskStatus {
    CREATED,
    QUEUED,
    RUNNING,
    WAITING_TOOLS,
    WAITING_APPROVAL,
    SUSPENDED,
    COMPLETED,
    FAILED,
    CANCELLED;

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == CANCELLED;
    }

    public boolean isPaused() {
        return this == WAITING_TOOLS || this == WAITING_APPROVAL || this == SUSPENDED;
    }
}
