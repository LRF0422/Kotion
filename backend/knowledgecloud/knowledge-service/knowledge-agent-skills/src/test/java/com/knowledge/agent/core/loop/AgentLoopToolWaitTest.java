package com.knowledge.agent.core.loop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.event.RunEvent;
import com.knowledge.agent.core.event.RunEventLog;
import com.knowledge.agent.core.event.RunEvents;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.PendingToolCall;
import com.knowledge.agent.core.run.RunStatus;
import com.knowledge.agent.core.run.RunStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The frontend-tool wait must not time out while an answer is already queued.
 *
 * <p>The wait's deadline is anchored to the ORIGINAL dispatch time so a crash
 * and rebuild never restarts the clock. That is the right bound, but it means a
 * loop that was slow to publish the pause (checkpoint/DB/Redis work happens
 * between announcing the calls and entering this wait) can arrive with the
 * deadline already spent — while the client's results sit in the gate. Failing
 * on the spot discarded them: the client's resume POST had been accepted (so it
 * believed it was delivered and kept re-submitting), and the run still died with
 * "等待编辑器工具结果超时".
 */
class AgentLoopToolWaitTest {

    private final RunEventLog eventLog = mock(RunEventLog.class);
    private final RunStore runStore = mock(RunStore.class);
    private final CheckpointStore checkpointStore = mock(CheckpointStore.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AgentCoreProperties properties = new AgentCoreProperties();

    @BeforeEach
    void stubEventLog() {
        when(eventLog.append(anyString(), anyString(), any(Map.class)))
                .thenReturn(new RunEvent(1L, RunEvents.TOOL_COMPLETED, null, 0L));
    }

    private AgentRun run() {
        AgentRun run = AgentRun.create("run-1", "conv-1", 2L, 1L, "model", "execute", 1000L);
        run.setStatus(RunStatus.RUNNING.name());
        return run;
    }

    private Checkpoint checkpointWith(String callId, long requestedAt) {
        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setRunId("run-1");
        checkpoint.setMessages(new ArrayList<>(List.of(
                ChatMessage.builder().role("assistant").content("calling the tool").build())));
        checkpoint.setPendingToolCalls(new ArrayList<>(List.of(
                PendingToolCall.of(callId, "load_skill", "{\"skill\":\"bitable\"}", requestedAt))));
        return checkpoint;
    }

    private ResumePayload results(String callId) {
        ResumePayload payload = new ResumePayload();
        payload.setAction("tool_results");
        ResumePayload.ToolResultItem item = new ResumePayload.ToolResultItem();
        item.setCallId(callId);
        item.setOk(true);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        item.setResult(result);
        payload.setToolResults(new ArrayList<>(List.of(item)));
        return payload;
    }

    private AgentLoop loop(AgentRun run, Checkpoint checkpoint, ResumeGate gate) {
        return new AgentLoop(run, checkpoint, null, runStore, checkpointStore, eventLog,
                null, null, null, null, objectMapper, properties,
                null, null, gate, null, null);
    }

    private long spentDeadline() {
        return System.currentTimeMillis()
                - (properties.getRun().getWaitingToolsTimeoutSeconds() + 5L) * 1000L;
    }

    @Test
    void resultsQueuedBeforeTheDeadlineAreAppliedEvenWhenTheLoopWasSlowToWait() throws Exception {
        Checkpoint checkpoint = checkpointWith("call-1", spentDeadline());
        ResumeGate gate = new ResumeGate();
        assertTrue(gate.offer(results("call-1")),
                "the client's resume was accepted and is queued in the gate");
        AgentLoop loop = loop(run(), checkpoint, gate);

        assertTrue(loop.dispatchWaitForPending(),
                "a queued answer must not be discarded by an already-spent deadline");
        assertTrue(checkpoint.getPendingToolCalls().isEmpty(), "the call is answered");
        assertTrue(checkpoint.getMessages().stream().anyMatch(message ->
                        "tool".equals(message.getRole()) && "call-1".equals(message.getToolCallId())),
                "the result reached the canonical conversation log");
    }

    @Test
    void aFreshWaitAppliesQueuedResults() throws Exception {
        Checkpoint checkpoint = checkpointWith("call-1", System.currentTimeMillis());
        ResumeGate gate = new ResumeGate();
        assertTrue(gate.offer(results("call-1")));
        AgentLoop loop = loop(run(), checkpoint, gate);

        assertTrue(loop.dispatchWaitForPending());
        assertTrue(checkpoint.getPendingToolCalls().isEmpty());
    }

    @Test
    void aSpentDeadlineWithoutAnAnswerStillFails() throws Exception {
        Checkpoint checkpoint = checkpointWith("call-1", spentDeadline());
        AgentRun run = run();

        assertFalse(loop(run, checkpoint, new ResumeGate()).dispatchWaitForPending(),
                "nothing was delivered and the deadline is long gone");
        assertEquals("FAILED", run.getStatus());
        assertEquals("tool_timeout", run.getErrorCode());
        assertFalse(checkpoint.getPendingToolCalls().isEmpty(),
                "the unanswered call stays pending for diagnosis");
    }
}
