package com.knowledge.agent.core.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.mapper.AgentChatSessionMapper;
import com.knowledge.agent.core.run.TodoItem;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Historical transcript → task-index backfill: extraction rules and loop semantics. */
class SessionTaskBackfillTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final String TRANSCRIPT_WITH_TODOS =
            "[{\"sender\":\"user\",\"content\":\"做点事\"},"
                    + "{\"sender\":\"ai\",\"content\":\"好的\",\"todos\":["
                    + "{\"id\":\"t1\",\"title\":\"读现状\",\"status\":\"completed\"},"
                    + "{\"id\":\"t2\",\"title\":\"改代码\",\"status\":\"in_progress\"}]}]";

    private final AgentChatSessionMapper sessionMapper = mock(AgentChatSessionMapper.class);
    private final SessionTaskStore taskStore = mock(SessionTaskStore.class);
    private final AgentCoreProperties properties = new AgentCoreProperties();
    private final SessionTaskBackfill backfill =
            new SessionTaskBackfill(sessionMapper, taskStore, MAPPER, properties);

    // ==================== extractLastTodos ====================

    @Test
    void extractReturnsEmptyWithoutAiNodesOrTodos() {
        assertTrue(SessionTaskBackfill.extractLastTodos(
                "[{\"sender\":\"user\",\"content\":\"hi\"}]", MAPPER).isEmpty());

        assertTrue(SessionTaskBackfill.extractLastTodos(
                "[{\"sender\":\"ai\",\"content\":\"done, nothing planned\"}]", MAPPER).isEmpty());

        // Only ai nodes carry the run's snapshot; a stray todos field on another
        // sender is not the conversation's task list.
        assertTrue(SessionTaskBackfill.extractLastTodos(
                "[{\"sender\":\"tool\",\"todos\":[{\"title\":\"x\"}]}]", MAPPER).isEmpty());
    }

    @Test
    void extractTakesTheLastAiSnapshot() {
        String json = "[{\"sender\":\"ai\",\"todos\":["
                + "{\"id\":\"t1\",\"title\":\"旧计划\",\"status\":\"completed\"}]},"
                + "{\"sender\":\"user\",\"content\":\"继续\"},"
                + "{\"sender\":\"ai\",\"todos\":["
                + "{\"id\":\"t2\",\"title\":\"新一\",\"status\":\"done\"},"
                + "{\"id\":\"t3\",\"title\":\"新二\",\"status\":\"running\"}]}]";

        List<TodoItem> items = SessionTaskBackfill.extractLastTodos(json, MAPPER);

        assertEquals(2, items.size());
        assertEquals("t2", items.get(0).getId());
        assertEquals("新一", items.get(0).getTitle());
        assertEquals(TodoItem.COMPLETED, items.get(0).getStatus(), "done is normalised");
        assertEquals("t3", items.get(1).getId());
        assertEquals(TodoItem.IN_PROGRESS, items.get(1).getStatus(), "running is normalised");
    }

    @Test
    void extractReturnsEmptyForEmptyLatestSnapshot() {
        // A session whose newest ai node has an empty list has no open tasks.
        String json = "[{\"sender\":\"ai\",\"todos\":["
                + "{\"id\":\"t1\",\"title\":\"旧\",\"status\":\"pending\"}]},"
                + "{\"sender\":\"ai\",\"todos\":[]}]";

        assertTrue(SessionTaskBackfill.extractLastTodos(json, MAPPER).isEmpty());
    }

    @Test
    void extractSkipsBlankTitlesAndFallsBackForUnknownStatus() {
        String json = "[{\"sender\":\"ai\",\"todos\":["
                + "{\"id\":\"t1\",\"title\":\"   \",\"status\":\"pending\"},"
                + "{\"title\":\"没有 id\"},"
                + "{\"id\":\"t3\",\"title\":\"怪状态\",\"status\":\"whatever\"},"
                + "\"not-an-object\"]}]";

        List<TodoItem> items = SessionTaskBackfill.extractLastTodos(json, MAPPER);

        assertEquals(2, items.size());
        assertEquals("", items.get(0).getId(), "a missing id stays missing; the store drops it");
        assertEquals(TodoItem.PENDING, items.get(1).getStatus());
    }

    @Test
    void extractIsDefensiveAboutBrokenInput() {
        assertTrue(SessionTaskBackfill.extractLastTodos(null, MAPPER).isEmpty());
        assertTrue(SessionTaskBackfill.extractLastTodos("   ", MAPPER).isEmpty());
        assertTrue(SessionTaskBackfill.extractLastTodos("not-json[", MAPPER).isEmpty());
        assertTrue(SessionTaskBackfill.extractLastTodos("{\"sender\":\"ai\"}", MAPPER).isEmpty());
        assertTrue(SessionTaskBackfill.extractLastTodos("[1,2,3]", MAPPER).isEmpty());
        assertDoesNotThrow(() -> SessionTaskBackfill.extractLastTodos(TRANSCRIPT_WITH_TODOS, null));
    }

    // ==================== backfill ====================

    @Test
    void backfillWritesSessionsWithTasksAndMarksEveryRow() {
        when(sessionMapper.selectTasksBackfillCandidates(anyInt())).thenReturn(Arrays.asList(
                session(1L, 10L, 20L, "s-1", TRANSCRIPT_WITH_TODOS),
                session(2L, 10L, 20L, "s-2",
                        "[{\"sender\":\"ai\",\"content\":\"no task list here\"}]")));

        backfill.backfill();

        verify(taskStore).replaceSnapshot(eq(10L), eq(20L), eq("s-1"), isNull(),
                argThat(items -> items.size() == 2
                        && "t2".equals(items.get(1).getId())
                        && TodoItem.IN_PROGRESS.equals(items.get(1).getStatus())));
        verify(taskStore, times(1)).replaceSnapshot(any(), any(), anyString(), any(), any());
        // Both rows are consumed from the queue, including the one without tasks
        // (otherwise it would be rescanned on every boot).
        verify(sessionMapper).markTasksIndexed(1L);
        verify(sessionMapper).markTasksIndexed(2L);
    }

    @Test
    void backfillStillMarksRowsWhoseWriteFails() {
        when(sessionMapper.selectTasksBackfillCandidates(anyInt())).thenReturn(
                Collections.singletonList(session(1L, 10L, 20L, "s-1", TRANSCRIPT_WITH_TODOS)));
        doThrow(new RuntimeException("db down"))
                .when(taskStore).replaceSnapshot(any(), any(), anyString(), any(), any());

        assertDoesNotThrow(() -> backfill.backfill());

        verify(sessionMapper).markTasksIndexed(1L);
    }

    @Test
    void backfillStopsAsSoonAsTheQueueIsEmpty() {
        when(sessionMapper.selectTasksBackfillCandidates(anyInt()))
                .thenReturn(Collections.<AgentChatSessionEntity>emptyList());

        backfill.backfill();

        verifyNoInteractions(taskStore);
        verify(sessionMapper, never()).markTasksIndexed(any());
    }

    @Test
    void backfillHonoursTheConfiguredLimit() {
        properties.getSessionTasks().setBackfillLimit(1);
        when(sessionMapper.selectTasksBackfillCandidates(1)).thenReturn(Arrays.asList(
                session(1L, 10L, 20L, "s-1", TRANSCRIPT_WITH_TODOS),
                session(2L, 10L, 20L, "s-2", TRANSCRIPT_WITH_TODOS)));

        backfill.backfill();

        verify(sessionMapper).selectTasksBackfillCandidates(1);
        verify(sessionMapper).markTasksIndexed(1L);
        verify(sessionMapper, never()).markTasksIndexed(2L);
    }

    @Test
    void backfillPagesThroughBatches() {
        properties.getSessionTasks().setBackfillBatchSize(2);
        when(sessionMapper.selectTasksBackfillCandidates(2))
                .thenReturn(Arrays.asList(
                        session(1L, 10L, 20L, "s-1", TRANSCRIPT_WITH_TODOS),
                        session(2L, 10L, 20L, "s-2", TRANSCRIPT_WITH_TODOS)))
                .thenReturn(Collections.<AgentChatSessionEntity>emptyList());

        backfill.backfill();

        verify(sessionMapper, times(2)).selectTasksBackfillCandidates(2);
        verify(sessionMapper).markTasksIndexed(1L);
        verify(sessionMapper).markTasksIndexed(2L);
    }

    @Test
    void backfillWithLimitZeroDoesNothing() {
        properties.getSessionTasks().setBackfillLimit(0);

        backfill.backfill();

        verifyNoInteractions(sessionMapper, taskStore);
    }

    @Test
    void scheduleDoesNotStartAThreadWhenDisabled() {
        properties.getSessionTasks().setBackfillEnabled(false);

        backfill.schedule();

        assertFalse(backfill.isStarted());
        verifyNoInteractions(sessionMapper, taskStore);
    }

    // ==================== fixtures ====================

    private AgentChatSessionEntity session(long id, long tenantId, long userId,
                                           String sessionId, String messagesJson) {
        AgentChatSessionEntity entity = new AgentChatSessionEntity();
        entity.setId(id);
        entity.setTenantId(tenantId);
        entity.setUserId(userId);
        entity.setSessionId(sessionId);
        entity.setMessagesJson(messagesJson);
        return entity;
    }
}
