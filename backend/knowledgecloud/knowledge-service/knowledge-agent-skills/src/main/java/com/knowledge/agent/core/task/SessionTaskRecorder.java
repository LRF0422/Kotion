package com.knowledge.agent.core.task;

import com.knowledge.agent.core.run.TodoItem;
import com.knowledge.agent.core.tool.ToolContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Best-effort write-through of the run's task list into the cross-session index.
 *
 * <p>Called by {@code UpdateTodosTool} right after the list is handed to the
 * run's {@code TodoHolder}: this is the one place that knows the whole, already
 * normalised list, and writing at the tool call (instead of at run-terminal
 * projection) keeps the list findable after the user leaves a still-running or
 * suspended run.
 *
 * <p>Two guards:
 * <ul>
 *   <li><b>root run only</b> ({@code delegateDepth == 0}) — a child run's list is
 *       that sub-task's own plan and must never overwrite the parent session's
 *       list;</li>
 *   <li><b>best effort</b> — missing identity is skipped and any storage failure
 *       is only logged, because the task list is auxiliary and must never fail
 *       {@code update_todos} (and thus the run).
 * </ul>
 */
@Slf4j
@Component
public class SessionTaskRecorder {

    private final SessionTaskStore store;

    public SessionTaskRecorder(SessionTaskStore store) {
        this.store = store;
    }

    /** Persist {@code items} as the session's latest task snapshot. Never throws. */
    public void record(ToolContext context, List<TodoItem> items) {
        if (context == null || context.getDelegateDepth() > 0) {
            return;
        }
        Long tenantId = context.getTenantId();
        Long userId = context.getUserId();
        String sessionId = context.getConversationId();
        if (tenantId == null || userId == null || isBlank(sessionId)) {
            return;
        }
        try {
            store.replaceSnapshot(tenantId, userId, sessionId, context.getRunId(), items);
        } catch (Exception e) {
            log.warn("Session task snapshot write failed (session={}, run={}): {}",
                    sessionId, context.getRunId(), e.toString());
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
