package com.knowledge.agent.core.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * One durable agent event. Every event carries a run-scoped monotonic
 * {@code seq}; payloads are JSON-serializable maps (typed helpers in
 * {@link RunEvents}).
 *
 * <p>Event types: run.created, step.started, text.delta, reasoning.delta,
 * tool.requested, tool.completed, sub.spawned, sub.completed, sub.failed,
 * plan.proposed, run.suspended, run.completed, run.failed, run.cancelled.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RunEvent {

    private long seq;

    private String type;

    private Map<String, Object> payload;

    private long createTime;

    /** Whether this event terminates the run. */
    public boolean isTerminal() {
        return "run.completed".equals(type) || "run.failed".equals(type) || "run.cancelled".equals(type);
    }
}
