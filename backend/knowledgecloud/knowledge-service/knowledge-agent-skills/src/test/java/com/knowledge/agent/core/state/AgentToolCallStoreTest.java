package com.knowledge.agent.core.state;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.entity.AgentRunEntity;
import com.knowledge.agent.core.entity.AgentToolCallEntity;
import com.knowledge.agent.core.mapper.AgentRunMapper;
import com.knowledge.agent.core.mapper.AgentToolCallMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Contract of the durable tool-execution ledger + approvals. */
class AgentToolCallStoreTest {

    private static final long TENANT = 1L;
    private static final long USER = 2L;
    private static final String RUN = "run_1";
    private static final String CALL = "call_1";

    private final AgentToolCallMapper mapper = mock(AgentToolCallMapper.class);
    private final AgentRunMapper runMapper = mock(AgentRunMapper.class);
    private AgentToolCallStore store;
    private long now = 1_700_000_000_000L;

    @BeforeEach
    void setUp() {
        AgentRunEntity run = new AgentRunEntity();
        run.setRunId(RUN);
        run.setConversationId("s-1");
        run.setTenantId(TENANT);
        run.setUserId(USER);
        when(runMapper.selectByRunId(RUN)).thenReturn(run);
        store = new AgentToolCallStore(mapper, runMapper, new ObjectMapper(), () -> now);
    }

    @Test
    void startedInsertsTheLedgerRowBeforeExecution() {
        AgentToolCallStore.StartedCommand cmd = new AgentToolCallStore.StartedCommand();
        cmd.setToolName("editPage");
        cmd.setArgs(Collections.singletonMap("pageId", "p1"));

        AgentToolCallEntity entity = store.started(TENANT, USER, RUN, CALL, cmd);

        assertEquals(AgentToolCallEntity.STATUS_STARTED, entity.getStatus());
        assertNotNull(entity.getArgsHash());
        assertNotNull(entity.getIdempotencyKey());
        ArgumentCaptor<AgentToolCallEntity> captor = ArgumentCaptor.forClass(AgentToolCallEntity.class);
        verify(mapper).insertCall(captor.capture());
        assertEquals(CALL, captor.getValue().getCallId());
        assertEquals(RUN, captor.getValue().getRunId());
        assertEquals("editPage", captor.getValue().getToolName());
    }

    @Test
    void startedIsIdempotentForAFinishedCall() {
        AgentToolCallEntity completed = call(AgentToolCallEntity.STATUS_COMPLETED);
        when(mapper.selectByRunCall(TENANT, USER, RUN, CALL)).thenReturn(completed);

        AgentToolCallStore.StartedCommand cmd = new AgentToolCallStore.StartedCommand();
        cmd.setToolName("editPage");
        AgentToolCallEntity entity = store.started(TENANT, USER, RUN, CALL, cmd);

        assertEquals(AgentToolCallEntity.STATUS_COMPLETED, entity.getStatus());
        verify(mapper, never()).insertCall(any(AgentToolCallEntity.class));
        verify(mapper, never()).markStarted(anyLong(), anyLong(), anyString(), anyString(),
                anyString(), anyString(), any(), anyString(), anyInt(), anyLong());
    }

    @Test
    void completedStoresTheResultOnce() {
        AgentToolCallEntity started = call(AgentToolCallEntity.STATUS_STARTED);
        when(mapper.selectByRunCall(TENANT, USER, RUN, CALL)).thenReturn(started);
        when(mapper.markFinished(eq(TENANT), eq(USER), eq(RUN), eq(CALL), eq("completed"),
                anyString(), eq(0), eq((String) null), eq(now))).thenReturn(1);

        AgentToolCallStore.CompletedCommand cmd = new AgentToolCallStore.CompletedCommand();
        Map<String, Object> result = new HashMap<String, Object>();
        result.put("ok", true);
        cmd.setResult(result);

        AgentToolCallEntity entity = store.completed(TENANT, USER, RUN, CALL, cmd);

        assertEquals(AgentToolCallEntity.STATUS_COMPLETED, entity.getStatus());
        assertNotNull(entity.getResultJson());
        assertEquals(now, entity.getFinishedAt());
    }

