package com.knowledge.agent.core.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.run.AgentRun;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionTranscriptProjectorTest {

    private final ChatSessionStore store = mock(ChatSessionStore.class);
    private final CheckpointStore checkpointStore = mock(CheckpointStore.class);
    private final SubAgentProjection subAgentProjection = mock(SubAgentProjection.class);
    private final ObjectMapper mapper = new ObjectMapper();
    private final SessionTranscriptProjector projector =
            new SessionTranscriptProjector(store, checkpointStore, mapper, subAgentProjection);

    @BeforeEach
    void stubCasWrite() {
        when(store.saveTranscriptCas(any(AgentChatSessionEntity.class))).thenReturn(true);
    }

    @Test
    void prepareHistorySeedsUserTurnAndModelLog() throws Exception {
        when(store.get(1L, 2L, "conv-1")).thenReturn(null);

        AgentRun run = run("run-1");
        List<ChatMessage> history = projector.prepareHistory(run, Collections.singletonList(user("你好")));

        assertEquals(1, history.size());
        assertEquals("你好", history.get(0).getContent());

        AgentChatSessionEntity saved = captureSaved();
        JsonNode model = mapper.readTree(saved.getModelMessagesJson());
        assertEquals(1, model.size());
        assertEquals("user", model.get(0).path("m").path("role").asText());
        JsonNode ui = mapper.readTree(saved.getMessagesJson());
        assertEquals("user", ui.get(0).path("sender").asText());
    }

    @Test
    void prepareHistoryAppendsOnlyTheNewUserTurn() throws Exception {
        AgentChatSessionEntity existing = new AgentChatSessionEntity();
        existing.setSessionId("conv-1");
        existing.setTitle("hi");
        existing.setModelMessagesJson("[{\"role\":\"user\",\"content\":\"hi\"},"
                + "{\"role\":\"assistant\",\"content\":\"hello\"}]");
        when(store.get(1L, 2L, "conv-1")).thenReturn(existing);

        List<ChatMessage> history = projector.prepareHistory(run("run-2"),
                Collections.singletonList(user("next")));

        assertEquals(3, history.size());
        assertEquals("next", history.get(2).getContent());
        AgentChatSessionEntity saved = captureSaved();
        JsonNode model = mapper.readTree(saved.getModelMessagesJson());
        assertEquals(3, model.size());
    }

    @Test
    void terminalRunInsertsAssistantAndToolStepsAtItsOwnBoundary() throws Exception {
        AgentChatSessionEntity existing = new AgentChatSessionEntity();
        existing.setSessionId("conv-1");
        existing.setTenantId(1L);
        existing.setUserId(2L);
        existing.setTitle("hi");
        existing.setCreateTime(100L);
        existing.setModelMessagesJson("[{\"role\":\"user\",\"content\":\"hi\"}]");
        when(store.get(1L, 2L, "conv-1")).thenReturn(existing);

        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setRunId("run-1");
        checkpoint.setInputMessageCount(2);
        checkpoint.setMessages(new ArrayList<>(Arrays.asList(
                ChatMessage.builder().role("system").content("sys").build(),
                ChatMessage.builder().role("user").content("hi").build(),
                ChatMessage.builder().role("assistant").content("let me check")
                        .toolCalls(Collections.singletonList(toolCall("call-1"))).build(),
                ChatMessage.builder().role("tool").toolCallId("call-1").name("search")
                        .content("{\"found\":true}").build(),
                ChatMessage.builder().role("assistant").content("done").build()
        )));
        when(checkpointStore.load("run-1")).thenReturn(checkpoint);

        projector.onRunTerminal(run("run-1"));

        AgentChatSessionEntity saved = captureSaved();
        JsonNode model = mapper.readTree(saved.getModelMessagesJson());
        // user + assistant(tool_calls) + tool + assistant(text)
        assertEquals(4, model.size());
        JsonNode ui = mapper.readTree(saved.getMessagesJson());
        assertEquals(3, ui.size());
        // message_count caches the UI projection length, not the model-log length.
        assertEquals(3, saved.getMessageCount());
        JsonNode step = ui.get(1).path("steps").get(0);
        assertEquals("search", step.path("toolName").asText());
        assertEquals("success", step.path("status").asText());
        assertTrue(step.path("result").path("found").asBoolean());
        assertEquals("done", ui.get(2).path("content").asText());
    }

    @Test
    void terminalRunInsertsBeforeANewerTurnsUser() throws Exception {
        // A newer run already appended its user turn at index 1.
        AgentChatSessionEntity existing = new AgentChatSessionEntity();
        existing.setModelMessagesJson("[{\"role\":\"user\",\"content\":\"hi\"},"
                + "{\"role\":\"user\",\"content\":\"next\"}]");
        when(store.get(1L, 2L, "conv-1")).thenReturn(existing);

        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setRunId("run-1");
        checkpoint.setInputMessageCount(2); // this run's history ended at canonical index 1
        checkpoint.setMessages(new ArrayList<>(Arrays.asList(
                ChatMessage.builder().role("system").content("sys").build(),
                ChatMessage.builder().role("user").content("hi").build(),
                ChatMessage.builder().role("assistant").content("answer-1").build()
        )));
        when(checkpointStore.load("run-1")).thenReturn(checkpoint);

        projector.onRunTerminal(run("run-1"));

        JsonNode model = mapper.readTree(captureSaved().getModelMessagesJson());
        assertEquals(3, model.size());
        assertEquals("answer-1", model.get(1).path("m").path("content").asText());
        assertEquals("next", model.get(2).path("m").path("content").asText());
    }

    @Test
    void terminalProjectionIsSkippedWhenThisRunAlreadyProjected() {
        // A cancel path and a loop-exit path can both call onRunTerminal for the
        // same run; the second must be a no-op (provenance already records it).
        AgentChatSessionEntity existing = new AgentChatSessionEntity();
        existing.setSourceRunId("run-1");
        existing.setAsOfSeq(9L);
        when(store.get(1L, 2L, "conv-1")).thenReturn(existing);

        projector.onRunTerminal(run("run-1"));

        verify(store, never()).saveTranscriptCas(any(AgentChatSessionEntity.class));
    }

    @Test
    void childRunsAreNotProjected() {
        AgentRun run = run("run-child");
        run.setParentRunId("parent");
        projector.onRunTerminal(run);
        verify(store, never()).saveTranscriptCas(any(AgentChatSessionEntity.class));
    }

    @Test
    void prepareHistoryRetriesWhenTheCasWriteConflicts() {
        when(store.get(1L, 2L, "conv-1")).thenReturn(null);
        when(store.saveTranscriptCas(any(AgentChatSessionEntity.class))).thenReturn(false, true);

        List<ChatMessage> history = projector.prepareHistory(run("run-1"),
                Collections.singletonList(user("hi")));

        assertEquals(1, history.size());
        verify(store, times(2)).saveTranscriptCas(any(AgentChatSessionEntity.class));
    }

    @Test
    void prepareHistoryClosesADanglingToolCallFromAnAbandonedRun() throws Exception {
        // A run that suspended on a frontend tool and was never resumed leaves an
        // assistant tool_calls turn without results. The next run must repair the
        // pairing before appending its own user turn.
        AgentChatSessionEntity existing = new AgentChatSessionEntity();
        ChatMessage assistant = ChatMessage.builder()
                .role("assistant")
                .toolCalls(Collections.singletonList(toolCall("call-1")))
                .build();
        existing.setModelMessagesJson("[{\"m\":{\"role\":\"user\",\"content\":\"hi\"},\"t\":1},"
                + "{\"m\":" + mapper.writeValueAsString(assistant) + ",\"t\":2}]");
        when(store.get(1L, 2L, "conv-1")).thenReturn(existing);

        List<ChatMessage> history = projector.prepareHistory(run("run-2"),
                Collections.singletonList(user("next")));

        assertEquals(4, history.size());
        assertEquals("assistant", history.get(1).getRole());
        assertEquals("tool", history.get(2).getRole());
        assertEquals("call-1", history.get(2).getToolCallId());
        assertEquals("next", history.get(3).getContent());
    }

    @Test
    void userImageAttachmentIsProjectedAndPersisted() throws Exception {
        when(store.get(1L, 2L, "conv-1")).thenReturn(null);
        Map<String, Object> imageUrl = new LinkedHashMap<>();
        imageUrl.put("url", "data:image/png;base64,AAAA");
        Map<String, Object> part = new LinkedHashMap<>();
        part.put("type", "image_url");
        part.put("image_url", imageUrl);
        ChatMessage imageMessage = ChatMessage.builder()
                .role("user")
                .content("see this")
                .contentParts(new ArrayList<>(Collections.singletonList(part)))
                .build();

        projector.prepareHistory(run("run-1"), Collections.singletonList(imageMessage));

        AgentChatSessionEntity saved = captureSaved();
        JsonNode model = mapper.readTree(saved.getModelMessagesJson());
        assertEquals(1, model.get(0).path("m").path("contentParts").size());
        JsonNode ui = mapper.readTree(saved.getMessagesJson());
        assertEquals("data:image/png;base64,AAAA", ui.get(0).path("images").get(0).asText());
    }

    @Test
    void delegatedChildrenAreProjectedIntoTheAssistantNode() throws Exception {
        AgentChatSessionEntity existing = new AgentChatSessionEntity();
        existing.setSessionId("conv-1");
        existing.setTenantId(1L);
        existing.setUserId(2L);
        existing.setTitle("hi");
        existing.setModelMessagesJson("[{\"role\":\"user\",\"content\":\"hi\"}]");
        when(store.get(1L, 2L, "conv-1")).thenReturn(existing);

        SubAgentProjection.Projection projection = new SubAgentProjection.Projection();
        com.fasterxml.jackson.databind.node.ObjectNode sub = mapper.createObjectNode();
        sub.put("callId", "call-1");
        sub.put("subRunId", "child-1");
        sub.put("task", "research");
        sub.put("status", "completed");
        projection.subRuns().put("call-1", sub);
        com.fasterxml.jackson.databind.node.ArrayNode childStep = mapper.createArrayNode();
        com.fasterxml.jackson.databind.node.ObjectNode step = mapper.createObjectNode();
        step.put("id", "c9");
        step.put("callId", "c9");
        step.put("toolName", "search");
        step.put("status", "success");
        step.put("subRunId", "child-1");
        childStep.add(step);
        projection.toolSteps().put("call-1", childStep);
        when(subAgentProjection.project("run-1")).thenReturn(projection);

        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setRunId("run-1");
        checkpoint.setInputMessageCount(2);
        checkpoint.setMessages(new ArrayList<>(Arrays.asList(
                ChatMessage.builder().role("system").content("sys").build(),
                ChatMessage.builder().role("user").content("hi").build(),
                ChatMessage.builder().role("assistant").content("delegating")
                        .toolCalls(Collections.singletonList(new ChatMessage.ToolCallInfo(
                                "call-1", "function",
                                new ChatMessage.ToolCallInfo.FunctionInfo("delegate", "{\"task\":\"research\"}"))))
                        .build()
        )));
        when(checkpointStore.load("run-1")).thenReturn(checkpoint);

        projector.onRunTerminal(run("run-1"));

        JsonNode ui = mapper.readTree(captureSaved().getMessagesJson());
        JsonNode assistant = ui.get(1);
        assertEquals("child-1", assistant.path("subRuns").get(0).path("subRunId").asText());
        assertEquals("research", assistant.path("subRuns").get(0).path("task").asText());
        boolean childToolStepProjected = false;
        for (JsonNode s : assistant.path("steps")) {
            if ("c9".equals(s.path("callId").asText()) && "child-1".equals(s.path("subRunId").asText())) {
                childToolStepProjected = true;
            }
        }
        assertTrue(childToolStepProjected, "the child's tool call must be projected with its subRunId");
    }

    private AgentChatSessionEntity captureSaved() {
        ArgumentCaptor<AgentChatSessionEntity> captor = ArgumentCaptor.forClass(AgentChatSessionEntity.class);
        verify(store).saveTranscriptCas(captor.capture());
        return captor.getValue();
    }

    private AgentRun run(String runId) {
        AgentRun run = new AgentRun();
        run.setRunId(runId);
        run.setConversationId("conv-1");
        run.setUserId(2L);
        run.setTenantId(1L);
        run.setCreateTime(1000L);
        run.setLastSeq(9L);
        return run;
    }

    private ChatMessage user(String content) {
        return ChatMessage.builder().role("user").content(content).build();
    }

    private ChatMessage.ToolCallInfo toolCall(String id) {
        return new ChatMessage.ToolCallInfo(id, "function",
                new ChatMessage.ToolCallInfo.FunctionInfo("search", "{\"q\":\"x\"}"));
    }
}
