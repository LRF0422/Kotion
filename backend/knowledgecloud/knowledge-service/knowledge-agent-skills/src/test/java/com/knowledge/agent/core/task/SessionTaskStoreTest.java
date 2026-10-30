package com.knowledge.agent.core.task;

import com.knowledge.agent.core.entity.AgentSessionTaskEntity;
import com.knowledge.agent.core.mapper.AgentSessionTaskMapper;
import com.knowledge.agent.core.run.TodoItem;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Snapshot-replacement semantics of the cross-session task index. */
class SessionTaskStoreTest {

    private final AgentSessionTaskMapper mapper = mock(AgentSessionTaskMapper.class);
    private final SessionTaskStore store = new SessionTaskStore(mapper);

    @Test
    void emptySnapshotClearsTheSessionsRows() {
        store.replaceSnapshot(1L, 2L, "s-1", "run-1", Collections.<TodoItem>emptyList());

        verify(mapper).deleteSession(1L, 2L, "s-1");
        verify(mapper, never()).upsert(any(AgentSessionTaskEntity.class));
        verify(mapper, never()).deleteMissing(anyLong(), anyLong(), anyString(), anyList());
    }

    @Test
    void nullSnapshotIsAlsoAClear() {
        store.replaceSnapshot(1L, 2L, "s-1", "run-1", null);

        verify(mapper).deleteSession(1L, 2L, "s-1");
    }

    @Test
    void snapshotUpsertsEveryItemThenDeletesTheMissingOnes() {
        store.replaceSnapshot(1L, 2L, " s-1 ", "run-1", Arrays.asList(
                TodoItem.of("t1", "读现状", "done"),
                TodoItem.of("t2", "改代码", "running")));

        ArgumentCaptor<AgentSessionTaskEntity> captor =
                ArgumentCaptor.forClass(AgentSessionTaskEntity.class);
        verify(mapper, times(2)).upsert(captor.capture());
        List<AgentSessionTaskEntity> rows = captor.getAllValues();

        AgentSessionTaskEntity first = rows.get(0);
        assertEquals(1L, first.getTenantId());
        assertEquals(2L, first.getUserId());
        assertEquals("s-1", first.getSessionId(), "the session id is trimmed");
        assertEquals("t1", first.getItemId());
        assertEquals("读现状", first.getTitle());
        assertEquals(TodoItem.COMPLETED, first.getStatus(), "done is normalised to completed");
        assertEquals(0, first.getSortIndex());
        assertEquals("run-1", first.getRunId());
        assertNotNull(first.getCreateTime());
        assertTrue(first.getCreateTime() > 0);
        assertNotNull(first.getUpdateTime());

        assertEquals(TodoItem.IN_PROGRESS, rows.get(1).getStatus());
        assertEquals(1, rows.get(1).getSortIndex());

        // Whole-list semantics: rows outside the snapshot are removed.
        verify(mapper).deleteMissing(1L, 2L, "s-1", Arrays.asList("t1", "t2"));
    }

    @Test
    void unknownStatusFallsBackToPending() {
        store.replaceSnapshot(1L, 2L, "s-1", "run-1",
                Collections.singletonList(TodoItem.of("t1", "一", "whatever")));

        ArgumentCaptor<AgentSessionTaskEntity> captor =
                ArgumentCaptor.forClass(AgentSessionTaskEntity.class);
        verify(mapper).upsert(captor.capture());
        assertEquals(TodoItem.PENDING, captor.getValue().getStatus());
    }

    @Test
    void dropsUnusableItemsAndTruncatesOverlongColumns() {
        StringBuilder longTitle = new StringBuilder();
        for (int i = 0; i < 600; i++) {
            longTitle.append('x');
        }
        StringBuilder longId = new StringBuilder();
        for (int i = 0; i < 100; i++) {
            longId.append('i');
        }
        // Blank id / blank title rows are unusable; the long ones are truncated
        // to the column widths instead of failing the write.
        List<TodoItem> items = Arrays.asList(
                null,
                TodoItem.of("  ", "no id", "pending"),
                TodoItem.of("t-ok", longTitle.toString(), "pending"),
                TodoItem.of(longId.toString(), "long id", "pending"));

        store.replaceSnapshot(1L, 2L, "s-1", "run-1", items);

        ArgumentCaptor<AgentSessionTaskEntity> captor =
                ArgumentCaptor.forClass(AgentSessionTaskEntity.class);
        verify(mapper, times(2)).upsert(captor.capture());
        List<AgentSessionTaskEntity> rows = captor.getAllValues();
        assertEquals(SessionTaskStore.MAX_TITLE_LENGTH, rows.get(0).getTitle().length());
        assertEquals(SessionTaskStore.MAX_ITEM_ID_LENGTH, rows.get(1).getItemId().length());
        verify(mapper).deleteMissing(1L, 2L, "s-1",
                Arrays.asList("t-ok", rows.get(1).getItemId()));
    }

    @Test
    void snapshotWithNoUsableItemClearsTheSession() {
        store.replaceSnapshot(1L, 2L, "s-1", "run-1",
                Collections.singletonList(TodoItem.of(null, "untitled", "pending")));

        verify(mapper).deleteSession(1L, 2L, "s-1");
        verify(mapper, never()).upsert(any(AgentSessionTaskEntity.class));
    }

    @Test
    void listOpenClampsTheLimitToOneToFiveHundred() {
        when(mapper.selectOpenByOwner(anyLong(), anyLong(), anyInt()))
                .thenReturn(Collections.<AgentSessionTaskEntity>emptyList());

        store.listOpen(1L, 2L, 10_000);
        verify(mapper).selectOpenByOwner(1L, 2L, SessionTaskStore.MAX_OPEN_LIMIT);

        store.listOpen(1L, 2L, 0);
        verify(mapper).selectOpenByOwner(1L, 2L, 1);

        store.listOpen(1L, 2L, 50);
        verify(mapper).selectOpenByOwner(1L, 2L, 50);
    }

    @Test
    void listOpenTreatsANullMapperResultAsEmpty() {
        when(mapper.selectOpenByOwner(anyLong(), anyLong(), anyInt())).thenReturn(null);

        assertTrue(store.listOpen(1L, 2L, 200).isEmpty());
    }

    @Test
    void listOpenRequiresOwnerIdentity() {
        assertThrows(IllegalArgumentException.class, () -> store.listOpen(null, 2L, 200));
        assertThrows(IllegalArgumentException.class, () -> store.listOpen(1L, null, 200));
    }

    @Test
    void deleteSessionIsOwnerScopedAndBlankSafe() {
        when(mapper.deleteSession(1L, 2L, "s-1")).thenReturn(1);

        assertTrue(store.deleteSession(1L, 2L, "s-1"));
        assertFalse(store.deleteSession(1L, 2L, "   "));
    }

    @Test
    void replaceSnapshotRequiresIdentityAndSessionId() {
        assertThrows(IllegalArgumentException.class,
                () -> store.replaceSnapshot(null, 2L, "s-1", "run-1",
                        Collections.<TodoItem>emptyList()));
        assertThrows(IllegalArgumentException.class,
                () -> store.replaceSnapshot(1L, null, "s-1", "run-1",
                        Collections.<TodoItem>emptyList()));
        assertThrows(IllegalArgumentException.class,
                () -> store.replaceSnapshot(1L, 2L, "  ", "run-1",
                        Collections.<TodoItem>emptyList()));
    }
}
