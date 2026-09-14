package com.knowledge.agent.core.session;

import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.mapper.AgentChatSessionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;

/**
 * Owner-scoped storage for the {@code agent_chat_session} projection cache.
 *
 * <p>Two writers touch this table, each owning different columns:
 * <ul>
 *   <li><b>engine</b> ({@link #saveTranscript}) owns the projected transcript +
 *       provenance — see {@link SessionTranscriptProjector};</li>
 *   <li><b>client</b> ({@link #upsertMeta}) owns UI-only metadata (title,
 *       @-page bindings) and row creation for empty sessions.</li>
 * </ul>
 * The durable source of truth remains the run log; this table is rebuildable.
 */
@Slf4j
@Component
public class ChatSessionStore {

    private final AgentChatSessionMapper mapper;

    public ChatSessionStore(AgentChatSessionMapper mapper) {
        this.mapper = mapper;
    }

    /** Metadata-only index, most recently updated first. Never carries messages. */
    public List<AgentChatSessionEntity> list(Long tenantId, Long userId, int limit) {
        requireOwner(tenantId, userId);
        List<AgentChatSessionEntity> rows = mapper.selectOwnedIndex(
                tenantId, userId, Math.max(1, Math.min(limit, 200)));
        return rows != null ? rows : Collections.<AgentChatSessionEntity>emptyList();
    }

    /** Full session including the projected transcript, or null when not owned. */
    public AgentChatSessionEntity get(Long tenantId, Long userId, String sessionId) {
        requireOwner(tenantId, userId);
        if (isBlank(sessionId)) {
            return null;
        }
        return mapper.selectOwned(tenantId, userId, sessionId.trim());
    }

    /** Client write path: create the row / update UI metadata only. */
    public void upsertMeta(AgentChatSessionEntity entity) {
        if (entity == null) {
            throw new IllegalArgumentException("chat session is required");
        }
        requireOwner(entity.getTenantId(), entity.getUserId());
        requireSessionId(entity);
        long now = System.currentTimeMillis();
        if (entity.getCreateTime() == null || entity.getCreateTime() <= 0) {
            entity.setCreateTime(now);
        }
        if (entity.getUpdateTime() == null || entity.getUpdateTime() <= 0) {
            entity.setUpdateTime(now);
        }
        mapper.upsertMeta(entity);
    }

    /** Engine write path: materialize/replace the projected transcript. */
    public void saveTranscript(AgentChatSessionEntity entity) {
        if (entity == null) {
            throw new IllegalArgumentException("chat session is required");
        }
        requireOwner(entity.getTenantId(), entity.getUserId());
        requireSessionId(entity);
        long now = System.currentTimeMillis();
        if (entity.getCreateTime() == null || entity.getCreateTime() <= 0) {
            entity.setCreateTime(now);
        }
        entity.setUpdateTime(now);
        if (entity.getSchemaVersion() == null || entity.getSchemaVersion() <= 0) {
            entity.setSchemaVersion(1);
        }
        if (entity.getAsOfSeq() == null || entity.getAsOfSeq() < 0) {
            entity.setAsOfSeq(0L);
        }
        // Metadata-only inserts (empty session) must still have a sane count.
        if (entity.getMessageCount() == null) {
            entity.setMessageCount(0);
        }
        mapper.upsertTranscript(entity);
    }

    /** Explicit user command: reset the projected transcript (client-owned action). */
    public boolean clearTranscript(Long tenantId, Long userId, String sessionId) {
        requireOwner(tenantId, userId);
        if (isBlank(sessionId)) {
            return false;
        }
        return mapper.clearTranscript(tenantId, userId, sessionId.trim(), System.currentTimeMillis()) > 0;
    }

    public boolean delete(Long tenantId, Long userId, String sessionId) {
        requireOwner(tenantId, userId);
        if (isBlank(sessionId)) {
            return false;
        }
        return mapper.deleteOwned(tenantId, userId, sessionId.trim()) > 0;
    }

    private void requireSessionId(AgentChatSessionEntity entity) {
        if (isBlank(entity.getSessionId())) {
            throw new IllegalArgumentException("sessionId is required");
        }
        entity.setSessionId(entity.getSessionId().trim());
    }

    private void requireOwner(Long tenantId, Long userId) {
        if (tenantId == null || userId == null) {
            throw new IllegalArgumentException("CHAT_SESSION_IDENTITY_REQUIRED");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