    @Test
    void completedKeepsTheFirstTerminalResult() {
        AgentToolCallEntity completed = call(AgentToolCallEntity.STATUS_COMPLETED);
        completed.setResultJson("{\"first\":true}");
        when(mapper.selectByRunCall(TENANT, USER, RUN, CALL)).thenReturn(completed);

        AgentToolCallStore.CompletedCommand cmd = new AgentToolCallStore.CompletedCommand();
        cmd.setResult(Collections.singletonMap("second", true));
        AgentToolCallEntity entity = store.completed(TENANT, USER, RUN, CALL, cmd);

        assertEquals("{\"first\":true}", entity.getResultJson());
        verify(mapper, never()).markFinished(anyLong(), anyLong(), anyString(), anyString(),
                anyString(), any(), anyInt(), any(), anyLong());
    }

    @Test
    void oversizedResultIsStoredAsATruncatedMarker() {
        AgentToolCallEntity started = call(AgentToolCallEntity.STATUS_STARTED);
        when(mapper.selectByRunCall(TENANT, USER, RUN, CALL)).thenReturn(started);
        when(mapper.markFinished(eq(TENANT), eq(USER), eq(RUN), eq(CALL), eq("completed"),
                anyString(), eq(1), eq((String) null), eq(now))).thenReturn(1);

        char[] chars = new char[AgentToolCallStore.MAX_RESULT_BYTES + 100];
        java.util.Arrays.fill(chars, 'x');
        AgentToolCallStore.CompletedCommand cmd = new AgentToolCallStore.CompletedCommand();
        cmd.setResult(new String(chars));

        AgentToolCallEntity entity = store.completed(TENANT, USER, RUN, CALL, cmd);

        assertTrue(entity.getResultJson().contains("\"truncated\":true"));
        assertEquals(1, entity.getResultTruncated());
    }

    @Test
    void uncertainOnlyMovesAStartedCall() {
        AgentToolCallEntity started = call(AgentToolCallEntity.STATUS_STARTED);
        when(mapper.selectByRunCall(TENANT, USER, RUN, CALL)).thenReturn(started);

        store.uncertain(TENANT, USER, RUN, CALL);

        verify(mapper).markUncertain(TENANT, USER, RUN, CALL, now);
    }

    @Test
    void approvalIsPersistedAndDecidedOnce() {
        when(mapper.selectByRunCall(TENANT, USER, RUN, CALL)).thenReturn(null);
        AgentToolCallStore.ApprovalCommand approval = new AgentToolCallStore.ApprovalCommand();
        approval.setToolName("deletePage");
        approval.setRequest(Collections.singletonMap("title", "删除页面"));
        approval.setTimeoutMs(300_000L);

        AgentToolCallEntity awaiting = store.requestApproval(TENANT, USER, RUN, CALL, approval);
        assertEquals(AgentToolCallEntity.STATUS_AWAITING_APPROVAL, awaiting.getStatus());
        assertEquals(now + 300_000L, awaiting.getApprovalExpiresAt());
        verify(mapper).insertCall(any(AgentToolCallEntity.class));

        when(mapper.selectByRunCall(TENANT, USER, RUN, CALL)).thenReturn(awaiting);
        when(mapper.decideApproval(TENANT, USER, RUN, CALL, "approved", "ok", now)).thenReturn(1);

        AgentToolCallStore.DecisionCommand decision = new AgentToolCallStore.DecisionCommand();
        decision.setAllowed(true);
        decision.setNote("ok");
        AgentToolCallEntity approved = store.decideApproval(TENANT, USER, RUN, CALL, decision);

        assertEquals(AgentToolCallEntity.STATUS_APPROVED, approved.getStatus());
    }

    @Test
    void anotherOwnersRunIsInvisible() {
        AgentRunEntity foreign = new AgentRunEntity();
        foreign.setRunId(RUN);
        foreign.setTenantId(9L);
        foreign.setUserId(9L);
        when(runMapper.selectByRunId(RUN)).thenReturn(foreign);

        AgentStateException error = assertThrows(AgentStateException.class,
                () -> store.get(TENANT, USER, RUN, CALL));
        assertEquals("RUN_NOT_FOUND", error.getCode());
    }

    private AgentToolCallEntity call(String status) {
        AgentToolCallEntity entity = new AgentToolCallEntity();
        entity.setCallId(CALL);
        entity.setRunId(RUN);
        entity.setConversationId("s-1");
        entity.setTenantId(TENANT);
        entity.setUserId(USER);
        entity.setToolName("editPage");
        entity.setStatus(status);
        entity.setArgsHash("hash");
        entity.setIdempotencyKey("idem");
        entity.setAttempt(1);
        entity.setCreateTime(now);
        entity.setUpdateTime(now);
        return entity;
    }
}