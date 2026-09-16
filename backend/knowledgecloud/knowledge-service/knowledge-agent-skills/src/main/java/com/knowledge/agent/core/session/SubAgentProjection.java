package com.knowledge.agent.core.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import com.knowledge.agent.core.event.RunEvent;
import com.knowledge.agent.core.event.RunEventLog;
import com.knowledge.agent.core.event.RunEvents;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Projects a parent run's delegated sub-agent activity from the durable run log
 * into the shape the chat UI's {@code SubAgentTree} renders.
 *
 * <p>The parent log only carries {@code sub.spawned}/{@code sub.completed}/
 * {@code sub.failed}; a child's own text, reasoning and tool calls live in the
 * CHILD's log. This reducer replays both so {@code SessionTranscriptProjector}
 * can persist the delegation panel into {@code agent_chat_session.messages_json}
 * — the panel then survives a reload on any browser instead of relying on a
 * client-side cache.
 *
 * <p>The reduction deliberately mirrors the frontend's {@code applySubRunEvent}
 * (packages/common/src/ai/agent/editor-agent-state.ts) so a restored tree
 * matches the live one: per-step text/reasoning with the same id scheme
 * ({@code step-<seq>}), the same answer-step selection, and child tool calls
 * shaped like the UI's execution steps (tagged with {@code subRunId}).
 */
@Slf4j
@Component
public class SubAgentProjection {

    /** Mirrors editor-agent-state.ts: preview cap and per-step cap. */
    private static final int PREVIEW_CHARS = 400;
    private static final int STEP_MAX_CHARS = 24000;
    /** Task/result/error caps so one row cannot bloat the projection column. */
    private static final int FIELD_MAX_CHARS = 8000;
    /** Per-tool-result cap (child frontend tools can return large structures). */
    private static final int TOOL_RESULT_MAX_CHARS = 8000;
    private static final int REPLAY_PAGE = 500;
    private static final int MAX_EVENTS = 20000;

    private final RunEventLog eventLog;
    private final ObjectMapper objectMapper;

    public SubAgentProjection(RunEventLog eventLog, ObjectMapper objectMapper) {
        this.eventLog = eventLog;
        this.objectMapper = objectMapper;
    }

    /** One parent run's delegated children, ready to overlay on the UI projection. */
    public static final class Projection {
        /** sub.agent nodes keyed by the parent's delegate tool-call id. */
        private final Map<String, ObjectNode> subRuns = new LinkedHashMap<>();
        /** Child tool calls as UI execution steps, keyed by the same call id. */
        private final Map<String, ArrayNode> toolSteps = new LinkedHashMap<>();

        public Map<String, ObjectNode> subRuns() {
            return subRuns;
        }

        public Map<String, ArrayNode> toolSteps() {
            return toolSteps;
        }

        public boolean isEmpty() {
            return subRuns.isEmpty() && toolSteps.isEmpty();
        }
    }

    /** Reduce {@code parentRunId}'s direct children (empty when it delegated none). */
    public Projection project(String parentRunId) {
        Projection projection = new Projection();
        if (parentRunId == null || parentRunId.trim().isEmpty()) {
            return projection;
        }
        Map<String, ObjectNode> bySubRunId = new LinkedHashMap<>();
        for (RunEvent event : replayAll(parentRunId)) {
            String type = event.getType();
            if (RunEvents.SUB_SPAWNED.equals(type)) {
                String callId = str(event, "callId");
                String subRunId = str(event, "subRunId");
                if (callId == null || callId.isEmpty() || subRunId == null || subRunId.isEmpty()) {
                    continue;
                }
                if (projection.subRuns.containsKey(callId)) {
                    continue; // replayed/reconnected streams can re-deliver a spawn
                }
                ObjectNode node = objectMapper.createObjectNode();
                node.put("callId", callId);
                node.put("subRunId", subRunId);
                String task = str(event, "task");
                if (task != null) {
                    node.put("task", truncate(task, FIELD_MAX_CHARS));
                }
                String name = str(event, "agentName");
                if (name != null && !name.trim().isEmpty()) {
                    node.put("name", name.trim());
                }
                String description = str(event, "description");
                if (description != null && !description.trim().isEmpty()) {
                    node.put("description", description.trim());
                }
                node.put("status", "running");
                fillChild(node, subRunId, projection.toolSteps, callId);
                projection.subRuns.put(callId, node);
                bySubRunId.put(subRunId, node);
            } else if (RunEvents.SUB_COMPLETED.equals(type)) {
                ObjectNode node = bySubRunId.get(str(event, "subRunId"));
                if (node == null) {
                    continue;
                }
                boolean ok = bool(event, "ok");
                node.put("status", ok ? "completed" : "failed");
                Object result = payloadValue(event, "result");
                if (result != null) {
                    node.set("result", bounded(result, FIELD_MAX_CHARS));
                    JsonNode usage = usageOf(result);
                    if (usage != null) {
                        node.set("usage", usage);
                    }
                }
            } else if (RunEvents.SUB_FAILED.equals(type)) {
                ObjectNode node = bySubRunId.get(str(event, "subRunId"));
                if (node == null) {
                    continue;
                }
                node.put("status", "failed");
                Object error = payloadValue(event, "error");
                if (error != null) {
                    node.set("error", bounded(error, FIELD_MAX_CHARS));
                }
            }
        }
        return projection;
    }

