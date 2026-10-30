package com.knowledge.agent.core.task;

import com.knowledge.agent.core.run.TodoItem;
import com.knowledge.agent.core.tool.ToolContext;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/** Write-through guards: root-run only, identity required, never throws. */
class SessionTaskRecorderTest {

    private final SessionTaskStore store = mock(SessionTaskStore.class);
    private final SessionTaskRecorder recorder = new SessionTaskRecorder(store);

    private final List<TodoItem> items = Collections.singletonList(
            TodoItem.of("t1", "改代码", TodoItem.IN_PROGRESS));

    @Test
    void recordsTheSnapshotForARootRun() {
        ToolContext context = context();

        recorder.record(context, items);

        verify(store).replaceSnapshot(1L, 2L, "s-1", "run-1", items);
    }

    @Test
    void skipsDelegatedChildRuns() {
        // A child run's list is its own plan; it must not overwrite the parent
        // session's list.
        ToolContext context = context();
        context.setDelegateDepth(1);

        recorder.record(context, items);

        verifyNoInteractions(store);
    }

    @Test
    void skipsWhenIdentityIsMissing() {
        ToolContext noTenant = context();
        noTenant.setTenantId(null);
        recorder.record(noTenant, items);

        ToolContext noUser = context();
        noUser.setUserId(null);
        recorder.record(noUser, items);

        ToolContext noSession = context();
        noSession.setConversationId("  ");
        recorder.record(noSession, items);

        ToolContext nullContext = null;
        recorder.record(nullContext, items);

        verifyNoInteractions(store);
    }

    @Test
    void swallowsStorageFailures() {
        ToolContext context = context();
        doThrow(new RuntimeException("db down"))
                .when(store).replaceSnapshot(any(), any(), anyString(), any(), any());

        assertDoesNotThrow(() -> recorder.record(context, items));
    }

    @Test
    void doesNotTouchTheStoreWhenThereIsNothingToRecordAndIdentityIsMissing() {
        ToolContext context = context();
        context.setConversationId(null);

        recorder.record(context, null);

        verify(store, never()).replaceSnapshot(any(), any(), anyString(), any(), any());
    }

    private ToolContext context() {
        ToolContext context = new ToolContext();
        context.setRunId("run-1");
        context.setConversationId("s-1");
        context.setTenantId(1L);
        context.setUserId(2L);
        return context;
    }
}
