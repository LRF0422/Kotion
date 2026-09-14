package com.knowledge.agent.core.checkpoint;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A live child run spawned by this run's {@code delegate} tool.
 *
 * <p>Child runs drive their own frontend tools (the client streams the child's
 * log and resumes the child directly), so the parent carries no pending tool
 * entries for them. This record is what lets the parent re-attach to live
 * children after a crash and still report their terminal state.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DelegationRecord {

    /** Parent-side delegate tool call id (correlation for sub.spawned). */
    private String callId;

    /** Child run id. */
    private String subRunId;

    /** The delegated task text (for recovery logs / tool messages). */
    private String task;

    /** Epoch millis when the child was spawned (delegation timeout base). */
    private long spawnedAt;
}
