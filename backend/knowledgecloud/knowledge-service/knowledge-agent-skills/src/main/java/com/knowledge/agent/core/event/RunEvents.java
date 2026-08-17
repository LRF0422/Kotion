package com.knowledge.agent.core.event;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Typed factories for event payloads — the single source of truth for the
 * event protocol (mirrored in {@code docs/agent-redesign.md} §8).
 */
public final class RunEvents {

    private RunEvents() {
    }

    public static final String RUN_CREATED = "run.created";
    public static final String STEP_STARTED = "step.started";
    public static final String TEXT_DELTA = "text.delta";
    public static final String REASONING_DELTA = "reasoning.delta";
    public static final String TOOL_REQUESTED = "tool.requested";
    public static final String TOOL_COMPLETED = "tool.completed";
    public static final String SUB_SPAWNED = "sub.spawned";
    public static final String SUB_COMPLETED = "sub.completed";
    public static final String SUB_FAILED = "sub.failed";
    public static final String PLAN_PROPOSED = "plan.proposed";
    public static final String RUN_SUSPENDED = "run.suspended";
    public static final String RUN_COMPLETED = "run.completed";
    public static final String RUN_FAILED = "run.failed";
    public static final String RUN_CANCELLED = "run.cancelled";

    public static Map<String, Object> payload(Object... kv) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            map.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return map;
    }

    public static Map<String, Object> runCreated(String runId, String conversationId, String model, String mode) {
        return payload("runId", runId, "conversationId", conversationId, "model", model, "mode", mode);
    }

    public static Map<String, Object> stepStarted(int step) {
        return payload("step", step);
    }

    public static Map<String, Object> textDelta(String content) {
        return payload("content", content);
    }

    public static Map<String, Object> reasoningDelta(String content) {
        return payload("content", content);
    }

    public static Map<String, Object> toolRequested(String callId, String tool, String argsJson) {
        return payload("callId", callId, "tool", tool, "args", argsJson);
    }

    public static Map<String, Object> toolCompleted(String callId, String tool, boolean ok,
                                                    Object result, String error, long durationMs) {
        return payload("callId", callId, "tool", tool, "ok", ok,
                "result", result, "error", error, "durationMs", durationMs);
    }

    public static Map<String, Object> subSpawned(String callId, String subRunId, String task) {
        return payload("callId", callId, "subRunId", subRunId, "task", task);
    }

    public static Map<String, Object> subCompleted(String callId, String subRunId, boolean ok, Object result) {
        return payload("callId", callId, "subRunId", subRunId, "ok", ok, "result", result);
    }

    public static Map<String, Object> subFailed(String callId, String subRunId, String error) {
        return payload("callId", callId, "subRunId", subRunId, "ok", false, "error", error);
    }

    public static Map<String, Object> planProposed(String callId, String planJson) {
        return payload("callId", callId, "plan", planJson);
    }

    public static Map<String, Object> runSuspended(String reason, Object pendingCallIds) {
        return payload("reason", reason, "pendingCallIds", pendingCallIds);
    }

    public static Map<String, Object> runCompleted(String finishReason, long promptTokens, long completionTokens) {
        return payload("finishReason", finishReason,
                "usage", payload("promptTokens", promptTokens, "completionTokens", completionTokens));
    }

    public static Map<String, Object> runFailed(String code, String error) {
        return payload("code", code, "error", error);
    }

    public static Map<String, Object> runCancelled() {
        return payload();
    }
}
