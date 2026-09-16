package com.knowledge.agent.core.session;

import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.mapper.AgentChatSessionMapper;
import org.junit.jupiter.api.Test;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatSessionStoreTest {

    private final AgentChatSessionMapper mapper = mock(AgentChatSessionMapper.class);
    private final ChatSessionStore store = new ChatSessionStore(mapper);

    @Test
    void metaWriteGoesThroughUpsertMetaOnly() {
        AgentChatSessionEntity entity = entity();
        entity.setMessagesJson("client-supplied");

        store.upsertMeta(entity);

        verify(mapper).upsertMeta(entity);
        verify(mapper, never()).upsertTranscript(entity);
    }

    @Test
    void metaWriteDefaultsMessageCountForNewEmptySession() {
        // The upsert INSERT supplies message_count, and the column is NOT NULL;
        // a metadata-only create must not pass NULL (MySQL does not use DEFAULT).
        AgentChatSessionEntity entity = entity();

        store.upsertMeta(entity);

        assertTrue(entity.getMessageCount() != null && entity.getMessageCount() == 0);
        verify(mapper).upsertMeta(entity);
    }

    @Test
    void transcriptWriteGoesThroughUpsertTranscript() {
        AgentChatSessionEntity entity = entity();
        entity.setMessagesJson("[{\"id\":\"m1\"}]");
        entity.setMessageCount(1);

        store.saveTranscript(entity);

        verify(mapper).upsertTranscript(entity);
        verify(mapper, never()).upsertMeta(entity);
    }

    @Test
    void saveTranscriptDefaultsSchemaAndSeq() {
        AgentChatSessionEntity entity = entity();
        store.saveTranscript(entity);
        assertTrue(entity.getSchemaVersion() == 1);
        assertTrue(entity.getAsOfSeq() == 0L);
    }

    @Test
    void requiresOwnerIdentity() {
        AgentChatSessionEntity entity = entity();
        entity.setUserId(null);
        assertThrows(IllegalArgumentException.class, () -> store.upsertMeta(entity));
    }

    @Test
    void rejectsBlankSessionId() {
        AgentChatSessionEntity entity = entity();
        entity.setSessionId("   ");
        assertThrows(IllegalArgumentException.class, () -> store.saveTranscript(entity));
    }

    @Test
    void listClampsLimitToUpperBound() {
        when(mapper.selectOwnedIndex(1L, 2L, 200)).thenReturn(Collections.emptyList());
        assertTrue(store.list(1L, 2L, 10_000).isEmpty());
        verify(mapper).selectOwnedIndex(1L, 2L, 200);
    }

    @Test
    void deleteIsOwnerScopedAndBlankSafe() {
        when(mapper.deleteOwned(1L, 2L, "s-1")).thenReturn(1);
        assertTrue(store.delete(1L, 2L, "s-1"));
        assertFalse(store.delete(1L, 2L, "   "));
    }

    @Test
    void casUpdateSucceedsWhenTheVersionStillMatches() {
        AgentChatSessionEntity entity = entity();
        entity.setVersion(3L);
        when(mapper.updateTranscriptIfVersion(entity)).thenReturn(1);

        assertTrue(store.saveTranscriptCas(entity));

        verify(mapper, never()).insertTranscriptIfAbsent(entity);
        assertTrue(entity.getVersion() == 4L);
    }

    @Test
    void casInsertsWhenTheRowIsAbsent() {
        AgentChatSessionEntity entity = entity();
        when(mapper.updateTranscriptIfVersion(entity)).thenReturn(0);
        when(mapper.insertTranscriptIfAbsent(entity)).thenReturn(1);

        assertTrue(store.saveTranscriptCas(entity));
        assertTrue(entity.getVersion() == 1L);
    }

    @Test
    void casFailsWhenAnotherWriterMovedFirst() {
        AgentChatSessionEntity entity = entity();
        when(mapper.updateTranscriptIfVersion(entity)).thenReturn(0);
        when(mapper.insertTranscriptIfAbsent(entity)).thenReturn(0);

        assertFalse(store.saveTranscriptCas(entity));
    }

    private AgentChatSessionEntity entity() {
        AgentChatSessionEntity entity = new AgentChatSessionEntity();
        entity.setSessionId("s-1");
        entity.setTenantId(1L);
        entity.setUserId(2L);
        entity.setTitle("New chat");
        return entity;
    }
}
