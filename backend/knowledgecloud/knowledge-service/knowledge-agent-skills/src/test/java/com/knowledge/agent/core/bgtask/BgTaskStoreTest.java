package com.knowledge.agent.core.bgtask;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentBgTaskEntity;
import com.knowledge.agent.core.entity.AgentBgTaskLogEntity;
import com.knowledge.agent.core.mapper.AgentBgTaskLogMapper;
import com.knowledge.agent.core.mapper.AgentBgTaskMapper;
import com.knowledge.agent.core.session.ChatSessionStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
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

/** Contract of the server-side background-task store (client executes, server stores). */
class BgTaskStoreTest {

    private static final long TENANT = 1L;
    private static final long USER = 2L;
    private static final String TASK_ID = "bt_1";

    private final AgentBgTaskMapper taskMapper = mock(AgentBgTaskMapper.class);
    private final AgentBgTaskLogMapper logMapper = mock(AgentBgTaskLogMapper.class);
    private final ChatSessionStore sessionStore = mock(ChatSessionStore.class);

    private AgentCoreProperties properties;
    private BgTaskStore store;
    private long now = 1_700_000_000_000L;

    @BeforeEach
    void setUp() {
        properties = new AgentCoreProperties();
        properties.getBgTask().setEnabled(true);
        properties.getBgTask().setMaxActivePerUser(100);
        properties.getBgTask().setMaxRetainedPerUser(1000);
        properties.getBgTask().setSweepLimit(10);
        when(sessionStore.get(anyLong(), anyLong(), anyString()))
                .thenReturn(new com.knowledge.agent.core.entity.AgentChatSessionEntity());
        store = new BgTaskStore(taskMapper, logMapper, sessionStore, properties,
                new ObjectMapper(), () -> now);
    }

    @Test
    void createInsertsRunningTaskAndReturnsOnlyAHashedLease() {
        BgTaskStore.Lease lease = store.create(TENANT, USER, createCommand("c-1"));

        assertNotNull(lease.getLeaseToken());
        ArgumentCaptor<AgentBgTaskEntity> captor = ArgumentCaptor.forClass(AgentBgTaskEntity.class);
        verify(taskMapper).insertTask(captor.capture());
        AgentBgTaskEntity saved = captor.getValue();

        assertEquals(BgTaskStore.STATE_RUNNING, saved.getState());
        assertEquals("watch", saved.getMode());
        assertEquals(1, saved.getAttempt());
        assertEquals(15000, saved.getHeartbeatMs());
        assertEquals(sha256(lease.getLeaseToken()), saved.getLeaseTokenHash());
        assertEquals(saved.getLeaseTokenHash(), lease.getTask().getLeaseTokenHash());
        assertFalse(lease.getLeaseToken().equals(saved.getLeaseTokenHash()),
                "the raw lease token must never be stored");
        verify(taskMapper).updateLease(saved);
    }

    @Test
    void createIsIdempotentForTheSameClientTaskId() {
        AgentBgTaskEntity existing = task(TASK_ID, BgTaskStore.STATE_RUNNING, "old", now + 60_000);
        existing.setClientTaskId("c-1");
        existing.setClientId("c-1");
        when(taskMapper.selectByClientTaskId(TENANT, USER, "c-1")).thenReturn(existing);

        BgTaskStore.Lease lease = store.create(TENANT, USER, createCommand("c-1"));

        verify(taskMapper, never()).insertTask(any(AgentBgTaskEntity.class));
        assertNotNull(lease.getLeaseToken());
        assertFalse("old".equals(lease.getLeaseToken()));
        assertEquals(1, existing.getAttempt(), "an idempotent retry is not a new attempt");
        verify(taskMapper).updateLease(existing);
    }

    @Test
    void createRejectsAConversationTheCallerDoesNotOwn() {
        when(sessionStore.get(TENANT, USER, "s-1")).thenReturn(null);

        BgTaskException error = assertThrows(BgTaskException.class,
                () -> store.create(TENANT, USER, createCommand("c-1")));
        assertEquals("TASK_CONVERSATION_NOT_FOUND", error.getCode());
        verify(taskMapper, never()).insertTask(any(AgentBgTaskEntity.class));
    }

