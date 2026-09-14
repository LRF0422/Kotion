package com.knowledge.agent.core.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.run.AgentRun;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionTranscriptProjectorTest {

    private final ChatSessionStore store = mock(ChatSessionStore.class);
    private final CheckpointStore checkpointStore = mock(CheckpointStore.class);
    private final ObjectMapper mapper = new ObjectMapper();
    private final SessionTranscriptProjector projector =
            new SessionTranscriptProjector(store, checkpointStore, mapper);

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
    void childRunsAreNotProjected() {
        AgentRun run = run("run-child");
        run.setParentRunId("parent");
        projector.onRunTerminal(run);
        verify(store, never()).saveTranscript(any(AgentChatSessionEntity.class));
    }

    private AgentChatSessionEntity captureSaved() {
        ArgumentCaptor<AgentChatSessionEntity> captor = ArgumentCaptor.forClass(AgentChatSessionEntity.class);
        verify(store).saveTranscript(captor.capture());
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