    // ==================== one child's own log ====================

    /**
     * Reduce a child's event log onto its node: the step timeline
     * (reasoning/text), the chosen answer step, terminal token usage, and the
     * child's own frontend tool calls exported as UI execution steps.
     */
    private void fillChild(ObjectNode node, String childRunId,
                           Map<String, ArrayNode> toolStepsOut, String delegateCallId) {
        ArrayNode steps = objectMapper.createArrayNode();
        ArrayNode toolCalls = objectMapper.createArrayNode();
        Map<String, Integer> stepNumberById = new LinkedHashMap<>();
        String activeStepId = null;
        String answerStepId = null;
        String textPreview = null;
        String reasoningPreview = null;
        JsonNode usage = null;

        for (RunEvent event : replayAll(childRunId)) {
            switch (event.getType()) {
                case RunEvents.STEP_STARTED: {
                    String id = "step-" + event.getSeq();
                    activeStepId = id;
                    if (!hasStep(steps, id)) {
                        int number = intOf(event, "step");
                        addStep(steps, id, number > 0 ? number : 1, event.getSeq(), "", "");
                        stepNumberById.put(id, number > 0 ? number : 1);
                    }
                    break;
                }
                case RunEvents.TEXT_DELTA: {
                    String content = str(event, "content");
                    if (content == null || content.isEmpty()) {
                        break;
                    }
                    String id = appendStep(steps, stepNumberById, activeStepId, event.getSeq(), "text", content);
                    activeStepId = id;
                    if (!content.trim().isEmpty()) {
                        answerStepId = id;
                    }
                    textPreview = preview(textPreview, content);
                    break;
                }
                case RunEvents.REASONING_DELTA: {
                    String content = str(event, "content");
                    if (content == null || content.isEmpty()) {
                        break;
                    }
                    String id = appendStep(steps, stepNumberById, activeStepId, event.getSeq(), "reasoning", content);
                    activeStepId = id;
                    reasoningPreview = preview(reasoningPreview, content);
                    break;
                }
                case RunEvents.TOOL_REQUESTED: {
                    String callId = str(event, "callId");
                    if (callId == null || callId.isEmpty() || hasToolCall(toolCalls, callId)) {
                        break;
                    }
                    ObjectNode call = objectMapper.createObjectNode();
                    call.put("callId", callId);
                    String tool = str(event, "tool");
                    call.put("tool", tool == null ? "tool" : tool);
                    call.put("status", "running");
                    call.set("args", parseJson(str(event, "args")));
                    call.put("subRunId", childRunId);
                    call.put("startedSeq", event.getSeq());
                    if (activeStepId != null) {
                        call.put("stepId", activeStepId);
                        Integer number = stepNumberById.get(activeStepId);
                        if (number != null) {
                            call.put("step", number);
                        }
                    }
                    toolCalls.add(call);
                    break;
                }
                case RunEvents.TOOL_COMPLETED: {
                    String callId = str(event, "callId");
                    if (callId == null || callId.isEmpty()) {
                        break;
                    }
                    ObjectNode call = findToolCall(toolCalls, callId);
                    if (call == null) {
                        call = objectMapper.createObjectNode();
                        call.put("callId", callId);
                        String tool = str(event, "tool");
                        call.put("tool", tool == null ? "tool" : tool);
                        call.set("args", objectMapper.createObjectNode());
                        call.put("subRunId", childRunId);
                        call.put("startedSeq", event.getSeq());
                        toolCalls.add(call);
                    }
                    call.put("status", bool(event, "ok") ? "success" : "error");
                    call.put("completedSeq", event.getSeq());
                    Object result = payloadValue(event, "result");
                    if (result != null) {
                        call.set("result", bounded(result, TOOL_RESULT_MAX_CHARS));
                    }
                    Object error = payloadValue(event, "error");
                    if (error != null) {
                        call.set("error", bounded(error, TOOL_RESULT_MAX_CHARS));
                    }
                    Object duration = payloadValue(event, "durationMs");
                    if (duration instanceof Number) {
                        call.put("durationMs", ((Number) duration).longValue());
                    }
                    break;
                }
                case RunEvents.RUN_COMPLETED:
                case RunEvents.RUN_FAILED:
                case RunEvents.RUN_CANCELLED: {
                    JsonNode terminalUsage = usageNode(payloadValue(event, "usage"));
                    if (terminalUsage != null) {
                        usage = terminalUsage;
                    }
                    break;
                }
                default:
                    break;
            }
        }

        node.set("steps", steps);
        if (answerStepId != null) {
            node.put("answerStepId", answerStepId);
        }
        if (textPreview != null) {
            node.put("text", textPreview);
        }
        if (reasoningPreview != null) {
            node.put("reasoning", reasoningPreview);
        }
        if (usage != null) {
            node.set("usage", usage);
        }
        if (toolCalls.size() > 0) {
            ArrayNode exported = objectMapper.createArrayNode();
            for (JsonNode call : toolCalls) {
                exported.add(toExecutionStep((ObjectNode) call));
            }
            toolStepsOut.put(delegateCallId, exported);
        }
    }

