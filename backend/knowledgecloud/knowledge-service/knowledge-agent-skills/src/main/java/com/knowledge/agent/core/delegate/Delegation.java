package com.knowledge.agent.core.delegate;

import com.knowledge.agent.core.event.EventSubscription;
import com.knowledge.agent.core.event.RunEvent;
import lombok.Data;

/**
 * One live sub-agent delegation: the child run handle, its event subscription
 * (drained by the parent loop) and the terminal event once the child finishes.
 *
 * <p>Delegation is asynchronous: the parent snapshots the child handle here and
 * keeps working. A settled child is only "delivered" once its result has been
 * written into the parent conversation (as a {@code wait_for_children} tool
 * result or as a context notification), and {@link #delivered} makes that
 * delivery idempotent.
 */
@Data
public class Delegation {

    /** The parent-side delegate tool call id. */
    private String callId;

    private String subRunId;

    private String task;

    private long spawnedAt;

    private long timeoutMs;

    /** Live subscription to the child's event log. */
    private EventSubscription subscription;

    /** Child terminal event (run.completed / run.failed / run.cancelled). */
    private volatile RunEvent terminal;

    /** Delegate depth of the child (for re-attach bookkeeping). */
    private int childDepth;

    /**
     * True once this child's result reached the parent conversation. Guards
     * against delivering the same result twice in one process; across a crash
     * the guarantee comes from writing the result message and dropping the
     * recovery record in the same checkpoint save.
     */
    private volatile boolean delivered;

    public boolean isExpired(long now) {
        return now - spawnedAt > timeoutMs;
    }

    /** The child reached a terminal state (result still undelivered). */
    public boolean isSettled() {
        return terminal != null;
    }
}
