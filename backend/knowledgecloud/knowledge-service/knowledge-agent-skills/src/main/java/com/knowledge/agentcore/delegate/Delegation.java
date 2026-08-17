package com.knowledge.agentcore.delegate;

import com.knowledge.agentcore.event.EventSubscription;
import com.knowledge.agentcore.event.RunEvent;
import lombok.Data;

/**
 * One live sub-agent delegation: the child run handle, its event subscription
 * (drained by the parent loop) and the terminal event once the child finishes.
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

    public boolean isExpired(long now) {
        return now - spawnedAt > timeoutMs;
    }
}
