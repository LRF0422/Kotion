package com.knowledge.agent.core.session;

import com.knowledge.agent.core.entity.AgentChatSessionGroupEntity;
import com.knowledge.agent.core.mapper.AgentChatSessionGroupMapper;
import com.knowledge.agent.core.mapper.AgentChatSessionMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Group writes are owner-scoped client metadata; deleting a group must ungroup
 * its sessions (without restamping them) BEFORE the row disappears, so no
 * conversation can ever point at a missing group.
 */
class ChatSessionGroupStoreTest {

    private final AgentChatSessionGroupMapper mapper = mock(AgentChatSessionGroupMapper.class);
    private final AgentChatSessionMapper sessionMapper = mock(AgentChatSessionMapper.class);
    private final ChatSessionGroupStore store = new ChatSessionGroupStore(mapper, sessionMapper);

    @Test
    void upsertTrimsNameAndDefaultsSortIndex() {
        AgentChatSessionGroupEntity entity = entity();
        entity.setName("  工作  ");

        store.upsert(entity);

        assertEquals("工作", entity.getName());
        assertEquals(0, entity.getSortIndex());
        assertTrue(entity.getCreateTime() > 0);
        assertTrue(entity.getUpdateTime() > 0);
        verify(mapper).upsert(entity);
    }

    @Test
    void renameKeepsTheStoredPositionWhenTheRequestOmitsIt() {
        AgentChatSessionGroupEntity existing = entity();
        existing.setSortIndex(7);
        when(mapper.selectOwnedOne(1L, 2L, "g1")).thenReturn(existing);

        AgentChatSessionGroupEntity patch = entity();
        patch.setName("新名字");
        store.upsert(patch);

        assertEquals(7, patch.getSortIndex());
        verify(mapper).upsert(patch);
    }

    @Test
    void requiresOwnerAndNameAndGroupId() {
        AgentChatSessionGroupEntity noOwner = entity();
        noOwner.setTenantId(null);
        assertThrows(IllegalArgumentException.class, () -> store.upsert(noOwner));

        AgentChatSessionGroupEntity noName = entity();
        noName.setName("   ");
        assertThrows(IllegalArgumentException.class, () -> store.upsert(noName));

        AgentChatSessionGroupEntity noId = entity();
        noId.setGroupId("  ");
        assertThrows(IllegalArgumentException.class, () -> store.upsert(noId));
        verify(mapper, never()).upsert(noId);
    }

    @Test
    void deleteUngroupsMembersBeforeDroppingTheGroup() {
        when(mapper.deleteOwned(1L, 2L, "g1")).thenReturn(1);

        assertTrue(store.delete(1L, 2L, "g1"));

        verify(sessionMapper).clearGroupId(1L, 2L, "g1");
        verify(mapper).deleteOwned(1L, 2L, "g1");
    }

    @Test
    void deleteSurvivesAnUngroupFailureAndIsBlankSafe() {
        when(sessionMapper.clearGroupId(1L, 2L, "g1")).thenThrow(new IllegalStateException("db down"));
        when(mapper.deleteOwned(1L, 2L, "g1")).thenReturn(0);

        assertFalse(store.delete(1L, 2L, "g1"));
        verify(mapper).deleteOwned(1L, 2L, "g1");

        assertFalse(store.delete(1L, 2L, "  "));
        verify(mapper, never()).deleteOwned(1L, 2L, "  ");
    }

    @Test
    void listClampsTheLimit() {
        store.list(1L, 2L, 10_000);
        verify(mapper).selectOwned(1L, 2L, ChatSessionGroupStore.MAX_GROUPS);
    }

    @Test
    void listRequiresOwnerIdentity() {
        assertThrows(IllegalArgumentException.class, () -> store.list(null, 2L, 10));
    }

    private AgentChatSessionGroupEntity entity() {
        AgentChatSessionGroupEntity entity = new AgentChatSessionGroupEntity();
        entity.setGroupId("g1");
        entity.setTenantId(1L);
        entity.setUserId(2L);
        entity.setName("工作");
        return entity;
    }
}