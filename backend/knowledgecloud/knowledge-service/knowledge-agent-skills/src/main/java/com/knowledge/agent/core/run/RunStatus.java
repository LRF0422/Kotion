package com.knowledge.agentcore.run;

/**
 * AgentCore run lifecycle.
 *
 * <pre>
 * QUEUED → RUNNING ⇄ WAITING_TOOLS   (frontend/editor tool results pending)
 *                ⇄ SUSPENDED         (plan approval / budget exhausted)
 *          → COMPLETED | FAILED | CANCELLED
 * </pre>
 */
public enum RunStatus {

    QUEUED,
    RUNNING,
    WAITING_TOOLS,
    SUSPENDED,
    COMPLETED,
    FAILED,
    CANCELLED;

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == CANCELLED;
    }

    public boolean isActive() {
        return !isTerminal();
    }
}
