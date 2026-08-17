package com.knowledge.agentcore.supervisor;

import com.knowledge.agentcore.entity.AgentThreadEntity;
import com.knowledge.agentcore.mapper.AgentThreadMapper;
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
}