    @Test
    void appendLogsAllocatesMonotonicSeqWhileHoldingTheTaskLock() {
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_RUNNING, "lt", now + 60_000);
        task.setLogSeq(10L);
        when(taskMapper.lockByTaskId(TASK_ID)).thenReturn(task);
        when(logMapper.countBatch(TASK_ID, "b-1")).thenReturn(0);

        BgTaskStore.LogAppend append = store.appendLogs(TENANT, USER, TASK_ID, "lt", "b-1",
                Arrays.asList(new BgTaskStore.LogEntry("log", "info", "one", now),
                        new BgTaskStore.LogEntry("summary", "warn", "two", now)));

        assertEquals(2, append.getAdded());
        assertEquals(12L, append.getNextSeq());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<AgentBgTaskLogEntity>> captor = ArgumentCaptor.forClass(List.class);
        verify(logMapper).insertBatch(captor.capture());
        List<AgentBgTaskLogEntity> rows = captor.getValue();
        assertEquals(11L, rows.get(0).getSeq());
        assertEquals(0, rows.get(0).getBatchSeq());
        assertEquals(12L, rows.get(1).getSeq());
        assertEquals(1, rows.get(1).getBatchSeq());
        assertEquals("summary", rows.get(1).getKind());
        verify(taskMapper).updateLogSeq(TASK_ID, 12L, now);
    }

    @Test
    void appendLogsIsIdempotentPerBatch() {
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_RUNNING, "lt", now + 60_000);
        task.setLogSeq(10L);
        when(taskMapper.lockByTaskId(TASK_ID)).thenReturn(task);
        when(logMapper.countBatch(TASK_ID, "b-1")).thenReturn(2);

        BgTaskStore.LogAppend append = store.appendLogs(TENANT, USER, TASK_ID, "lt", "b-1",
                Collections.singletonList(new BgTaskStore.LogEntry("log", "info", "retry", now)));

        assertEquals(0, append.getAdded());
        assertEquals(10L, append.getNextSeq());
        verify(logMapper, never()).insertBatch(any());
        verify(taskMapper, never()).updateLogSeq(anyString(), anyLong(), anyLong());
    }

    @Test
    void heartbeatRefreshesTheLeaseAndReportsCancellation() {
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_RUNNING, "lt", now + 1000);
        task.setCancelRequested(1);
        when(taskMapper.selectByOwner(TENANT, USER, TASK_ID)).thenReturn(task);

        BgTaskStore.Heartbeat heartbeat = store.heartbeat(TENANT, USER, TASK_ID, "lt");

        assertTrue(heartbeat.isCancelRequested());
        verify(taskMapper).touchLease(TASK_ID, sha256("lt"), now, now + 15000L * 3);
        assertEquals(now + 15000L * 3, task.getLeaseExpiresAt());
    }

    @Test
    void finishIsIdempotentAndKeepsTheFirstResult() {
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_SUCCEEDED, null, null);
        task.setResultJson("{\"ok\":true}");
        when(taskMapper.selectByOwner(TENANT, USER, TASK_ID)).thenReturn(task);

        AgentBgTaskEntity returned = store.finish(TENANT, USER, TASK_ID, "lt", "failed",
                Collections.singletonMap("late", true), "late failure", null);

        assertEquals("{\"ok\":true}", returned.getResultJson());
        verify(taskMapper, never()).finish(anyString(), anyString(), any(), anyInt(), any(), anyLong());
    }

    @Test
    void finishRejectsAnOversizedResultBeforeChangingState() {
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_RUNNING, "lt", now + 60_000);
        when(taskMapper.selectByOwner(TENANT, USER, TASK_ID)).thenReturn(task);

        char[] chars = new char[20000];
        Arrays.fill(chars, 'x');
        BgTaskException error = assertThrows(BgTaskException.class,
                () -> store.finish(TENANT, USER, TASK_ID, "lt", "succeeded", new String(chars), null, null));

        assertEquals("TASK_RESULT_TOO_LARGE", error.getCode());
        assertEquals(BgTaskStore.STATE_RUNNING, task.getState());
        verify(taskMapper, never()).finish(anyString(), anyString(), any(), anyInt(), any(), anyLong());
    }

    @Test
    void finishStoresResultAndClearsTheLease() {
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_RUNNING, "lt", now + 60_000);
        when(taskMapper.selectByOwner(TENANT, USER, TASK_ID)).thenReturn(task);
        when(taskMapper.finish(eq(TASK_ID), eq("succeeded"), anyString(), eq(0), eq((String) null), eq(now)))
                .thenReturn(1);

        AgentBgTaskEntity done = store.finish(TENANT, USER, TASK_ID, "lt", "succeeded",
                Collections.singletonMap("ok", true), null, null);

        assertEquals(BgTaskStore.STATE_SUCCEEDED, done.getState());
        assertNotNull(done.getResultJson());
        assertNull(done.getLeaseTokenHash());
        assertNull(done.getLeaseExpiresAt());
    }

    @Test
    void cancelMarksRunningAsCancellingAndDisconnectedAsCancelled() {
        AgentBgTaskEntity running = task(TASK_ID, BgTaskStore.STATE_RUNNING, "lt", now + 60_000);
        when(taskMapper.selectByOwner(TENANT, USER, TASK_ID)).thenReturn(running);
        when(taskMapper.requestCancel(eq(TASK_ID), anyLong(), eq(now))).thenReturn(1);

        AgentBgTaskEntity cancelling = store.cancel(TENANT, USER, TASK_ID);
        assertEquals(BgTaskStore.STATE_CANCELLING, cancelling.getState());
        assertEquals(1, cancelling.getCancelRequested());

        AgentBgTaskEntity disconnected = task("bt_2", BgTaskStore.STATE_DISCONNECTED, null, null);
        when(taskMapper.selectByOwner(TENANT, USER, "bt_2")).thenReturn(disconnected);
        when(taskMapper.cancelDisconnected("bt_2", now)).thenReturn(1);

        AgentBgTaskEntity cancelled = store.cancel(TENANT, USER, "bt_2");
        assertEquals(BgTaskStore.STATE_CANCELLED, cancelled.getState());
        assertNotNull(cancelled.getFinishedAt());
    }

    @Test
    void attachIncrementsAttemptAndRotatesTheLease() {
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_DISCONNECTED, null, null);
        task.setClientId("c-1");
        when(taskMapper.selectByOwner(TENANT, USER, TASK_ID)).thenReturn(task);

        BgTaskStore.Lease lease = store.attach(TENANT, USER, TASK_ID, "c-1");

        assertNotNull(lease.getLeaseToken());
        assertEquals(2, task.getAttempt());
        assertEquals(BgTaskStore.STATE_RUNNING, task.getState());
        assertEquals(sha256(lease.getLeaseToken()), task.getLeaseTokenHash());
    }

    @Test
    void attachRefusesAHealthyLeaseHeldByAnotherClient() {
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_RUNNING, "old", now + 60_000);
        task.setClientId("other");
        when(taskMapper.selectByOwner(TENANT, USER, TASK_ID)).thenReturn(task);

        BgTaskException error = assertThrows(BgTaskException.class,
                () -> store.attach(TENANT, USER, TASK_ID, "c-1"));
        assertEquals("TASK_LEASE_HELD", error.getCode());
    }

    @Test
    void sweepDisconnectsExpiredLeasesAndWritesAStateLog() {
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_RUNNING, "lt", now - 1);
        task.setLogSeq(5L);
        when(taskMapper.selectExpiredRunning(now, 10)).thenReturn(Collections.singletonList(task));
        when(taskMapper.markDisconnected(TASK_ID, now)).thenReturn(1);
        when(taskMapper.lockByTaskId(TASK_ID)).thenReturn(task);

        BgTaskStore.SweepResult result = store.sweep(now);

        assertEquals(1, result.getDisconnected());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<AgentBgTaskLogEntity>> captor = ArgumentCaptor.forClass(List.class);
        verify(logMapper).insertBatch(captor.capture());
        assertEquals("state", captor.getValue().get(0).getKind());
        assertEquals(6L, captor.getValue().get(0).getSeq());
        verify(taskMapper).updateLogSeq(TASK_ID, 6L, now);
    }

    @Test
    void appendLogsTrimsOldRowsAndAdvancesLogFirstSeq() {
        properties.getBgTask().setMaxLogLinesPerTask(3);
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_RUNNING, "lt", now + 60_000);
        task.setLogSeq(3L);
        task.setLogFirstSeq(0L);
        when(taskMapper.lockByTaskId(TASK_ID)).thenReturn(task);
        when(logMapper.countBatch(TASK_ID, "b-1")).thenReturn(0);

        store.appendLogs(TENANT, USER, TASK_ID, "lt", "b-1",
                Arrays.asList(new BgTaskStore.LogEntry("log", "info", "a", now),
                        new BgTaskStore.LogEntry("log", "info", "b", now)));

        // 5 total, keep the newest 3 → drop seq < 3, keep 3..5.
        verify(logMapper).deleteBelowSeq(TASK_ID, 3L);
        verify(taskMapper).updateLogFirstSeq(TASK_ID, 3L, now);
        assertEquals(3L, task.getLogFirstSeq());
    }

    @Test
    void logsSinceAdvancesPastTheDroppedWindow() {
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_RUNNING, "lt", now + 60_000);
        task.setLogSeq(200L);
        task.setLogFirstSeq(100L);
        when(taskMapper.selectByOwner(TENANT, USER, TASK_ID)).thenReturn(task);
        when(logMapper.selectSince(TASK_ID, 0L, 200)).thenReturn(Collections.<AgentBgTaskLogEntity>emptyList());
        when(logMapper.countByTask(TASK_ID)).thenReturn(100L);

        BgTaskStore.LogPage page = store.logsSince(TENANT, USER, TASK_ID, 0L, 0);

        assertEquals(99L, page.getNextSeq(), "cursor jumps to the oldest retained boundary");
        assertEquals(99L, page.getDropped());
        assertEquals(100L, page.getTotal());
    }

    @Test
    void ownerScopingHidesAnotherUsersTask() {
        when(taskMapper.selectByOwner(TENANT, USER, TASK_ID)).thenReturn(null);

        BgTaskException error = assertThrows(BgTaskException.class,
                () -> store.get(TENANT, USER, TASK_ID));
        assertEquals("TASK_NOT_FOUND", error.getCode());
    }

    @Test
    void listUsesTheConfiguredLimitAndStateFilter() {
        AgentBgTaskEntity task = task(TASK_ID, BgTaskStore.STATE_RUNNING, "lt", now + 60_000);
        when(taskMapper.selectByOwnerList(TENANT, USER, "running", null, null, null, 100))
                .thenReturn(Collections.singletonList(task));

        List<AgentBgTaskEntity> rows = store.list(TENANT, USER, "running", null, null, null, 100);

        assertEquals(1, rows.size());
        assertEquals(TASK_ID, rows.get(0).getTaskId());
    }

    // ==================== helpers ====================

    private BgTaskStore.CreateCommand createCommand(String clientTaskId) {
        BgTaskStore.CreateCommand cmd = new BgTaskStore.CreateCommand();
        cmd.setClientTaskId(clientTaskId);
        cmd.setClientId("c-1");
        cmd.setKind("ssh-docker-logs");
        cmd.setTitle("监控 api 容器");
        cmd.setMode("watch");
        cmd.setConversationId("s-1");
        cmd.setMeta(Collections.singletonMap("container", "api"));
        return cmd;
    }

    private AgentBgTaskEntity task(String id, String state, String leaseToken, Long expiresAt) {
        AgentBgTaskEntity task = new AgentBgTaskEntity();
        task.setTaskId(id);
        task.setTenantId(TENANT);
        task.setUserId(USER);
        task.setState(state);
        task.setMode(BgTaskStore.MODE_JOB);
        task.setAttempt(1);
        task.setHeartbeatMs(15000);
        task.setLeaseTokenHash(leaseToken == null ? null : sha256(leaseToken));
        task.setLeaseExpiresAt(expiresAt);
        task.setCancelRequested(0);
        task.setLogSeq(0L);
        task.setLogFirstSeq(0L);
        return task;
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                out.append(String.format("%02x", b & 0xff));
            }
            return out.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}