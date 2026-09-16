package com.knowledge.agent.core.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.knowledge.agent.core.event.RunEvent;
import com.knowledge.agent.core.event.RunEventLog;
import com.knowledge.agent.core.event.RunEvents;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The sub-agent panel must come back from the durable run log after a reload
 * (the engine projects it into {@code agent_chat_session.messages_json}). This
 * pins the event reduction that mirrors the frontend's {@code applySubRunEvent}.
 */
class SubAgentProjectionTest {

    private final RunEventLog eventLog = mock(RunEventLog.class);
    private final SubAgentProjection projection = new SubAgentProjection(eventLog, new ObjectMapper());

    @Test
    void reducesParentSpawnAndChildLogIntoARenderableSubRun() {
        when(eventLog.replay(eq("parent-1"), anyLong(), anyInt())).thenReturn(Arrays.asList(
                event(1, RunEvents.SUB_SPAWNED, RunEvents.subSpawned("call-1", "child-1", "research news")),
                event(5, RunEvents.SUB_COMPLETED,
                        RunEvents.subCompleted("call-1", "child-1", true, "the result"))));
        Map<String, Object> toolResult = new LinkedHashMap<>();
        toolResult.put("found", true);
        when(eventLog.replay(eq("child-1"), anyLong(), anyInt())).thenReturn(Arrays.asList(
                event(1, RunEvents.STEP_STARTED, RunEvents.stepStarted(1)),
                event(2, RunEvents.TEXT_DELTA, RunEvents.textDelta("hello ")),
                event(3, RunEvents.TEXT_DELTA, RunEvents.textDelta("world")),
                event(4, RunEvents.TOOL_REQUESTED, RunEvents.toolRequested("c9", "search", "{\"q\":\"x\"}")),
                event(5, RunEvents.TOOL_COMPLETED,
                        RunEvents.toolCompleted("c9", "search", true, toolResult, null, 12L)),
                event(6, RunEvents.RUN_COMPLETED, RunEvents.runCompleted("stop", 10, 5, 2))));

        SubAgentProjection.Projection result = projection.project("parent-1");

        assertEquals(1, result.subRuns().size());
        ObjectNode sub = result.subRuns().get("call-1");
        assertEquals("child-1", sub.path("subRunId").asText());
        assertEquals("research news", sub.path("task").asText());
        assertEquals("completed", sub.path("status").asText());
        assertEquals("the result", sub.path("result").asText());
        assertEquals(10, sub.path("usage").path("promptTokens").asInt());
        assertEquals(1, sub.path("steps").size());
        assertEquals("hello world", sub.path("steps").get(0).path("text").asText());
        assertEquals("step-1", sub.path("answerStepId").asText());

        ArrayNode toolSteps = result.toolSteps().get("call-1");
        assertEquals(1, toolSteps.size());
        assertEquals("search", toolSteps.get(0).path("toolName").asText());
        assertEquals("child-1", toolSteps.get(0).path("subRunId").asText());
        assertEquals("success", toolSteps.get(0).path("status").asText());
        assertEquals("{\"q\":\"x\"}", toolSteps.get(0).path("args").toString());
        assertTrue(toolSteps.get(0).path("result").path("found").asBoolean());
    }

    @Test
    void childFailureIsReflectedOnTheNode() {
        when(eventLog.replay(eq("parent-1"), anyLong(), anyInt())).thenReturn(Arrays.asList(
                event(1, RunEvents.SUB_SPAWNED, RunEvents.subSpawned("call-1", "child-1", "task")),
                event(2, RunEvents.SUB_FAILED, RunEvents.subFailed("call-1", "child-1", "boom"))));
        when(eventLog.replay(eq("child-1"), anyLong(), anyInt())).thenReturn(Collections.emptyList());

        ObjectNode sub = projection.project("parent-1").subRuns().get("call-1");

        assertEquals("failed", sub.path("status").asText());
        assertEquals("boom", sub.path("error").asText());
    }

    @Test
    void runWithoutDelegationsProjectsNothing() {
        when(eventLog.replay(eq("parent-1"), anyLong(), anyInt())).thenReturn(Collections.emptyList());

        assertTrue(projection.project("parent-1").isEmpty());
    }

    private RunEvent event(long seq, String type, Map<String, Object> payload) {
        return new RunEvent(seq, type, payload, 0L);
    }
}