    /** Reshape a recorded child tool call into the UI's ExecutionStep shape. */
    private ObjectNode toExecutionStep(ObjectNode call) {
        ObjectNode step = objectMapper.createObjectNode();
        String callId = call.path("callId").asText("");
        step.put("id", callId);
        step.put("callId", callId);
        step.put("toolName", call.path("tool").asText("tool"));
        step.set("args", call.path("args"));
        if (call.has("result")) {
            step.set("result", call.path("result"));
        }
        if (call.has("error")) {
            step.set("error", call.path("error"));
        }
        step.put("status", call.path("status").asText("success"));
        step.put("timestamp", 0);
        if (call.has("step")) {
            step.put("step", call.path("step").asInt());
        }
        if (call.has("stepId")) {
            step.put("stepId", call.path("stepId").asText());
        }
        long sequence = call.path("startedSeq").asLong(0);
        if (sequence > 0) {
            step.put("sequence", sequence);
        }
        if (call.has("durationMs")) {
            step.put("duration", call.path("durationMs").asLong());
        }
        step.put("subRunId", call.path("subRunId").asText());
        return step;
    }

    // ==================== step helpers ====================

    private boolean hasStep(ArrayNode steps, String id) {
        for (JsonNode step : steps) {
            if (id.equals(step.path("id").asText())) {
                return true;
            }
        }
        return false;
    }

    private void addStep(ArrayNode steps, String id, int number, long startedSeq, String reasoning, String text) {
        ObjectNode step = objectMapper.createObjectNode();
        step.put("id", id);
        step.put("step", number);
        step.put("startedSeq", startedSeq);
        step.put("reasoning", reasoning);
        step.put("text", text);
        steps.add(step);
    }

