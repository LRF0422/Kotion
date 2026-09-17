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
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

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
    /** Cap on persisted base64 image data per message (chars). */
    private static final int MAX_IMAGE_PART_CHARS = 4_000_000;
    /** Bounded compare-and-swap retries before giving up on a transcript write. */
    private static final int MAX_CAS_ATTEMPTS = 5;

    private final ChatSessionStore store;
    private final CheckpointStore checkpointStore;
    private final ObjectMapper objectMapper;
    private final SubAgentProjection subAgentProjection;

    /**
     * Fixed lock stripes, keyed by conversation hash. A per-conversation map
     * grew without bound (one entry per conversation, forever); a fixed pool
     * bounds memory while still serializing all writes for a given conversation.
     * Unrelated conversations occasionally share a stripe, which is harmless.
     */
    private static final int LOCK_STRIPES = 64;
    private final Object[] locks = createLocks();

    private static Object[] createLocks() {
        Object[] pool = new Object[LOCK_STRIPES];
        for (int i = 0; i < pool.length; i++) {
            pool[i] = new Object();
        }
        return pool;
    }

    public SessionTranscriptProjector(ChatSessionStore store,
                                      CheckpointStore checkpointStore,
                                      ObjectMapper objectMapper,
                                      SubAgentProjection subAgentProjection) {
        this.store = store;
        this.checkpointStore = checkpointStore;
        this.objectMapper = objectMapper;
        this.subAgentProjection = subAgentProjection;
    }

    /** Accumulate the caller's new turn and return the full context history. */
    public List<ChatMessage> prepareHistory(AgentRun run, List<ChatMessage> input) {
        if (!eligible(run)) {
            return input != null ? input : new ArrayList<ChatMessage>();
        }
        synchronized (lockFor(run.getConversationId())) {
            List<ChatMessage> history = input != null ? input : new ArrayList<ChatMessage>();
            for (int attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
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
                    // Close a turn an abandoned/suspended run left unpaired before
                    // the canonical log becomes the next run's context.
                    repairToolPairing(state.messages, state::insertAt);
                    if (state.messages.isEmpty()) {
                        appendInput(state, input);
                    } else {
                        ChatMessage newUser = lastUser(input);
                        if (newUser != null && !isDuplicateLastUser(state.messages, newUser)) {
                            state.add(forLog(newUser));
                        }
                    }
                    trim(state);
                    history = state.messages;
                    if (persist(run, existing, state, titleOf(existing, input), run.getLastSeq(), null)) {
                        return history;
                    }
                    // Another instance wrote first: re-read and recompute.
                } catch (Exception e) {
                    log.warn("Session history prepare failed for {}: {}",
                            run.getConversationId(), e.getMessage());
                    return history;
                }
            }
            log.warn("Session history prepare CAS exhausted for {}", run.getConversationId());
            return history;
        }
    }

    /** Insert the assistant/tool turns produced by a terminal run. */
    public void onRunTerminal(AgentRun run) {
        if (!eligible(run)) {
            return;
        }
        synchronized (lockFor(run.getConversationId())) {
            for (int attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
                try {
                    AgentChatSessionEntity existing =
                            store.get(run.getTenantId(), run.getUserId(), run.getConversationId());
                    // Idempotent per run: the cancel path and a live loop's exit can
                    // both project the same terminal run. Provenance records whether
                    // this run's terminal write already landed.
                    if (alreadyProjectedTerminal(existing, run)) {
                        return;
                    }
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
                        // Repair dangling assistant tool_calls (cancel/failure while
                        // waiting for a tool) before they become the next run's
                        // model context.
                        repairToolPairing(produced, produced::add);
                        // A newer run may already have appended its user turn; insert
                        // this run's output where its own history ended.
                        int insertAt = Math.min(Math.max(checkpoint.getInputMessageCount() - 1, 0),
                                state.messages.size());
                        state.insertAll(insertAt, produced);
                    }
                    trim(state);
                    // Reduce this run's delegated children from the durable log so
                    // the reloaded panel comes from the DB, not a client cache. A
                    // projection failure must never cost us the transcript itself.
                    SubAgentProjection.Projection fresh = null;
                    try {
                        fresh = subAgentProjection.project(run.getRunId());
                    } catch (Exception projectionError) {
                        log.warn("Sub-agent projection failed for run {}: {}",
                                run.getRunId(), projectionError.getMessage());
                    }
                    if (persist(run, existing, state, titleOf(existing, null), run.getLastSeq(), fresh)) {
                        return;
                    }
                    // Another instance wrote first: re-read and recompute.
                } catch (Exception e) {
                    log.warn("Session projection failed for {}: {}", run.getConversationId(), e.getMessage());
                    return;
                }
            }
            log.warn("Session projection CAS exhausted for {}", run.getConversationId());
        }
    }

    /**
     * Ensure every assistant message carrying tool_calls is followed by a tool
     * message for each call id. A run cancelled/failed while waiting for a
     * frontend tool otherwise leaves a structurally invalid turn in the
     * canonical log.
     */
    @FunctionalInterface
    private interface MessageInserter {
        void insert(int index, ChatMessage message);
    }

    private void repairToolPairing(List<ChatMessage> produced, MessageInserter inserter) {
        for (int i = 0; i < produced.size(); i++) {
            ChatMessage message = produced.get(i);
            if (!"assistant".equals(role(message))
                    || message.getToolCalls() == null || message.getToolCalls().isEmpty()) {
                continue;
            }
            Set<String> expected = new LinkedHashSet<>();
            java.util.Map<String, String> names = new java.util.HashMap<>();
            for (ChatMessage.ToolCallInfo call : message.getToolCalls()) {
                if (call != null && call.getId() != null) {
                    expected.add(call.getId());
                    if (call.getFunction() != null && call.getFunction().getName() != null) {
                        names.put(call.getId(), call.getFunction().getName());
                    }
                }
            }
            Set<String> found = new HashSet<>();
            int j = i + 1;
            while (j < produced.size() && "tool".equals(role(produced.get(j)))) {
                if (produced.get(j).getToolCallId() != null) {
                    found.add(produced.get(j).getToolCallId());
                }
                j++;
            }
            for (String missingId : expected) {
                if (!found.contains(missingId)) {
                    inserter.insert(j, ChatMessage.builder()
                            .role("tool")
                            .toolCallId(missingId)
                            .name(names.get(missingId))
                            .content("{\"error\":\"运行结束前未返回工具结果\"}")
                            .build());
                    j++;
                }
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
                .contentParts(persistedContentParts(message))
                .toolCallId(message.getToolCallId())
                .name(message.getName())
                .toolCalls(message.getToolCalls())
                .reasoningContent(truncate(message.getReasoningContent(), MAX_REASONING_CHARS))
                .build();
    }

    /**
     * Content parts persisted in the canonical log. Only user attachments are
     * kept (so the UI can re-render them and the next run still sees the image);
     * agent-injected vision turns are skipped upstream. A hard size cap keeps a
     * pathological upload from bloating {@code model_messages_json}.
     */
    private List<Object> persistedContentParts(ChatMessage message) {
        List<Object> parts = message.getContentParts();
        if (parts == null || parts.isEmpty() || !"user".equals(role(message))) {
            return null;
        }
        long total = 0;
        List<Object> kept = new ArrayList<>();
        for (Object part : parts) {
            if (part instanceof java.util.Map) {
                java.util.Map<?, ?> map = (java.util.Map<?, ?>) part;
                if ("image_url".equals(map.get("type"))) {
                    String url = imageUrlOf(map);
                    total += url.length();
                    if (total > MAX_IMAGE_PART_CHARS) {
                        continue;
                    }
                }
            }
            kept.add(part);
        }
        return kept.isEmpty() ? null : kept;
    }

    @SuppressWarnings("unchecked")
    private String imageUrlOf(java.util.Map<?, ?> part) {
        Object imageUrl = part.get("image_url");
        if (imageUrl instanceof java.util.Map) {
            Object url = ((java.util.Map<String, Object>) imageUrl).get("url");
            return url == null ? "" : String.valueOf(url);
        }
        return "";
    }

    /** Data URLs of a message's image parts (for the UI projection). */
    private ArrayNode imageDataUrls(ChatMessage message) {
        ArrayNode images = objectMapper.createArrayNode();
        if (message.getContentParts() == null) {
            return images;
        }
        for (Object part : message.getContentParts()) {
            if (part instanceof java.util.Map
                    && "image_url".equals(((java.util.Map<?, ?>) part).get("type"))) {
                String url = imageUrlOf((java.util.Map<?, ?>) part);
                if (!url.isEmpty()) {
                    images.add(url);
                }
            }
        }
        return images;
    }

    /** Rebuild multimodal parts from a projected `images` array (legacy read). */
    private List<Object> contentPartsFromUi(JsonNode images) {
        if (images == null || !images.isArray() || images.size() == 0) {
            return null;
        }
        List<Object> parts = new ArrayList<>();
        for (JsonNode image : images) {
            String url = image.asText("");
            if (url.isEmpty()) {
                continue;
            }
            java.util.Map<String, Object> imageUrl = new java.util.LinkedHashMap<>();
            imageUrl.put("url", url);
            java.util.Map<String, Object> part = new java.util.LinkedHashMap<>();
            part.put("type", "image_url");
            part.put("image_url", imageUrl);
            parts.add(part);
        }
        return parts.isEmpty() ? null : parts;
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
        // One assistant node per user turn. The live client keeps a whole run —
        // its reasoning turns and every tool call — inside a single Message, so a
        // projection that emitted one node per model turn made a restored run
        // shatter into one disconnected mini-timeline per turn.
        ObjectNode run = null;
        ArrayNode runSteps = null;
        ArrayNode runActivity = null;
        StringBuilder runReasoning = new StringBuilder();
        String answerStepId = null;
        String answerText = null;
        int turnStep = 0;
        // Synthesized ordering keys. The model log carries no event seq, so an
        // increasing counter reproduces the live interleaving (a turn's reasoning
        // precedes the tools it requested, which precede the next turn).
        long sequence = 0;
        for (int index = 0; index < state.messages.size(); index++) {
            ChatMessage message = state.messages.get(index);
            if (message == null) {
                continue;
            }
            long timestamp = state.timeAt(index);
            String role = role(message);
            if ("user".equals(role)) {
                finalizeRun(run, runActivity, runSteps, answerStepId, answerText, runReasoning);
                run = null;
                runSteps = null;
                runActivity = null;
                runReasoning = new StringBuilder();
                answerStepId = null;
                answerText = null;
                turnStep = 0;
                sequence = 0;

                ObjectNode node = entry("u-" + index, "user", timestamp);
                node.put("content", message.getContent() == null ? "" : message.getContent());
                ArrayNode images = imageDataUrls(message);
                if (images.size() > 0) {
                    node.set("images", images);
                }
                out.add(node);
            } else if ("assistant".equals(role)) {
                boolean hasContent = message.getContent() != null && !message.getContent().isEmpty();
                boolean hasCalls = message.getToolCalls() != null && !message.getToolCalls().isEmpty();
                if (!hasContent && !hasCalls) {
                    continue;
                }
                if (run == null) {
                    run = entry("a-" + index, "ai", timestamp);
                    runSteps = objectMapper.createArrayNode();
                    runActivity = objectMapper.createArrayNode();
                    out.add(run);
                }
                // The latest turn in the run is the visible timestamp/answer.
                run.put("timestamp", timestamp > 0 ? timestamp : System.currentTimeMillis());

                turnStep++;
                String stepId = "step-" + index;
                String text = message.getContent() == null ? "" : message.getContent();
                String reasoning = message.getReasoningContent() == null ? "" : message.getReasoningContent();
                ObjectNode activity = objectMapper.createObjectNode();
                activity.put("id", stepId);
                activity.put("step", turnStep);
                activity.put("startedSeq", sequence++);
                activity.put("reasoning", reasoning);
                activity.put("text", text);
                runActivity.add(activity);
                if (reasoning.length() > 0) {
                    if (runReasoning.length() > 0) {
                        runReasoning.append("\n\n");
                    }
                    runReasoning.append(reasoning);
                }
                // The last assistant turn that produced text is the answer, exactly
                // like the live reducer's resolveAnswerStepId (reverse scan).
                if (hasContent) {
                    answerStepId = stepId;
                    answerText = text;
                }
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
                        step.put("step", turnStep);
                        step.put("stepId", stepId);
                        step.put("sequence", sequence++);
                        runSteps.add(step);
                    }
                }
            } else if ("tool".equals(role) && runSteps != null) {
                for (JsonNode stepNode : runSteps) {
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
        finalizeRun(run, runActivity, runSteps, answerStepId, answerText, runReasoning);
        return out;
    }

    /**
     * Close a folded run node: attach the synthesized timeline and tool tape and
     * pick the visible answer, mirroring what the live client's Message carries.
     */
    private void finalizeRun(ObjectNode run, ArrayNode activity, ArrayNode steps,
                             String answerStepId, String answerText, StringBuilder reasoning) {
        if (run == null) {
            return;
        }
        if (activity != null && activity.size() > 0) {
            run.set("activitySteps", activity);
        }
        if (steps != null && steps.size() > 0) {
            run.set("steps", steps);
        }
        if (answerText != null && !answerText.isEmpty()) {
            run.put("content", answerText);
        }
        if (answerStepId != null) {
            run.put("answerStepId", answerStepId);
        }
        if (reasoning != null && reasoning.length() > 0) {
            run.put("reasoningContent", reasoning.toString());
        }
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
                state.add(ChatMessage.builder()
                        .role("user")
                        .content(node.path("content").asText(""))
                        .contentParts(contentPartsFromUi(node.path("images")))
                        .build());
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

    private boolean persist(AgentRun run, AgentChatSessionEntity existing, State state,
                            String title, long asOfSeq, SubAgentProjection.Projection fresh) {
        ArrayNode ui = toUi(state);
        try {
            overlaySubAgents(ui, existing, fresh);
        } catch (Exception e) {
            // An overlay bug must not drop the transcript write.
            log.warn("Sub-agent overlay failed for {}: {}", run.getConversationId(), e.getMessage());
        }
        AgentChatSessionEntity entity = new AgentChatSessionEntity();
        entity.setSessionId(run.getConversationId());
        entity.setTenantId(run.getTenantId());
        entity.setUserId(run.getUserId());
        entity.setTitle(title);
        entity.setMessagesJson(writeUi(ui));
        entity.setModelMessagesJson(writeState(state));
        // message_count caches the UI projection length (the column contract),
        // not the canonical model-log length — the import guard compares UI sizes.
        entity.setMessageCount(ui.size());
        entity.setSchemaVersion(SCHEMA_VERSION);
        entity.setSourceRunId(run.getRunId());
        entity.setAsOfSeq(asOfSeq);
        // Expected version for the CAS: what we read, or 0 when the row is new.
        entity.setVersion(existing != null && existing.getVersion() != null
                ? existing.getVersion() : 0L);
        Long existingCreate = existing != null ? existing.getCreateTime() : null;
        entity.setCreateTime(existingCreate != null && existingCreate > 0
                ? existingCreate : System.currentTimeMillis());
        return store.saveTranscriptCas(entity);
    }

    /**
     * Overlay the sub-agent tree onto the engine projection.
     *
     * <p>The canonical model log has no sub-agent records (a child's steps and
     * tool calls belong to the CHILD run), so they are materialized from the run
     * logs and embedded in the UI JSON. Because {@link #toUi} is re-derived on
     * every write, the previous projection's records are carried over — keyed by
     * the stable delegate call id, since engine message ids are regenerated on
     * every projection.
     */
    private void overlaySubAgents(ArrayNode ui, AgentChatSessionEntity existing,
                                  SubAgentProjection.Projection fresh) {
        Map<String, ObjectNode> subRuns = carryOverSubRuns(existing);
        Map<String, ArrayNode> childSteps = carryOverChildSteps(existing, subRuns);
        if (fresh != null && !fresh.isEmpty()) {
            subRuns.putAll(fresh.subRuns());
            childSteps.putAll(fresh.toolSteps());
        }
        if (subRuns.isEmpty() && childSteps.isEmpty()) {
            return;
        }
        for (JsonNode node : ui) {
            if (!node.isObject() || !"ai".equals(node.path("sender").asText())) {
                continue;
            }
            ObjectNode assistant = (ObjectNode) node;
            if (!(assistant.get("steps") instanceof ArrayNode)) {
                continue;
            }
            ArrayNode steps = (ArrayNode) assistant.get("steps");
            ArrayNode attached = objectMapper.createArrayNode();
            ArrayNode extraSteps = objectMapper.createArrayNode();
            for (int i = 0; i < steps.size(); i++) {
                String callId = steps.get(i).path("callId").asText("");
                if (callId.isEmpty()) {
                    continue;
                }
                ObjectNode subRun = subRuns.get(callId);
                if (subRun != null) {
                    attached.add(subRun);
                }
                ArrayNode extra = childSteps.get(callId);
                if (extra != null) {
                    extraSteps.addAll(extra);
                }
            }
            if (attached.size() > 0) {
                assistant.set("subRuns", attached);
            }
            if (extraSteps.size() > 0) {
                steps.addAll(extraSteps);
            }
        }
    }

    /** Sub-agent records already materialized in the previous projection. */
    private Map<String, ObjectNode> carryOverSubRuns(AgentChatSessionEntity existing) {
        Map<String, ObjectNode> out = new LinkedHashMap<>();
        for (JsonNode node : readUi(existing != null ? existing.getMessagesJson() : null)) {
            JsonNode array = node.get("subRuns");
            if (array == null || !array.isArray()) {
                continue;
            }
            for (JsonNode subRun : array) {
                if (subRun instanceof ObjectNode) {
                    String callId = subRun.path("callId").asText("");
                    if (!callId.isEmpty()) {
                        out.putIfAbsent(callId, (ObjectNode) subRun);
                    }
                }
            }
        }
        return out;
    }

    /** Child tool steps already present in the previous projection. */
    private Map<String, ArrayNode> carryOverChildSteps(AgentChatSessionEntity existing,
                                                       Map<String, ObjectNode> subRuns) {
        Map<String, String> callIdBySubRun = new HashMap<>();
        for (Map.Entry<String, ObjectNode> entry : subRuns.entrySet()) {
            String subRunId = entry.getValue().path("subRunId").asText("");
            if (!subRunId.isEmpty()) {
                callIdBySubRun.put(subRunId, entry.getKey());
            }
        }
        Map<String, ArrayNode> out = new LinkedHashMap<>();
        if (callIdBySubRun.isEmpty()) {
            return out;
        }
        for (JsonNode node : readUi(existing != null ? existing.getMessagesJson() : null)) {
            JsonNode steps = node.get("steps");
            if (steps == null || !steps.isArray()) {
                continue;
            }
            for (JsonNode step : steps) {
                String subRunId = step.path("subRunId").asText("");
                if (subRunId.isEmpty()) {
                    continue;
                }
                String callId = callIdBySubRun.get(subRunId);
                if (callId == null) {
                    continue;
                }
                out.computeIfAbsent(callId, key -> objectMapper.createArrayNode()).add(step);
            }
        }
        return out;
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
        if (candidate.getContent() == null || canonical.isEmpty()) {
            return false;
        }
        ChatMessage last = canonical.get(canonical.size() - 1);
        // Only a TRAILING user message can be a retry of the same turn. Once the
        // engine produced output, an identical prompt is a legitimate new turn
        // and must not be silently dropped.
        return last != null
                && "user".equals(role(last))
                && candidate.getContent().equals(last.getContent());
    }

    private Object lockFor(String conversationId) {
        return locks[Math.floorMod(conversationId.hashCode(), LOCK_STRIPES)];
    }

    /**
     * True when this exact run already wrote its terminal projection. Guards
     * against a duplicate terminal hook (e.g. an explicit cancel plus the loop's
     * own exit) re-inserting the same assistant/tool turns.
     */
    private boolean alreadyProjectedTerminal(AgentChatSessionEntity existing, AgentRun run) {
        return existing != null
                && run.getRunId().equals(existing.getSourceRunId())
                && existing.getAsOfSeq() != null
                && existing.getAsOfSeq() >= run.getLastSeq();
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

        /** Insert one message, keeping the parallel timestamp list aligned. */
        private void insertAt(int index, ChatMessage message) {
            messages.add(index, message);
            times.add(index, System.currentTimeMillis());
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
