package com.knowledge.agent.core.task;

import com.knowledge.agent.core.entity.AgentSessionTaskEntity;
import com.knowledge.agent.core.mapper.AgentSessionTaskMapper;
import com.knowledge.agent.core.run.TodoItem;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Owner-scoped storage for the cross-session task index
 * ({@code agent_session_task}).
 *
 * <p>{@code update_todos} has whole-list semantics, so a write is a snapshot
 * replacement, never a diff: upsert every item of the snapshot, then delete the
 * session's rows that are no longer in it. An empty snapshot clears the
 * session's rows. The write is transactional so a reader never sees a half
 * replaced list.
 *
 * <p>Title enrichment (session title) deliberately lives in the controller:
 * this store must stay a pure projection of the task list.
 */
@Component
public class SessionTaskStore {

    /** Read-API bound: one owner's open tasks never exceed this in one page. */
    public static final int MAX_OPEN_LIMIT = 500;

    /** Column widths of {@code agent_session_task} (truncate, never fail). */
    static final int MAX_ITEM_ID_LENGTH = 64;
    static final int MAX_TITLE_LENGTH = 512;
    static final int MAX_RUN_ID_LENGTH = 64;
    static final int MAX_SESSION_ID_LENGTH = 128;

    private final AgentSessionTaskMapper mapper;

    public SessionTaskStore(AgentSessionTaskMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * Replace one session's task snapshot with {@code items}.
     *
     * <p>Empty (or wholly unusable) input deletes the session's rows — that is
     * the "the model cleared the list" case, not a no-op.
     */
    @Transactional(rollbackFor = Exception.class)
    public void replaceSnapshot(Long tenantId, Long userId, String sessionId, String runId,
                                List<TodoItem> items) {
        requireOwner(tenantId, userId);
        String sid = requireSessionId(sessionId);
        List<AgentSessionTaskEntity> rows = snapshotRows(tenantId, userId, sid, runId, items);
        if (rows.isEmpty()) {
            mapper.deleteSession(tenantId, userId, sid);
            return;
        }
        for (AgentSessionTaskEntity row : rows) {
            mapper.upsert(row);
        }
        Set<String> itemIds = new LinkedHashSet<>();
        for (AgentSessionTaskEntity row : rows) {
            itemIds.add(row.getItemId());
        }
        mapper.deleteMissing(tenantId, userId, sid, new ArrayList<>(itemIds));
    }

    /** The owner's unfinished (pending / in_progress) tasks across sessions. */
    public List<AgentSessionTaskEntity> listOpen(Long tenantId, Long userId, int limit) {
        requireOwner(tenantId, userId);
        int effective = Math.max(1, Math.min(limit, MAX_OPEN_LIMIT));
        List<AgentSessionTaskEntity> rows = mapper.selectOpenByOwner(tenantId, userId, effective);
        return rows != null ? rows : Collections.<AgentSessionTaskEntity>emptyList();
    }

    /** Drop every task row of one session (session delete / transcript clear). */
    public boolean deleteSession(Long tenantId, Long userId, String sessionId) {
        requireOwner(tenantId, userId);
        if (isBlank(sessionId)) {
            return false;
        }
        return mapper.deleteSession(tenantId, userId, sessionId.trim()) > 0;
    }

    // ==================== internals ====================

    /**
     * Project usable todo items onto insert-ready rows. Model input that cannot
     * be stored (missing id / title — {@code normalize()} already filters these)
     * is dropped rather than written as a broken row.
     */
    private List<AgentSessionTaskEntity> snapshotRows(Long tenantId, Long userId, String sessionId,
                                                      String runId, List<TodoItem> items) {
        if (items == null || items.isEmpty()) {
            return Collections.emptyList();
        }
        long now = System.currentTimeMillis();
        String normalizedRunId = truncate(runId, MAX_RUN_ID_LENGTH);
        List<AgentSessionTaskEntity> rows = new ArrayList<>(items.size());
        Set<String> seen = new LinkedHashSet<>();
        for (TodoItem item : items) {
            if (item == null) {
                continue;
            }
            String itemId = truncate(item.getId(), MAX_ITEM_ID_LENGTH);
            String title = truncate(item.getTitle(), MAX_TITLE_LENGTH);
            if (isBlank(itemId) || isBlank(title) || !seen.add(itemId)) {
                continue;
            }
            AgentSessionTaskEntity row = new AgentSessionTaskEntity();
            row.setTenantId(tenantId);
            row.setUserId(userId);
            row.setSessionId(sessionId);
            row.setItemId(itemId);
            row.setTitle(title);
            row.setStatus(TodoItem.normalizeStatus(item.getStatus()));
            row.setSortIndex(rows.size());
            row.setRunId(normalizedRunId);
            row.setCreateTime(now);
            row.setUpdateTime(now);
            rows.add(row);
        }
        return rows;
    }

    private String requireSessionId(String sessionId) {
        if (isBlank(sessionId)) {
            throw new IllegalArgumentException("SESSION_ID_REQUIRED");
        }
        String trimmed = sessionId.trim();
        return trimmed.length() > MAX_SESSION_ID_LENGTH
                ? trimmed.substring(0, MAX_SESSION_ID_LENGTH) : trimmed;
    }

    private void requireOwner(Long tenantId, Long userId) {
        if (tenantId == null || userId == null) {
            throw new IllegalArgumentException("SESSION_TASK_IDENTITY_REQUIRED");
        }
    }

    private String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
