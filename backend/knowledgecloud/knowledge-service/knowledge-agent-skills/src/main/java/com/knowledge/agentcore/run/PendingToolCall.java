package com.knowledge.agentcore.run;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A frontend-dispatched tool call that paused the run: the loop emitted
 * {@code tool.requested} and is now waiting for the client to execute the
 * tool and resume with a result. Part of the checkpoint so a crashed run
 * restarts knowing exactly what it is waiting for.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PendingToolCall {

    /** Stable tool-call id (LLM-generated; resume idempotency key). */
    private String callId;

    /** Tool name, e.g. editor.insert. */
    private String tool;

    /** Tool arguments (JSON object). */
    private String argsJson;

    /** Epoch millis when the call was dispatched to the client. */
    private long requestedAt;

    /** Sub-run id when this call belongs to a delegated child (null = parent). */
    private String subRunId;

    /** Parent-side delegate call id (recovery correlation for sub.spawned). */
    private String delegateCallId;

    public static PendingToolCall of(String callId, String tool, String argsJson, long requestedAt) {
        return new PendingToolCall(callId, tool, argsJson, requestedAt, null, null);
    }

    public static PendingToolCall ofSub(String callId, String tool, String argsJson, long requestedAt,
                                        String subRunId, String delegateCallId) {
        return new PendingToolCall(callId, tool, argsJson, requestedAt, subRunId, delegateCallId);
    }
}
