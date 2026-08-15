package com.knowledge.agent.v2.event;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Shared serialization of {@link AgentEvent}s into the SSE-payload map.
 *
 * <p>Single source of truth used by BOTH the live SSE path and the durable
 * event log ({@code AgentTaskEventStore}), so a replayed record is byte-identical
 * to what a live client would have received (minus the {@code seq} envelope).
 */
public final class AgentEventSerializer {

    private AgentEventSerializer() {
    }

    /**
     * Convert an event to its JSON-serializable payload map. Callers add the
     * transport envelope ({@code seq} / {@code taskId}) as needed.
     */
    public static Map<String, Object> toPayload(AgentEvent event, String taskId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taskId", taskId);
        payload.put("sessionId", event.getSessionId());
        payload.put("timestamp", event.getTimestamp());

        if (event instanceof LifecycleEvent.SessionCreated) {
            LifecycleEvent.SessionCreated e = (LifecycleEvent.SessionCreated) event;
            payload.put("conversationId", e.getConversationId());
            payload.put("traceId", e.getTraceId());
        } else if (event instanceof LifecycleEvent.SessionCompleted) {
            LifecycleEvent.SessionCompleted e = (LifecycleEvent.SessionCompleted) event;
            payload.put("finishReason", e.getFinishReason());
            Map<String, Object> usage = new LinkedHashMap<>();
            usage.put("prompt", e.getPromptTokens());
            usage.put("completion", e.getCompletionTokens());
            usage.put("cacheHit", e.getPromptCacheHitTokens());
            usage.put("cacheMiss", e.getPromptCacheMissTokens());
            payload.put("usage", usage);
            payload.put("durationMs", e.getDurationMs());
        } else if (event instanceof LifecycleEvent.SessionFailed) {
            LifecycleEvent.SessionFailed e = (LifecycleEvent.SessionFailed) event;
            payload.put("errorCode", e.getErrorCode());
            payload.put("errorMessage", e.getErrorMessage());
            payload.put("retriable", e.isRetriable());
        } else if (event instanceof ThinkingEvent.ThinkStart) {
            payload.put("iteration", ((ThinkingEvent.ThinkStart) event).getIteration());
        } else if (event instanceof ThinkingEvent.ThinkDelta) {
            ThinkingEvent.ThinkDelta e = (ThinkingEvent.ThinkDelta) event;
            payload.put("type", e.getDeltaType().name().toLowerCase());
            payload.put("content", e.getContent());
        } else if (event instanceof ThinkingEvent.ThinkEnd) {
            ThinkingEvent.ThinkEnd e = (ThinkingEvent.ThinkEnd) event;
            payload.put("iteration", e.getIteration());
            payload.put("finishReason", e.getFinishReason());
            payload.put("promptTokens", e.getPromptTokens());
            payload.put("completionTokens", e.getCompletionTokens());
            payload.put("cacheHitTokens", e.getPromptCacheHitTokens());
            payload.put("cacheMissTokens", e.getPromptCacheMissTokens());
        } else if (event instanceof ToolEvent.ToolDispatched) {
            ToolEvent.ToolDispatched e = (ToolEvent.ToolDispatched) event;
            payload.put("toolCallId", e.getToolCallId());
            payload.put("toolName", e.getToolName());
            payload.put("arguments", e.getArguments());
            payload.put("location", e.getLocation().name());
        } else if (event instanceof ToolEvent.ToolCompleted) {
            ToolEvent.ToolCompleted e = (ToolEvent.ToolCompleted) event;
            payload.put("toolCallId", e.getToolCallId());
            payload.put("toolName", e.getToolName());
            payload.put("result", e.getResult());
            payload.put("durationMs", e.getDurationMs());
        } else if (event instanceof ToolEvent.ToolFailed) {
            ToolEvent.ToolFailed e = (ToolEvent.ToolFailed) event;
            payload.put("toolCallId", e.getToolCallId());
            payload.put("toolName", e.getToolName());
            payload.put("errorCode", e.getErrorCode());
            payload.put("errorMessage", e.getErrorMessage());
        } else if (event instanceof DelegationEvent) {
            DelegationEvent d = (DelegationEvent) event;
            payload.put("agentId", d.getAgentId());
            payload.put("parentAgentId", d.getParentAgentId());
            payload.put("depth", d.getDepth());
            if (event instanceof DelegationEvent.SubAgentSpawned) {
                DelegationEvent.SubAgentSpawned e = (DelegationEvent.SubAgentSpawned) event;
                payload.put("agentName", e.getAgentName());
                payload.put("taskDescription", e.getTaskDescription());
            } else if (event instanceof DelegationEvent.SubAgentProgress) {
                DelegationEvent.SubAgentProgress e = (DelegationEvent.SubAgentProgress) event;
                payload.put("iteration", e.getIteration());
                payload.put("status", e.getStatus());
            } else if (event instanceof DelegationEvent.SubAgentCompleted) {
                DelegationEvent.SubAgentCompleted e = (DelegationEvent.SubAgentCompleted) event;
                payload.put("result", e.getResult());
                payload.put("durationMs", e.getDurationMs());
                payload.put("success", e.isSuccess());
            } else if (event instanceof DelegationEvent.SubAgentOutput) {
                DelegationEvent.SubAgentOutput e = (DelegationEvent.SubAgentOutput) event;
                payload.put("content", e.getContent());
            } else if (event instanceof DelegationEvent.SubAgentReasoning) {
                DelegationEvent.SubAgentReasoning e = (DelegationEvent.SubAgentReasoning) event;
                payload.put("content", e.getContent());
            }
        } else if (event instanceof PlanEvent) {
            PlanEvent p = (PlanEvent) event;
            payload.put("planId", p.getToolCallId());
            Object plan = safeParsePlan(p.getPlanJson());
            if (plan != null) {
                payload.put("plan", plan);
            }
            if (event instanceof PlanEvent.PlanResolved) {
                PlanEvent.PlanResolved e = (PlanEvent.PlanResolved) event;
                payload.put("decision", e.getDecision());
                if (e.getFeedback() != null) {
                    payload.put("feedback", e.getFeedback());
                }
            }
        } else {
            payload.put("eventType", event.type());
        }
        return payload;
    }

    /**
     * Parse a plan artifact JSON into a structured object for the wire; falls
     * back to the raw string so a malformed plan never breaks serialization.
     */
    private static final ObjectMapper PLAN_MAPPER = new ObjectMapper();

    private static Object safeParsePlan(String planJson) {
        if (planJson == null || planJson.trim().isEmpty()) {
            return null;
        }
        try {
            return PLAN_MAPPER.readValue(planJson, Object.class);
        } catch (Exception e) {
            return planJson;
        }
    }
}
