package com.knowledge.agent.core.memory;

import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentLongMemoryEntity;
import com.knowledge.agent.core.mapper.AgentLongMemoryMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Owner-scoped memory browsing (the memory-management UI).
 *
 * <p>Page/space scope keys embed ids the client cannot enumerate, so the UI can
 * only browse "everything this user owns". These tests pin the store half of
 * that contract: the owner id reaches the mapper (never a scope prefix, which
 * would leak {@code u:12*} into user {@code 1}), paging is clamped, a keyword
 * query ranks across scopes, and purge only ever touches the caller's rows.
 */
class DefaultMemoryStoreListAllTest {

    private final AgentLongMemoryMapper mapper = mock(AgentLongMemoryMapper.class);
    private final DefaultMemoryStore store = new DefaultMemoryStore(
            mapper, new KeywordMemoryRetriever(), new AgentCoreProperties());

    private AgentLongMemoryEntity entity(String id, String scope, Long userId, String type,
                                         String content, int importance) {
        AgentLongMemoryEntity entity = new AgentLongMemoryEntity();
        entity.setMemoryId(id);
        entity.setScope(scope);
        entity.setUserId(userId);
        entity.setType(type);
        entity.setContent(content);
        entity.setImportance(importance);
        entity.setCreateTime(1_000L);
        entity.setUpdateTime(1_000L);
        entity.setLastAccessTime(System.currentTimeMillis());
        return entity;
    }

    @Test
    void browsePassesTheOwnerAndPagingToTheMapper() {
        when(mapper.selectByUserId(eq(7L), eq(3L), isNull(), eq(20), eq(40)))
                .thenReturn(Arrays.asList(entity("m1", "u:7", 7L, "note", "hello", 50)));
        when(mapper.countByUserId(eq(7L), eq(3L), isNull())).thenReturn(5);

        List<MemoryEntry> entries = store.listAll(7L, 3L, null, null, 20, 40);

        assertEquals(1, entries.size());
        assertEquals("u:7", entries.get(0).getScope());
        assertEquals(5, store.countAll(7L, 3L, null));
        verify(mapper).selectByUserId(7L, 3L, null, 20, 40);
        verify(mapper).countByUserId(7L, 3L, null);
    }

    @Test
    void browseClampsLimitAndOffset() {
        when(mapper.selectByUserId(any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(new ArrayList<>());

        store.listAll(7L, null, null, null, 100_000, -5);

        verify(mapper).selectByUserId(7L, null, null, 200, 0);
    }

    @Test
    void keywordQueryRanksAcrossScopesAndTouchesAccessTime() {
        // Same importance, but only one matches the query — while living in a
        // page scope the client could never have addressed by name.
        when(mapper.selectByUserId(eq(7L), isNull(), eq("preference"), eq(500), eq(0)))
                .thenReturn(Arrays.asList(
                        entity("user", "u:7", 7L, "note", "unrelated content", 90),
                        entity("page", "u:7:s:9:p:5", 7L, "preference", "用户偏好中文回复", 90)));

        List<MemoryEntry> top = store.listAll(7L, null, "中文 回复", "preference", 10, 0);

        assertEquals(2, top.size());
        assertEquals("page", top.get(0).getMemoryId());
        verify(mapper, atLeastOnce()).upsertByMemoryId(any());
    }

    @Test
    void keywordQueryNeverExceedsTheRequestedLimit() {
        when(mapper.selectByUserId(any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(Arrays.asList(
                        entity("a", "u:7", 7L, "note", "note a", 10),
                        entity("b", "u:7", 7L, "note", "note b", 20),
                        entity("c", "u:7", 7L, "note", "note c", 30)));

        assertEquals(2, store.listAll(7L, null, "note", null, 2, 0).size());
    }

    @Test
    void purgeDeletesOnlyTheOwnersRows() {
        when(mapper.deleteByUserId(eq(7L), eq(3L))).thenReturn(2);

        assertEquals(2, store.forgetAll(7L, 3L));
        verify(mapper).deleteByUserId(7L, 3L);
    }

    @Test
    void anonymousCallerNeverReachesTheMapper() {
        assertTrue(store.listAll(null, null, null, null, 20, 0).isEmpty());
        assertEquals(0, store.countAll(null, null, null));
        assertEquals(0, store.forgetAll(null, null));
        verify(mapper, org.mockito.Mockito.never())
                .selectByUserId(any(), any(), any(), anyInt(), anyInt());
        verify(mapper, org.mockito.Mockito.never()).deleteByUserId(any(), any());
    }

    @Test
    void aMapperFailureDegradesToAnEmptyResultInsteadOfThrowing() {
        when(mapper.selectByUserId(any(), any(), any(), anyInt(), anyInt()))
                .thenThrow(new RuntimeException("db down"));
        when(mapper.countByUserId(any(), any(), any())).thenThrow(new RuntimeException("db down"));
        when(mapper.deleteByUserId(any(), any())).thenThrow(new RuntimeException("db down"));

        assertTrue(store.listAll(7L, null, null, null, 20, 0).isEmpty());
        assertTrue(store.listAll(7L, null, "query", null, 20, 0).isEmpty());
        assertEquals(0, store.countAll(7L, null, null));
        assertEquals(0, store.forgetAll(7L, null));
    }
}
