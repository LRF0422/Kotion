package com.knowledge.agent.v2.state;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.store.AgentStateSnapshot;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.agent.v2.session.AgentMode;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Serialization round-trip tests for {@link SessionSnapshotCodec}.
 */
class SessionSnapshotCodecTest {

    private SessionSnapshotCodec codec;

    @BeforeEach
    void setUp() {
        codec = new SessionSnapshotCodec(new ObjectMapper());
    }

    private AgentSession buildSession() {
        AgentIdentity identity = AgentIdentity.builder()
                .userId(42L)
                .tenantId(7L)
                .userName("Alice")
                .account("alice")
                .roleName("administrator")
                .token("SECRET-TOKEN")
                .build();

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("agentId", 99L);
        metadata.put("__task_state", "goal: refactor module X");
        metadata.put("__delegate_depth", 1);

        AgentSession session = AgentSession.builder()
                .sessionId("sess-1")
                .conversationId("conv-1")
                .traceId("trace-1")
                .identity(identity)
                .mode(AgentMode.EXECUTE)
                .maxIterations(15)
                .modelName("deepseek-chat")
                .systemPrompt("you are helpful")
                .toolIds(new LinkedHashSet<>(Arrays.asList("web_search", "delegate_task")))
                .metadata(metadata)
                .build();

        session.getExecution().setIteration(6);
        session.getExecution().setLastPromptTokens(12345);
        session.getExecution().activateSkill("skill-a");
        session.getExecution().transitionTo(AgentState.SUSPENDED);
        session.getExecution().setMessages(Arrays.asList(
                ConversationMessage.system("you are helpful"),
                ConversationMessage.user("do the task"),
                ConversationMessage.builder()
                        .role("assistant")
                        .content("let me search")
                        .reasoningContent("thinking...")
                        .toolCalls(Collections.singletonList(
                                new ConversationMessage.ToolCallInfo(
                                        "c1", "function", "web_search", "{\"q\":\"x\"}")))
                        .build(),
                ConversationMessage.toolResult("c1", "web_search", "search output")));
        return session;
    }

    @Test
    void encodeFillsIndexedColumnsAndOmitsToken() throws Exception {
        AgentStateSnapshot snapshot = codec.encode(buildSession());

        assertThat(snapshot.getSessionId()).isEqualTo("sess-1");
        assertThat(snapshot.getConversationId()).isEqualTo("conv-1");
        assertThat(snapshot.getAgentId()).isEqualTo("99");
        assertThat(snapshot.getIteration()).isEqualTo(6);
        assertThat(snapshot.getTimestamp()).isPositive();
        // Security invariant: the auth token must never reach persistence.
        assertThat(snapshot.getV2SessionJson())
                .isNotBlank()
                .doesNotContain("SECRET-TOKEN");
    }

