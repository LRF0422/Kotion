package com.knowledge.agent.core.loop;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.context.ContextManager;
import com.knowledge.agent.core.event.RunEventLog;
import com.knowledge.agent.core.event.RunEvents;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.RunStatus;
import com.knowledge.agent.core.run.TodoItem;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
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
 * The run may not end with rows still open on its task list.
 *
 * <p>A model that summarizes and stops with five of six rows untouched leaves a
 * panel that claims work the run never did, so the loop nudges it to continue
 * (or to name the blocker) — bounded, and only once per distinct open list, so a
 * genuinely blocked model cannot spin.
 */
class AgentLoopTodoGuardTest {

    private final RunEventLog eventLog = mock(RunEventLog.class);

    @Test
    void nudgesWhenTheTurnEndsWithOpenRows() {
        Checkpoint checkpoint = checkpoint();
        checkpoint.getTodos().add(TodoItem.of("t1", "读现状", TodoItem.COMPLETED));
        checkpoint.getTodos().add(TodoItem.of("t2", "改代码", TodoItem.PENDING));
        AgentLoop loop = loop(runningRun("execute"), checkpoint);

        assertTrue(loop.continueForUnfinishedTodos());

        ChatMessage nudge = checkpoint.getMessages().get(checkpoint.getMessages().size() - 1);
        assertEquals("user", nudge.getRole(), "providers reject a second system message");
        assertEquals(ContextManager.SYSTEM_NUDGE_NAME, nudge.getName());
        assertTrue(ContextManager.isEngineAuthoredUserTurn(nudge),
                "the nudge must stay out of every persistence/UI projection");
        assertTrue(nudge.getContent().contains("改代码"), "the open row is named");
        assertTrue(nudge.getContent().contains("1 项"), "the count is named");
        assertFalse(nudge.getContent().contains("读现状"), "finished rows are not re-listed");
    }

    @Test
    void completesWhenEveryRowIsDone() {
        Checkpoint checkpoint = checkpoint();
        checkpoint.getTodos().add(TodoItem.of("t1", "读现状", TodoItem.COMPLETED));
        AgentLoop loop = loop(runningRun("execute"), checkpoint);

        assertFalse(loop.continueForUnfinishedTodos());
        assertEquals(1, checkpoint.getMessages().size(), "nothing is injected");
    }

    @Test
    void aRunWithoutATaskListIsNeverNudged() {
        AgentLoop loop = loop(runningRun("execute"), checkpoint());
        assertFalse(loop.continueForUnfinishedTodos());
    }

    @Test
    void secondStopWithTheSameOpenListIsABlocker() {
        Checkpoint checkpoint = checkpoint();
        checkpoint.getTodos().add(TodoItem.of("t1", "改代码", TodoItem.PENDING));
        AgentLoop loop = loop(runningRun("execute"), checkpoint);

        assertTrue(loop.continueForUnfinishedTodos());
        assertFalse(loop.continueForUnfinishedTodos(),
                "an identical open list means it is stuck — nudge once, then let it stop");
    }

    @Test
    void nudgingIsBoundedEvenWhileTheListKeepsMoving() {
        Checkpoint checkpoint = checkpoint();
        checkpoint.getTodos().add(TodoItem.of("t1", "一", TodoItem.PENDING));
        AgentLoop loop = loop(runningRun("execute"), checkpoint);

        assertTrue(loop.continueForUnfinishedTodos());
        checkpoint.getTodos().get(0).setStatus(TodoItem.IN_PROGRESS);
        assertTrue(loop.continueForUnfinishedTodos());
        // Budget spent: a model that keeps promising without finishing must not
        // be able to grow one run forever.
        checkpoint.getTodos().get(0).setTitle("一（换个说法）");
        assertFalse(loop.continueForUnfinishedTodos());
    }

    @Test
    void planModeAndPureTextRunsAreNotNudged() {
        Checkpoint planCheckpoint = checkpoint();
        planCheckpoint.getTodos().add(TodoItem.of("t1", "改代码", TodoItem.PENDING));
        assertFalse(loop(runningRun("plan"), planCheckpoint).continueForUnfinishedTodos(),
                "plan mode ends through present_plan, not through edits");

        Checkpoint noTools = checkpoint();
        noTools.setNoTools(true);
        noTools.getTodos().add(TodoItem.of("t1", "改代码", TodoItem.PENDING));
        assertFalse(loop(runningRun("execute"), noTools).continueForUnfinishedTodos(),
                "a pure-text run cannot update its list, so it cannot be asked to");
    }

    private static Checkpoint checkpoint() {
        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setRunId("run-1");
        checkpoint.setMessages(new ArrayList<>(List.of(
                ChatMessage.builder().role("system").content("sys").build())));
        return checkpoint;
    }

    private static AgentRun runningRun(String mode) {
        AgentRun run = AgentRun.create("run-1", "conv-1", 2L, 1L, "model", mode, 1000L);
        run.setStatus(RunStatus.RUNNING.name());
        return run;
    }

    /**
     * Only run/checkpoint/eventLog/objectMapper matter for the guard; everything
     * the loop needs to actually infer is left null on purpose, so a test that
     * accidentally drives inference fails loudly instead of hanging.
     */
    private AgentLoop loop(AgentRun run, Checkpoint checkpoint) {
        when(eventLog.append(anyString(), anyString(), any(Map.class)))
                .thenReturn(new com.knowledge.agent.core.event.RunEvent(
                        1L, RunEvents.USER_MESSAGE, null, 0L));
        return new AgentLoop(run, checkpoint, null, null, null, eventLog,
                null, null, null, null, new com.fasterxml.jackson.databind.ObjectMapper(),
                null, null, null, new ResumeGate(), null, null);
    }
}
