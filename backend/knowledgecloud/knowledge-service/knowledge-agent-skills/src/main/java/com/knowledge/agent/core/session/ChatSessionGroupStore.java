package com.knowledge.agent.core.session;

import com.knowledge.agent.core.entity.AgentChatSessionGroupEntity;
import com.knowledge.agent.core.mapper.AgentChatSessionGroupMapper;
import com.knowledge.agent.core.mapper.AgentChatSessionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;

/**
 * Owner-scoped storage for the user's conversation groups.
 *
 * <p>Groups are pure client-owned UI metadata: the durable source of truth is
 * this table (unlike the session projection cache), and nothing in the agent
 * runtime reads it. Deleting a group therefore has to move its members back to
 * "ungrouped" explicitly — {@link #delete} clears {@code agent_chat_session.group_id}
 * before dropping the group row so no conversation ever points at a missing
 * group.
 */
@Slf4j
@Component
public class ChatSessionGroupStore {

    /** Upper bound on one user's groups; the sidebar never needs more. */
    public static final int MAX_GROUPS = 200;

    private final AgentChatSessionGroupMapper mapper;
    private final AgentChatSessionMapper sessionMapper;

    public ChatSessionGroupStore(AgentChatSessionGroupMapper mapper, AgentChatSessionMapper sessionMapper) {
        this.mapper = mapper;
        this.sessionMapper = sessionMapper;
    }

    /** All groups of one owner, in display order. */
    public List<AgentChatSessionGroupEntity> list(Long tenantId, Long userId, int limit) {
        requireOwner(tenantId, userId);
        int bounded = Math.max(1, Math.min(limit, MAX_GROUPS));
        List<AgentChatSessionGroupEntity> rows = mapper.selectOwned(tenantId, userId, bounded);
        return rows != null ? rows : Collections.<AgentChatSessionGroupEntity>emptyList();
    }

    /**
     * Create or update one group (name / position).
     *
     * <p>A rename may omit the position ({@code sortIndex == null}); the stored
     * one is kept so renaming never reorders the sidebar. A new group without a
     * position lands at the front (0), which is what the client's own list does.
     */
    public void upsert(AgentChatSessionGroupEntity entity) {
        if (entity == null) {
            throw new IllegalArgumentException("session group is required");
        }
        requireOwner(entity.getTenantId(), entity.getUserId());
        String groupId = entity.getGroupId();
        if (groupId == null || groupId.trim().isEmpty()) {
            throw new IllegalArgumentException("groupId is required");
        }
        entity.setGroupId(groupId.trim());
        String name = entity.getName();
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("group name is required");
        }
        entity.setName(name.trim());
        if (entity.getSortIndex() == null) {
            AgentChatSessionGroupEntity existing = mapper.selectOwnedOne(
                    entity.getTenantId(), entity.getUserId(), entity.getGroupId());
            entity.setSortIndex(existing != null && existing.getSortIndex() != null
                    ? existing.getSortIndex() : 0);
        }
        long now = System.currentTimeMillis();
        if (entity.getCreateTime() == null || entity.getCreateTime() <= 0) {
            entity.setCreateTime(now);
        }
        if (entity.getUpdateTime() == null || entity.getUpdateTime() <= 0) {
            entity.setUpdateTime(now);
        }
        mapper.upsert(entity);
    }

    /**
     * Delete one group and ungroup its members.
     *
     * <p>Ungrouping deliberately leaves {@code update_time} alone: the session
     * list is ordered by it, and removing a folder must not reshuffle the user's
     * recency list. A failure to clear members is logged and does not abort the
     * delete — the client treats an unknown group id as "ungrouped" anyway.
     */
    public boolean delete(Long tenantId, Long userId, String groupId) {
        requireOwner(tenantId, userId);
        if (groupId == null || groupId.trim().isEmpty()) {
            return false;
        }
        String id = groupId.trim();
        try {
            sessionMapper.clearGroupId(tenantId, userId, id);
        } catch (Exception e) {
            log.warn("Session ungroup cleanup failed for {}: {}", id, e.toString());
        }
        return mapper.deleteOwned(tenantId, userId, id) > 0;
    }

    private void requireOwner(Long tenantId, Long userId) {
        if (tenantId == null || userId == null) {
            throw new IllegalArgumentException("CHAT_SESSION_IDENTITY_REQUIRED");
        }
    }
}