    /** Append a delta to a step, creating it when no step.started preceded it. */
    private String appendStep(ArrayNode steps, Map<String, Integer> stepNumberById,
                              String activeStepId, long seq, String field, String content) {
        String id = activeStepId != null ? activeStepId : "step-" + seq;
        ObjectNode target = null;
        for (JsonNode step : steps) {
            if (id.equals(step.path("id").asText())) {
                target = (ObjectNode) step;
                break;
            }
        }
        if (target == null) {
            int number = stepNumberById.getOrDefault(id, 1);
            addStep(steps, id, number, seq, "", "");
            target = (ObjectNode) steps.get(steps.size() - 1);
            stepNumberById.putIfAbsent(id, number);
        }
        String merged = target.path(field).asText("") + content;
        target.put(field, merged.length() > STEP_MAX_CHARS ? merged.substring(0, STEP_MAX_CHARS) : merged);
        return id;
    }

    private String preview(String current, String delta) {
        String merged = (current == null ? "" : current) + delta;
        return merged.length() > PREVIEW_CHARS ? merged.substring(merged.length() - PREVIEW_CHARS) : merged;
    }

    private boolean hasToolCall(ArrayNode toolCalls, String callId) {
        return findToolCall(toolCalls, callId) != null;
    }

    private ObjectNode findToolCall(ArrayNode toolCalls, String callId) {
        for (JsonNode call : toolCalls) {
            if (callId.equals(call.path("callId").asText())) {
                return (ObjectNode) call;
            }
        }
        return null;
    }

    // ==================== event/log helpers ====================

    private List<RunEvent> replayAll(String runId) {
        List<RunEvent> all = new ArrayList<>();
        long after = 0;
        while (all.size() < MAX_EVENTS) {
            List<RunEvent> page = eventLog.replay(runId, after, REPLAY_PAGE);
            if (page == null || page.isEmpty()) {
                break;
            }
            for (RunEvent event : page) {
                if (event == null) {
                    continue;
                }
                all.add(event);
                after = Math.max(after, event.getSeq());
            }
            if (page.size() < REPLAY_PAGE) {
                break;
            }
        }
        return all;
    }

    private Object payloadValue(RunEvent event, String key) {
        Map<String, Object> payload = event.getPayload();
        return payload == null ? null : payload.get(key);
    }

    private String str(RunEvent event, String key) {
        Object value = payloadValue(event, key);
        return value == null ? null : String.valueOf(value);
    }

    private boolean bool(RunEvent event, String key) {
        Object value = payloadValue(event, key);
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        return value != null && Boolean.parseBoolean(String.valueOf(value));
    }

    private int intOf(RunEvent event, String key) {
        Object value = payloadValue(event, key);
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        try {
            return value == null ? 0 : Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** Extract a {@code usage} node from a sub.completed result wrapper. */
    private JsonNode usageOf(Object value) {
        if (!(value instanceof Map)) {
            return null;
        }
        return usageNode(((Map<?, ?>) value).get("usage"));
    }

    /** Build a usage node from a raw {@code usage} map. */
    private JsonNode usageNode(Object usage) {
        if (!(usage instanceof Map)) {
            return null;
        }
        Object prompt = ((Map<?, ?>) usage).get("promptTokens");
        if (prompt == null) {
            return null;
        }
        ObjectNode node = objectMapper.createObjectNode();
        node.put("promptTokens", longOf(((Map<?, ?>) usage).get("promptTokens")));
        node.put("completionTokens", longOf(((Map<?, ?>) usage).get("completionTokens")));
        node.put("cachedPromptTokens", longOf(((Map<?, ?>) usage).get("cachedPromptTokens")));
        return node;
    }

    private long longOf(Object value) {
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        try {
            return value == null ? 0L : Long.parseLong(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    /** Serialize then cap a value (objects that are too large become a text node). */
    private JsonNode bounded(Object value, int max) {
        if (value == null) {
            return NullNode.getInstance();
        }
        if (value instanceof String) {
            return TextNode.valueOf(truncate((String) value, max));
        }
        JsonNode node = objectMapper.valueToTree(value);
        String json = node.toString();
        return json.length() <= max ? node : TextNode.valueOf(json.substring(0, max) + "…");
    }

    private JsonNode parseJson(String value) {
        if (value == null || value.trim().isEmpty()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(value);
        } catch (Exception e) {
            return TextNode.valueOf(value);
        }
    }

    private String truncate(String value, int max) {
        if (value == null || value.length() <= max) {
            return value;
        }
        return value.substring(0, max) + "…";
    }
}