    @Test
    void roundTripPreservesSessionState() throws Exception {
        AgentStateSnapshot snapshot = codec.encode(buildSession());
        AgentSession restored = codec.decode(snapshot, "FRESH-TOKEN");

        assertThat(restored).isNotNull();
        assertThat(restored.getSessionId()).isEqualTo("sess-1");
        assertThat(restored.getConversationId()).isEqualTo("conv-1");
        assertThat(restored.getTraceId()).isEqualTo("trace-1");
        assertThat(restored.getMode()).isEqualTo(AgentMode.EXECUTE);
        assertThat(restored.getMaxIterations()).isEqualTo(15);
        assertThat(restored.getModelName()).isEqualTo("deepseek-chat");
        assertThat(restored.getSystemPrompt()).isEqualTo("you are helpful");
        assertThat(restored.getToolIds()).containsExactlyInAnyOrder("web_search", "delegate_task");

        // Identity restored with the fresh token, not the persisted one.
        assertThat(restored.getIdentity()).isNotNull();
        assertThat(restored.getIdentity().getUserId()).isEqualTo(42L);
        assertThat(restored.getIdentity().getTenantId()).isEqualTo(7L);
        assertThat(restored.getIdentity().getUserName()).isEqualTo("Alice");
        assertThat(restored.getIdentity().getAccount()).isEqualTo("alice");
        assertThat(restored.getIdentity().getRoleName()).isEqualTo("administrator");
        assertThat(restored.getIdentity().getToken()).isEqualTo("FRESH-TOKEN");

        // Metadata (scratchpad task state, delegate depth, agentId) survives.
        assertThat(restored.getMetadata())
                .containsEntry("__task_state", "goal: refactor module X")
                .containsEntry("__delegate_depth", 1);

        // Execution state round-trips.
        assertThat(restored.getExecution().getIteration()).isEqualTo(6);
        assertThat(restored.getExecution().getLastPromptTokens()).isEqualTo(12345);
        assertThat(restored.getExecution().getActivatedSkillNames()).containsExactly("skill-a");
        assertThat(restored.getExecution().getCurrentState()).isEqualTo(AgentState.SUSPENDED);

        assertThat(restored.getExecution().getMessages()).hasSize(4);
        ConversationMessage assistant = restored.getExecution().getMessages().get(2);
        assertThat(assistant.getRole()).isEqualTo("assistant");
        assertThat(assistant.getContent()).isEqualTo("let me search");
        assertThat(assistant.getReasoningContent()).isEqualTo("thinking...");
        assertThat(assistant.getToolCalls()).hasSize(1);
        ConversationMessage.ToolCallInfo tc = assistant.getToolCalls().get(0);
        assertThat(tc.getId()).isEqualTo("c1");
        assertThat(tc.getType()).isEqualTo("function");
        assertThat(tc.getFunctionName()).isEqualTo("web_search");
        assertThat(tc.getFunctionArguments()).isEqualTo("{\"q\":\"x\"}");
        ConversationMessage tool = restored.getExecution().getMessages().get(3);
        assertThat(tool.getRole()).isEqualTo("tool");
        assertThat(tool.getToolCallId()).isEqualTo("c1");
        assertThat(tool.getName()).isEqualTo("web_search");
        assertThat(tool.getContent()).isEqualTo("search output");
    }

    @Test
    void decodeReturnsNullForMissingOrLegacySnapshots() throws Exception {
        assertThat(codec.decode(null, "t")).isNull();
        // Legacy V1 row: no v2SessionJson payload.
        AgentStateSnapshot legacy = AgentStateSnapshot.builder()
                .sessionId("old")
                .timestamp(1L)
                .build();
        assertThat(codec.decode(legacy, "t")).isNull();
    }

    @Test
    void roundTripPreservesPendingToolCalls() throws Exception {
        // Pending (not-yet-executed) tool calls are the suspension checkpoint —
        // losing them across a restart would strand a paused task forever.
        AgentSession session = buildSession();
        session.getExecution().setPendingToolCalls(Arrays.asList(
                new InferenceResponse.ToolCallData("pc-1", "fe_tool", "{\"a\":1}"),
                new InferenceResponse.ToolCallData("pc-2", "insert_block", "{\"content\":\"hi\"}")));

        AgentStateSnapshot snapshot = codec.encode(session);
        AgentSession restored = codec.decode(snapshot, "T");

        assertThat(restored.getExecution().getPendingToolCalls()).hasSize(2);
        InferenceResponse.ToolCallData first = restored.getExecution().getPendingToolCalls().get(0);
        assertThat(first.getId()).isEqualTo("pc-1");
        assertThat(first.getName()).isEqualTo("fe_tool");
        assertThat(first.getArguments()).isEqualTo("{\"a\":1}");
        InferenceResponse.ToolCallData second = restored.getExecution().getPendingToolCalls().get(1);
        assertThat(second.getId()).isEqualTo("pc-2");
        assertThat(second.getName()).isEqualTo("insert_block");
        assertThat(second.getArguments()).isEqualTo("{\"content\":\"hi\"}");
    }
}
