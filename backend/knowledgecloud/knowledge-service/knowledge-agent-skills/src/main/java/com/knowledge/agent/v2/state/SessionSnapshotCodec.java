package com.knowledge.agent.v2.state;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.SkillPayload;
import com.knowledge.agent.store.AgentStateSnapshot;
import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.agent.v2.session.AgentMode;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.v2.session.ExecutionState;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Serializes an {@link AgentSession} to/from a persistable snapshot.
 *
 * <p>
 * The V2 session state is stored as a JSON document inside
 * {@link AgentStateSnapshot#getV2SessionJson()} — the snapshot's indexed
 * columns (sessionId, conversationId, iteration, timestamp) are filled for
 * querying, while everything else (messages, metadata, frontend tools,
 * identity) round-trips through the JSON big-field.
 *
 * <p>
 * Security: the identity {@code token} is NEVER persisted. On restore,
 * the caller must re-inject a fresh token from the current request's
 * security context.
 */
@Slf4j
public class SessionSnapshotCodec {

    private final ObjectMapper objectMapper;

    public SessionSnapshotCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // ---- Encode ----

    /**
     * Encode a session into an {@link AgentStateSnapshot} ready for the
     * {@code AgentStateStore}.
     */
    public AgentStateSnapshot encode(AgentSession session) throws Exception {
        SessionPayload payload = new SessionPayload();
        payload.sessionId = session.getSessionId();
        payload.conversationId = session.getConversationId();
        payload.traceId = session.getTraceId();
        payload.mode = session.getMode() != null ? session.getMode().name() : null;
        payload.maxIterations = session.getMaxIterations();
        payload.modelName = session.getModelName();
        payload.systemPrompt = session.getSystemPrompt();
        payload.toolIds = new HashSet<>(session.getToolIds());
        payload.frontendTools = session.getFrontendTools();
        payload.skills = session.getSkills();
        payload.metadata = new LinkedHashMap<>(session.getMetadata());

        AgentIdentity identity = session.getIdentity();
        if (identity != null) {
            payload.identity = new IdentityPayload();
            payload.identity.userId = identity.getUserId();
            payload.identity.tenantId = identity.getTenantId();
            payload.identity.userName = identity.getUserName();
            payload.identity.account = identity.getAccount();
            payload.identity.roleName = identity.getRoleName();
            // token intentionally omitted — re-injected on restore
        }

        ExecutionState execution = session.getExecution();
        payload.iteration = execution.getIteration();
        payload.currentState = execution.getCurrentState() != null
                ? execution.getCurrentState().name()
                : null;
        payload.lastPromptTokens = execution.getLastPromptTokens();
        payload.activatedSkillNames = execution.getActivatedSkillNames();
        if (execution.getPendingToolCalls() != null) {
            payload.pendingToolCalls = new ArrayList<>();
            for (InferenceResponse.ToolCallData tc : execution.getPendingToolCalls()) {
                PendingToolCallPayload ptc = new PendingToolCallPayload();
                ptc.id = tc.getId();
                ptc.name = tc.getName();
                ptc.arguments = tc.getArguments();
                payload.pendingToolCalls.add(ptc);
            }
        }
        payload.messages = new ArrayList<>();
        for (ConversationMessage msg : execution.getMessages()) {
            payload.messages.add(MessagePayload.from(msg));
        }

        Object agentId = session.getMetadata().get("agentId");
        return AgentStateSnapshot.builder()
                .sessionId(session.getSessionId())
                .conversationId(session.getConversationId())
                .agentId(agentId != null ? agentId.toString() : null)
                .iteration(execution.getIteration())
                .timestamp(System.currentTimeMillis())
                .v2SessionJson(objectMapper.writeValueAsString(payload))
                .build();
    }

    // ---- Decode ----

    /**
     * Rebuild an {@link AgentSession} from a persisted snapshot.
     *
     * @param snapshot the snapshot loaded from the store
     * @param token    fresh auth token from the current request (the
     *                 persisted snapshot never contains one)
     * @return the restored session, or {@code null} if the snapshot has no
     *         V2 payload (e.g. legacy rows)
     */
    public AgentSession decode(AgentStateSnapshot snapshot, String token) throws Exception {
        if (snapshot == null || snapshot.getV2SessionJson() == null) {
            return null;
        }
        SessionPayload payload = objectMapper.readValue(
                snapshot.getV2SessionJson(), SessionPayload.class);

        AgentIdentity identity = null;
        if (payload.identity != null) {
            identity = AgentIdentity.builder()
                    .userId(payload.identity.userId)
                    .tenantId(payload.identity.tenantId)
                    .userName(payload.identity.userName)
                    .account(payload.identity.account)
                    .roleName(payload.identity.roleName)
                    .token(token)
                    .build();
        }

        ExecutionState execution = new ExecutionState();
        execution.setIteration(payload.iteration);
        execution.setLastPromptTokens(payload.lastPromptTokens);
        if (payload.activatedSkillNames != null) {
            payload.activatedSkillNames.forEach(execution::activateSkill);
        }
        if (payload.messages != null) {
            List<ConversationMessage> messages = new ArrayList<>(payload.messages.size());
            for (MessagePayload mp : payload.messages) {
                messages.add(mp.toMessage());
            }
            execution.setMessages(messages);
        }
        if (payload.pendingToolCalls != null && !payload.pendingToolCalls.isEmpty()) {
            List<InferenceResponse.ToolCallData> calls = new ArrayList<>();
            for (PendingToolCallPayload ptc : payload.pendingToolCalls) {
                calls.add(new InferenceResponse.ToolCallData(ptc.id, ptc.name, ptc.arguments));
            }
            execution.setPendingToolCalls(calls);
        }
        if (payload.currentState != null) {
            execution.transitionTo(AgentState.valueOf(payload.currentState));
        }

        return AgentSession.builder()
                .sessionId(payload.sessionId)
                .conversationId(payload.conversationId)
                .traceId(payload.traceId)
                .identity(identity)
                .mode(payload.mode != null ? AgentMode.valueOf(payload.mode) : null)
                .maxIterations(payload.maxIterations)
                .modelName(payload.modelName)
                .systemPrompt(payload.systemPrompt)
                .toolIds(payload.toolIds)
                .frontendTools(payload.frontendTools)
                .skills(payload.skills)
                .metadata(payload.metadata)
                .execution(execution)
                .build();
    }

    // ---- JSON payload DTOs ----

    /** Root JSON payload for a persisted V2 session. */
    public static class SessionPayload {
        public String sessionId;
        public String conversationId;
        public String traceId;
        public String mode;
        public int maxIterations;
        public String modelName;
        public String systemPrompt;
        public Set<String> toolIds;
        public List<ChatTool> frontendTools;
        public List<SkillPayload> skills;
        public Map<String, Object> metadata;
        public IdentityPayload identity;
        public int iteration;
        public String currentState;
        public int lastPromptTokens;
        public Set<String> activatedSkillNames;
        public List<MessagePayload> messages;
        public List<PendingToolCallPayload> pendingToolCalls;
    }

    /** Identity minus the auth token. */
    public static class IdentityPayload {
        public Long userId;
        public Long tenantId;
        public String userName;
        public String account;
        public String roleName;
    }

    /** JSON form of a {@link ConversationMessage}. */
    public static class MessagePayload {
        public String role;
        public String content;
        public String name;
        public String toolCallId;
        public String reasoningContent;
        public List<ToolCallPayload> toolCalls;

        static MessagePayload from(ConversationMessage msg) {
            MessagePayload mp = new MessagePayload();
            mp.role = msg.getRole();
            mp.content = msg.getContent();
            mp.name = msg.getName();
            mp.toolCallId = msg.getToolCallId();
            mp.reasoningContent = msg.getReasoningContent();
            if (msg.getToolCalls() != null) {
                mp.toolCalls = new ArrayList<>();
                for (ConversationMessage.ToolCallInfo tc : msg.getToolCalls()) {
                    ToolCallPayload tcp = new ToolCallPayload();
                    tcp.id = tc.getId();
                    tcp.type = tc.getType();
                    tcp.functionName = tc.getFunctionName();
                    tcp.functionArguments = tc.getFunctionArguments();
                    mp.toolCalls.add(tcp);
                }
            }
            return mp;
        }

        ConversationMessage toMessage() {
            ConversationMessage.Builder builder = ConversationMessage.builder()
                    .role(role)
                    .content(content)
                    .name(name)
                    .toolCallId(toolCallId)
                    .reasoningContent(reasoningContent);
            if (toolCalls != null) {
                List<ConversationMessage.ToolCallInfo> infos = new ArrayList<>();
                for (ToolCallPayload tcp : toolCalls) {
                    infos.add(new ConversationMessage.ToolCallInfo(
                            tcp.id, tcp.type, tcp.functionName, tcp.functionArguments));
                }
                builder.toolCalls(infos);
            }
            return builder.build();
        }
    }

    /** JSON form of a tool call within an assistant message. */
    public static class ToolCallPayload {
        public String id;
        public String type;
        public String functionName;
        public String functionArguments;
    }

    /** JSON form of a pending (not-yet-executed) LLM tool call. */
    public static class PendingToolCallPayload {
        public String id;
        public String name;
        public String arguments;
    }
}
