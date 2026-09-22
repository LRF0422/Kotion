package com.knowledge.agent.core.supervisor;

import com.knowledge.agent.core.entity.AgentThreadEntity;
import com.knowledge.agent.core.mapper.AgentThreadMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Conversation-thread access: title/summary (session memory tier) and the
 * active-run pointer enforcing the single-active-run invariant.
 */
@Slf4j
@Component
public class ThreadStore {

    private final AgentThreadMapper threadMapper;

    public ThreadStore(AgentThreadMapper threadMapper) {
        this.threadMapper = threadMapper;
    }

    public void upsertActive(String threadId, Long userId, Long tenantId, String runId) {
        try {
            AgentThreadEntity entity = new AgentThreadEntity();
            entity.setThreadId(threadId);
            entity.setUserId(userId);
            entity.setTenantId(tenantId);
            entity.setActiveRunId(runId);
            long now = System.currentTimeMillis();
            entity.setCreateTime(now);
            entity.setUpdateTime(now);
            threadMapper.upsertByThreadId(entity);
        } catch (Exception e) {
            log.warn("ThreadStore upsertActive failed for {}: {}", threadId, e.getMessage());
        }
    }

    /** Clear the active-run pointer only if it still points at this run. */
    public void clearActive(String threadId, String runId) {
        try {
            AgentThreadEntity entity = threadMapper.selectByThreadId(threadId);
            if (entity == null || !runId.equals(entity.getActiveRunId())) {
                return;
            }
            entity.setActiveRunId(null);
            entity.setUpdateTime(System.currentTimeMillis());
            threadMapper.upsertByThreadId(entity);
        } catch (Exception e) {
            log.warn("ThreadStore clearActive failed for {}: {}", threadId, e.getMessage());
        }
    }

    public AgentThreadEntity get(String threadId) {
        try {
            return threadMapper.selectByThreadId(threadId);
        } catch (Exception e) {
            log.warn("ThreadStore get failed for {}: {}", threadId, e.getMessage());
            return null;
        }
    }

    /** Update title/summary (session-memory tier), preserving the active run. */
    public void updateMeta(String threadId, String title, String summary) {
        try {
            AgentThreadEntity entity = threadMapper.selectByThreadId(threadId);
            if (entity == null) {
                return;
            }
            if (title != null && !title.trim().isEmpty()) {
                entity.setTitle(title.trim());
            }
            if (summary != null) {
                entity.setSummary(summary);
            }
            entity.setUpdateTime(System.currentTimeMillis());
            threadMapper.upsertByThreadId(entity);
        } catch (Exception e) {
            log.warn("ThreadStore updateMeta failed for {}: {}", threadId, e.getMessage());
        }
    }

    /**
     * Forget a conversation's session memory (rolling summary + title), keeping
     * the active-run pointer.
     *
     * <p>Called when the user explicitly clears or deletes a chat. The summary
     * otherwise survives a transcript reset (it lives on {@code agent_thread},
     * not on the projected session) and the next run would still be primed with
     * the old context. Empty rather than null because the upsert treats a null
     * incoming value as "keep the current one".
     *
     * <p>The lookup is by thread id only, so the caller's tenant/user are
     * checked here before touching the row.
     */
    public void clearMemory(String threadId, Long tenantId, Long userId) {
        try {
            AgentThreadEntity entity = threadMapper.selectByThreadId(threadId);
            if (entity == null) {
                return;
            }
            if (tenantId != null && entity.getTenantId() != null
                    && !tenantId.equals(entity.getTenantId())) {
                return;
            }
            if (userId != null && entity.getUserId() != null
                    && !userId.equals(entity.getUserId())) {
                return;
            }
            entity.setSummary("");
            entity.setTitle("");
            entity.setUpdateTime(System.currentTimeMillis());
            threadMapper.upsertByThreadId(entity);
        } catch (Exception e) {
            log.warn("ThreadStore clearMemory failed for {}: {}", threadId, e.getMessage());
        }
    }

    /**
     * Write a freshly generated rolling summary only when the stored one is
     * still what the caller based it on.
     *
     * <p>Summaries are produced asynchronously after a run completes, so a
     * concurrent "clear chat" would otherwise be undone by an in-flight
     * summarizer writing the old conversation back. The compare-and-set makes
     * the clear win. Returns whether the write landed.
     */
    public boolean updateSummaryIfUnchanged(String threadId, String expectedSummary, String summary) {
        try {
            AgentThreadEntity entity = threadMapper.selectByThreadId(threadId);
            if (entity == null) {
                return false;
            }
            String current = entity.getSummary();
            boolean unchanged = current == null
                    ? expectedSummary == null
                    : current.equals(expectedSummary);
            if (!unchanged) {
                return false;
            }
            entity.setSummary(summary);
            entity.setUpdateTime(System.currentTimeMillis());
            threadMapper.upsertByThreadId(entity);
            return true;
        } catch (Exception e) {
            log.warn("ThreadStore updateSummaryIfUnchanged failed for {}: {}", threadId, e.getMessage());
            return false;
        }
    }
}
