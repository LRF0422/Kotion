package com.knowledge.agent.core.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.memory.ThreadSummarizer;
import com.knowledge.agent.core.run.AgentRun;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Engine-owned session state for the AI side panel — the Kotion analogue of
 * DSH's session log + projection split.
 *
 * <p>The durable truth is the run log ({@code agent_run_checkpoint} = the
 * model-visible conversation per run, {@code agent_run_event} = append-only
 * execution events). From it this component maintains the canonical
 * <b>model log</b> on {@code agent_chat_session.model_messages_json}: the exact
 * message sequence (with per-message timestamps) the engine feeds back into
 * {@code ContextManager}. The client no longer resends history;
 * {@link #prepareHistory} accumulates the new user turn and
 * {@link #onRunTerminal} appends the assistant/tool turns a run produced.
 *
 * <p>The stored model log is an array of {@code {m, t}} envelopes
 * ({@code m} = {@link ChatMessage}, {@code t} = epoch millis) so the UI
 * projection can round-trip timestamps. The UI transcript
 * ({@code messages_json}) is a <b>pure projection</b> of the canonical log,
 * re-derived on every write so the two can never diverge.
 *
 * <p>Ordering: a client may start the next run as soon as it sees
 * {@code run.completed}, before the previous run's terminal hook finishes. Each
 * projection write therefore runs under a per-conversation lock and inserts a
 * run's produced turns at the position the run's history started
 * ({@code inputMessageCount - 1}), never blindly appending to the tail.
 */
@Slf4j
@Component
public class SessionTranscriptProjector {

    private static final int SCHEMA_VERSION = 3;
    private static final int MAX_MODEL_MESSAGES = 400;
    private static final int MAX_CONTENT_CHARS = 20000;
    private static final int MAX_REASONING_CHARS = 20000;

    private final ChatSessionStore store;
    private final CheckpointStore checkpointStore;
    private final ObjectMapper objectMapper;

    private final ConcurrentHashMap<String, Object> locks = new ConcurrentHashMap<>();

    public SessionTranscriptProjector(ChatSessionStore store,
                                      CheckpointStore checkpointStore,
                                      ObjectMapper objectMapper) {
        this.store = store;
        this.checkpointStore = checkpointStore;
        this.objectMapper = objectMapper;
    }

    /** Accumulate the caller's new turn and return the full context history. */
    public List<ChatMessage> prepareHistory(AgentRun run, List<ChatMessage> input) {
        if (!eligible(run)) {
            return input != null ? input : new ArrayList<ChatMessage>();
        }
        synchronized (lockFor(run.getConversationId())) {
            try {
                AgentChatSessionEntity existing =
                        store.get(run.getTenantId(), run.getUserId(), run.getConversationId());
                State state = readState(existing != null ? existing.getModelMessagesJson() : null);
                if (state.messages.isEmpty()) {
                    ArrayNode ui = readUi(existing != null ? existing.getMessagesJson() : null);
                    if (ui.size() > 0) {
                        state = fromUi(ui);
                    }
                }
                if (state.messages.isEmpty()) {
                    appendInput(state, input);
                } else {
                    ChatMessage newUser = lastUser(input);
                    if (newUser != null && !isDuplicateLastUser(state.messages, newUser)) {
                        state.add(forLog(newUser));
                    }
                }
                trim(state);
                persist(run, existing, state, titleOf(existing, input), run.getLastSeq());
                return state.messages;
            } catch (Exception e) {
                log.warn("Session history prepare failed for {}: {}",
                        run.getConversationId(), e.getMessage());
                return input != null ? input : new ArrayList<ChatMessage>();
            }
        }
    }

    /** Insert the assistant/tool turns produced by a terminal run. */
    public void onRunTerminal(AgentRun run) {
        if (!eligible(run)) {
            return;
        }
        synchronized (lockFor(run.getConversationId())) {
            try {
                AgentChatSessionEntity existing =
                        store.get(run.getTenantId(), run.getUserId(), run.getConversationId());
                State state = readState(existing != null ? existing.getModelMessagesJson() : null);

                Checkpoint checkpoint = checkpointStore.load(run.getRunId());
                if (checkpoint != null && checkpoint.getMessages() != null) {
                    int size = checkpoint.getMessages().size();
                    int from = Math.min(Math.max(checkpoint.getInputMessageCount(), 0), size);
                    List<ChatMessage> produced = new ArrayList<>();
                    for (ChatMessage message : checkpoint.getMessages().subList(from, size)) {
                        if (message == null) {
                            continue;
                        }
                        String role = role(message);
                        if ("system".equals(role) || "user".equals(role)) {
                            continue; // internal truncation nudges are never context
                        }
                        produced.add(forLog(message));
                    }
                    // A newer run may already have appended its user turn; insert
                    // this run's output where its own history ended.
                    int insertAt = Math.min(Math.max(checkpoint.getInputMessageCount() - 1, 0),
                            state.messages.size());
                    state.insertAll(insertAt, produced);
                }
                trim(state);
                persist(run, existing, state, titleOf(existing, null), run.getLastSeq());
            } catch (Exception e) {
                log.warn("Session projection failed for {}: {}", run.getConversationId(), e.getMessage());
            }
        }
    }

    // ==================== canonical ====================

    private void appendInput(State state, List<ChatMessage> input) {
        if (input == null) {
            return;
        }
        for (ChatMessage message : input) {
            if (message == null) {
                continue;
            }
            String role = role(message);
            if ("system".equals(role) || role.isEmpty()) {
                continue;
            }
            state.add(forLog(message));
        }
    }

    private ChatMessage forLog(ChatMessage message) {
        return ChatMessage.builder()
                .role(message.getRole())
                .content(truncate(message.getContent(), MAX_CONTENT_CHARS))
                .toolCallId(message.getToolCallId())
                .name(message.getName())
                .toolCalls(message.getToolCalls())
                .reasoningContent(truncate(message.getReasoningContent(), MAX_REASONING_CHARS))
                .build();
    }

    private void trim(State state) {
        while (state.messages.size() > MAX_MODEL_MESSAGES) {
            state.removeFirst();
        }
        while (!state.messages.isEmpty() && "tool".equals(role(state.messages.get(0)))) {
            state.removeFirst();
        }
    }

    // ==================== UI projection (pure fold) ====================

    private ArrayNode toUi(State state) {
        ArrayNode out = objectMapper.createArrayNode();
        ObjectNode currentAssistant = null;
        for (int index = 0; index < state.messages.size(); index++) {
            ChatMessage message = state.messages.get(index);
            if (message == null) {
                continue;
            }
            long timestamp = state.timeAt(index);
            String role = role(message);
            if ("user".equals(role)) {
                ObjectNode node = entry("u-" + UUID.randomUUID(), "user", timestamp);
                node.put("content", message.getContent() == null ? "" : message.getContent());
                out.add(node);
                currentAssistant = null;
            } else if ("assistant".equals(role)) {
                currentAssistant = null;
                boolean hasContent = message.getContent() != null && !message.getContent().isEmpty();
                boolean hasCalls = message.getToolCalls() != null && !message.getToolCalls().isEmpty();
                if (!hasContent && !hasCalls) {
                    continue;
                }
                ObjectNode node = entry("a-" + UUID.randomUUID(), "ai", timestamp);
                if (hasContent) {
                    node.put("content", message.getContent());
                }
                if (message.getReasoningContent() != null && !message.getReasoningContent().isEmpty()) {
                    node.put("reasoningContent", message.getReasoningContent());
                }
                ArrayNode steps = objectMapper.createArrayNode();
                if (hasCalls) {
                    for (ChatMessage.ToolCallInfo call : message.getToolCalls()) {
                        if (call == null || call.getFunction() == null) {
                            continue;
                        }
                        ObjectNode step = objectMapper.createObjectNode();
                        step.put("id", call.getId());
                        step.put("callId", call.getId());
                        step.put("toolName", call.getFunction().getName());
                        step.set("args", parseJson(call.getFunction().getArguments()));
                        step.put("status", "success");
                        step.put("timestamp", timestamp);
                        steps.add(step);
                    }
                }
                if (steps.size() > 0) {
                    node.set("steps", steps);
                }
                out.add(node);
                currentAssistant = node;
            } else if ("tool".equals(role) && currentAssistant != null) {
                JsonNode steps = currentAssistant.get("steps");
                if (steps == null || !steps.isArray()) {
                    continue;
                }
                for (JsonNode stepNode : steps) {
                    ObjectNode step = (ObjectNode) stepNode;
                    if (message.getToolCallId() == null
                            || !message.getToolCallId().equals(step.path("callId").asText())) {
                        continue;
                    }
                    step.set("result", parseJson(message.getContent()));
                    break;
                }
            }
        }
        return out;
    }

    /** Rebuild canonical state from a pre-refactor UI projection. */
    private State fromUi(ArrayNode ui) {
        State state = new State();
        for (JsonNode node : ui) {
            long timestamp = node.path("timestamp").asLong(0);
            if (timestamp <= 0) {
                timestamp = System.currentTimeMillis();
            }
            String sender = node.path("sender").asText();
            if ("user".equals(sender)) {
                state.add(ChatMessage.builder().role("user").content(node.path("content").asText("")).build());
                state.setLastTime(timestamp);
                continue;
            }
            List<ChatMessage.ToolCallInfo> calls = new ArrayList<>();
            List<ChatMessage> toolMessages = new ArrayList<>();
            JsonNode steps = node.path("steps");
            if (steps.isArray()) {
                for (JsonNode step : steps) {
                    String callId = step.path("callId").asText("");
                    if (callId.isEmpty()) {
                        continue;
                    }
                    String tool = step.path("toolName").asText("tool");
                    String args = step.path("args").isMissingNode() ? "{}" : step.path("args").toString();
                    calls.add(new ChatMessage.ToolCallInfo(callId, "function",
                            new ChatMessage.ToolCallInfo.FunctionInfo(tool, args)));
                    JsonNode result = step.path("result");
                    String resultText = result.isMissingNode() ? ""
                            : (result.isTextual() ? result.asText() : result.toString());
                    toolMessages.add(ChatMessage.builder().role("tool").toolCallId(callId).name(tool)
                            .content(resultText).build());
                }
            }
            state.add(ChatMessage.builder()
                    .role("assistant")
                    .content(node.path("content").asText(null))
                    .reasoningContent(node.path("reasoningContent").asText(null))
                    .toolCalls(calls.isEmpty() ? null : calls)
                    .build());
            state.setLastTime(timestamp);
            for (ChatMessage toolMessage : toolMessages) {
                state.add(toolMessage);
                state.setLastTime(timestamp);
            }
        }
        return state;
    }

    // ==================== persistence ====================

    private void persist(AgentRun run, AgentChatSessionEntity existing, State state,
                         String title, long asOfSeq) {
        AgentChatSessionEntity entity = new AgentChatSessionEntity();
        entity.setSessionId(run.getConversationId());
        entity.setTenantId(run.getTenantId());
        entity.setUserId(run.getUserId());
        entity.setTitle(title);
        entity.setMessagesJson(writeUi(toUi(state)));
        entity.setModelMessagesJson(writeState(state));
        entity.setMessageCount(state.messages.size());
        entity.setSchemaVersion(SCHEMA_VERSION);
        entity.setSourceRunId(run.getRunId());
        entity.setAsOfSeq(asOfSeq);
        Long existingCreate = existing != null ? existing.getCreateTime() : null;
        entity.setCreateTime(existingCreate != null && existingCreate > 0
                ? existingCreate : System.currentTimeMillis());
        store.saveTranscript(entity);
    }

    private String titleOf(AgentChatSessionEntity existing, List<ChatMessage> input) {
        if (existing != null && existing.getTitle() != null && !existing.getTitle().trim().isEmpty()) {
            return existing.getTitle();
        }
        return input != null ? ThreadSummarizer.titleFrom(input) : null;
    }

    // ==================== json / misc ====================

    private State readState(String json) {
        State state = new State();
        if (json == null || json.trim().isEmpty()) {
            return state;
        }
        try {
            JsonNode root = objectMapper.readTree(json);
            if (root == null || !root.isArray()) {
                return state;
            }
            for (JsonNode node : root) {
                if (node == null || node.isNull()) {
                    continue;
                }
                if (node.has("m")) {
                    ChatMessage message = objectMapper.treeToValue(node.get("m"), ChatMessage.class);
                    state.messages.add(message);
                    state.times.add(node.path("t").asLong(System.currentTimeMillis()));
                } else {
                    // Legacy plain ChatMessage[] (V28 shape).
                    state.messages.add(objectMapper.treeToValue(node, ChatMessage.class));
                    state.times.add(System.currentTimeMillis());
                }
            }
        } catch (Exception e) {
            log.warn("Model log parse failed: {}", e.getMessage());
            return new State();
        }
        return state;
    }

    private String writeState(State state) {
        try {
            ArrayNode array = objectMapper.createArrayNode();
            for (int i = 0; i < state.messages.size(); i++) {
                ObjectNode node = objectMapper.createObjectNode();
                node.set("m", objectMapper.valueToTree(state.messages.get(i)));
                node.put("t", state.timeAt(i));
                array.add(node);
            }
            return objectMapper.writeValueAsString(array);
        } catch (Exception e) {
            return "[]";
        }
    }

    private ArrayNode readUi(String json) {
        if (json == null || json.trim().isEmpty()) {
            return objectMapper.createArrayNode();
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            return node != null && node.isArray() ? (ArrayNode) node : objectMapper.createArrayNode();
        } catch (Exception e) {
            return objectMapper.createArrayNode();
        }
    }

    private String writeUi(ArrayNode transcript) {
        try {
            return objectMapper.writeValueAsString(transcript);
        } catch (Exception e) {
            return "[]";
        }
    }

    private JsonNode parseJson(String value) {
        if (value == null) {
            return NullNode.getInstance();
        }
        try {
            return objectMapper.readTree(value);
        } catch (Exception e) {
            return TextNode.valueOf(value);
        }
    }

    private ObjectNode entry(String id, String sender, long timestamp) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", id);
        node.put("sender", sender);
        node.put("timestamp", timestamp > 0 ? timestamp : System.currentTimeMillis());
        return node;
    }

    private String truncate(String value, int max) {
        if (value == null || value.length() <= max) {
            return value;
        }
        return value.substring(0, max) + "\n...[truncated]";
    }

    private ChatMessage lastUser(List<ChatMessage> input) {
        if (input == null) {
            return null;
        }
        ChatMessage last = null;
        for (ChatMessage message : input) {
            if (message != null && "user".equals(role(message))) {
                last = message;
            }
        }
        return last;
    }

    private boolean isDuplicateLastUser(List<ChatMessage> canonical, ChatMessage candidate) {
        if (candidate.getContent() == null) {
            return false;
        }
        for (int i = canonical.size() - 1; i >= 0; i--) {
            ChatMessage message = canonical.get(i);
            if (message != null && "user".equals(role(message))) {
                return candidate.getContent().equals(message.getContent());
            }
        }
        return false;
    }

    private Object lockFor(String conversationId) {
        return locks.computeIfAbsent(conversationId, key -> new Object());
    }

    private boolean eligible(AgentRun run) {
        return run != null
                && run.getParentRunId() == null
                && run.getUserId() != null
                && run.getTenantId() != null
                && run.getConversationId() != null
                && !run.getConversationId().trim().isEmpty();
    }

    private String role(ChatMessage message) {
        return message.getRole() == null ? "" : message.getRole().toLowerCase(Locale.ROOT);
    }

    /** Canonical messages aligned 1:1 with their timestamps. */
    private static final class State {
        private final List<ChatMessage> messages = new ArrayList<>();
        private final List<Long> times = new ArrayList<>();

        private void add(ChatMessage message) {
            messages.add(message);
            times.add(System.currentTimeMillis());
        }

        private void insertAll(int index, List<ChatMessage> additions) {
            messages.addAll(index, additions);
            for (int i = 0; i < additions.size(); i++) {
                times.add(index + i, System.currentTimeMillis());
            }
        }

        private void removeFirst() {
            if (!messages.isEmpty()) {
                messages.remove(0);
            }
            if (!times.isEmpty()) {
                times.remove(0);
            }
        }

        private long timeAt(int index) {
            return index >= 0 && index < times.size() && times.get(index) != null
                    ? times.get(index) : System.currentTimeMillis();
        }

        private void setLastTime(long timestamp) {
            if (!times.isEmpty()) {
                times.set(times.size() - 1, timestamp);
            }
        }
    }
}
