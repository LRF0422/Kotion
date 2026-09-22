package com.knowledge.agent.core.supervisor;

import com.knowledge.agent.core.entity.AgentThreadEntity;
import com.knowledge.agent.core.mapper.AgentThreadMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ThreadStoreTest {

    private final AgentThreadMapper mapper = mock(AgentThreadMapper.class);
    private final ThreadStore store = new ThreadStore(mapper);

    private static AgentThreadEntity thread() {
        AgentThreadEntity entity = new AgentThreadEntity();
        entity.setThreadId("conv-1");
        entity.setTenantId(7L);
        entity.setUserId(11L);
        entity.setSummary("用户在做销售透视分析");
        entity.setTitle("销售透视分析");
        entity.setActiveRunId("run-9");
        return entity;
    }

    @Test
    void clearMemoryEmptiesSummaryAndTitleButKeepsActiveRun() {
        AgentThreadEntity entity = thread();
        when(mapper.selectByThreadId("conv-1")).thenReturn(entity);

        store.clearMemory("conv-1", 7L, 11L);

        ArgumentCaptor<AgentThreadEntity> captor = ArgumentCaptor.forClass(AgentThreadEntity.class);
        verify(mapper).upsertByThreadId(captor.capture());
        AgentThreadEntity written = captor.getValue();
        assertEquals("", written.getSummary());
        assertEquals("", written.getTitle());
        assertEquals("run-9", written.getActiveRunId());
    }

    @Test
    void clearMemoryIsANoopWhenThreadIsMissing() {
        when(mapper.selectByThreadId("conv-1")).thenReturn(null);

        store.clearMemory("conv-1", 7L, 11L);

        verify(mapper, never()).upsertByThreadId(any());
    }

    @Test
    void clearMemoryRefusesAnotherOwnersThread() {
        when(mapper.selectByThreadId("conv-1")).thenReturn(thread());

        store.clearMemory("conv-1", 8L, 11L);
        store.clearMemory("conv-1", 7L, 12L);

        verify(mapper, never()).upsertByThreadId(any());
    }

    @Test
    void summaryCasWritesOnlyWhenTheBaseStillMatches() {
        AgentThreadEntity entity = thread();
        entity.setSummary("old");
        when(mapper.selectByThreadId("conv-1")).thenReturn(entity);

        assertTrue(store.updateSummaryIfUnchanged("conv-1", "old", "new"));
        assertEquals("new", entity.getSummary());

        // A stale base (the conversation was cleared meanwhile) must not clobber.
        assertFalse(store.updateSummaryIfUnchanged("conv-1", "stale", "clobber"));
        assertEquals("new", entity.getSummary());
    }
}
