package com.knowledge.agent.core.loop;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.context.ContextManager;
import com.knowledge.agent.core.event.RunEvent;
import com.knowledge.agent.core.event.RunEventLog;
import com.knowledge.agent.core.event.RunEvents;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.RunStatus;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Mid-run steering: a user turn sent while the run is executing.
 *
 * <p>Two rules have to hold or the feature corrupts the conversation:
 * <ul>
 *   <li>the message is never written into {@code checkpoint.messages} on
 *       arrival — a user turn landing between an assistant {@code tool_calls}
 *       and its {@code tool} results is an invalid request;</li>
 *   <li>the queue is sealed atomically with the decision to complete, so a
 *       message cannot be accepted by a run that is already finishing (that
 *       message would be lost instead of answered by a new run).</li>
 * </ul>
 */
class AgentLoopSteeringTest {

    private final RunEventLog eventLog = mock(RunEventLog.class);

    @Test
    void queuedTurnWaitsForTheSafeBoundary() {
        Checkpoint checkpoint = checkpoint();
        AgentLoop loop = loop(runningRun(), checkpoint);

        assertTrue(loop.enqueueUserTurn(user("also add a table")));
        // Not yet in the conversation: the current step's tool pairing is intact.
        assertEquals(1, checkpoint.getMessages().size());
        verify(eventLog, never()).append(anyString(), eq(RunEvents.USER_MESSAGE), any());

        assertEquals(1, loop.adoptPendingUserTurns());
        assertEquals(2, checkpoint.getMessages().size());
        ChatMessage adopted = checkpoint.getMessages().get(1);
        assertEquals("user", adopted.getRole());
        assertEquals("also add a table", adopted.getContent());
        verify(eventLog).append(eq("run-1"), eq(RunEvents.USER_MESSAGE), any());
    }

    @Test
    void queuedTurnsKeepTheirOrder() {
        Checkpoint checkpoint = checkpoint();
        AgentLoop loop = loop(runningRun(), checkpoint);

        loop.enqueueUserTurn(user("first"));
        loop.enqueueUserTurn(user("second"));

        assertEquals(2, loop.adoptPendingUserTurns());
        assertEquals("first", checkpoint.getMessages().get(1).getContent());
        assertEquals("second", checkpoint.getMessages().get(2).getContent());
        assertEquals(0, loop.adoptPendingUserTurns(), "a second drain has nothing left");
    }

    @Test
    void blankRoleIsRepairedToUser() {
        Checkpoint checkpoint = checkpoint();
        AgentLoop loop = loop(runningRun(), checkpoint);

        assertTrue(loop.enqueueUserTurn(ChatMessage.builder().content("steer").build()));
        loop.adoptPendingUserTurns();

        assertEquals("user", checkpoint.getMessages().get(1).getRole());
    }

    @Test
    void terminalRunTakesNoMoreTurns() {
        AgentRun run = runningRun();
        run.setStatus(RunStatus.COMPLETED.name());
        AgentLoop loop = loop(run, checkpoint());

        assertFalse(loop.enqueueUserTurn(user("too late")));
    }

    @Test
    void sealRejectsTurnsThatWouldOtherwiseBeDropped() {
        AgentLoop loop = loop(runningRun(), checkpoint());

        // Nothing queued → this is the decision to complete, so seal.
        assertEquals(0, loop.closeOrAdoptPendingUserTurns());
        assertFalse(loop.isAcceptingUserTurns());
        assertFalse(loop.enqueueUserTurn(user("raced")),
                "a turn accepted after the seal could never be answered");
    }

    @Test
    void lastBoundaryAdoptsInsteadOfCompleting() {
        Checkpoint checkpoint = checkpoint();
        AgentLoop loop = loop(runningRun(), checkpoint);
        loop.enqueueUserTurn(user("wait, use the other page"));

        // The run was about to complete; the queued turn revives it.
        assertEquals(1, loop.closeOrAdoptPendingUserTurns());
        assertEquals(2, checkpoint.getMessages().size());
        assertTrue(loop.isAcceptingUserTurns(), "the run continues, so steering stays open");
    }

    @Test
    void queueIsBounded() {
        AgentLoop loop = loop(runningRun(), checkpoint());

        for (int i = 0; i < 8; i++) {
            assertTrue(loop.enqueueUserTurn(user("turn-" + i)));
        }
        assertFalse(loop.enqueueUserTurn(user("too many")),
                "an unbounded queue would let one run grow its prompt without limit");
    }

    @Test
    void engineNudgeIsNotAUserTurn() {
        ChatMessage nudge = ChatMessage.builder()
                .role("user")
                .name(ContextManager.SYSTEM_NUDGE_NAME)
                .content("[系统] 继续")
                .build();

        assertTrue(ContextManager.isEngineAuthoredUserTurn(nudge));
        assertFalse(ContextManager.isEngineAuthoredUserTurn(user("real")));
        assertFalse(ContextManager.isInjectedContext(nudge),
                "the nudge is scaffolding, not cached per-turn context");
    }

    private static ChatMessage user(String content) {
        return ChatMessage.builder().role("user").content(content).build();
    }

    private static Checkpoint checkpoint() {
        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setRunId("run-1");
        checkpoint.setMessages(new ArrayList<>(List.of(
                ChatMessage.builder().role("system").content("sys").build())));
        return checkpoint;
    }

    private static AgentRun runningRun() {
        AgentRun run = AgentRun.create("run-1", "conv-1", 2L, 1L, "model", "execute", 1000L);
        run.setStatus(RunStatus.RUNNING.name());
        return run;
    }

    /**
     * Only run/checkpoint/eventLog/objectMapper matter for the queue surface;
     * everything the loop needs to actually infer is left null on purpose, so a
     * test that accidentally drives inference fails loudly instead of hanging.
     */
    private AgentLoop loop(AgentRun run, Checkpoint checkpoint) {
        when(eventLog.append(anyString(), anyString(), any(Map.class)))
                .thenReturn(new RunEvent(1L, RunEvents.USER_MESSAGE, null, 0L));
        return new AgentLoop(run, checkpoint, null, null, null, eventLog,
                null, null, null, null, new com.fasterxml.jackson.databind.ObjectMapper(),
                null, null, null, new ResumeGate(), null, null);
    }
}
