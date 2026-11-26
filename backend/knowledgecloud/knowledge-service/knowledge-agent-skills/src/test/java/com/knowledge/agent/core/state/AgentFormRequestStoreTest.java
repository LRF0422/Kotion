package com.knowledge.agent.core.state;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.entity.AgentFormRequestEntity;
import com.knowledge.agent.core.entity.AgentRunEntity;
import com.knowledge.agent.core.mapper.AgentFormRequestMapper;
import com.knowledge.agent.core.mapper.AgentRunMapper;
import com.knowledge.agent.core.session.ChatSessionStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Contract of the server-side form inbox. */
class AgentFormRequestStoreTest {

    private static final long TENANT = 1L;
    private static final long USER = 2L;
    private static final String CONVERSATION = "s-1";

    private final AgentFormRequestMapper mapper = mock(AgentFormRequestMapper.class);
    private final AgentRunMapper runMapper = mock(AgentRunMapper.class);
    private final ChatSessionStore sessionStore = mock(ChatSessionStore.class);
    private AgentFormRequestStore store;
    private long now = 1_700_000_000_000L;

    @BeforeEach
    void setUp() {
        when(sessionStore.get(anyLong(), anyLong(), anyString())).thenReturn(new AgentChatSessionEntity());
        AgentRunEntity run = new AgentRunEntity();
        run.setRunId("run_1");
        run.setConversationId(CONVERSATION);
        run.setTenantId(TENANT);
        run.setUserId(USER);
        when(runMapper.selectByRunId("run_1")).thenReturn(run);
        store = new AgentFormRequestStore(mapper, runMapper, sessionStore, new ObjectMapper(), () -> now);
    }

    @Test
    void createInsertsAPendingFormInTheServerInbox() {
        AgentFormRequestStore.CreateCommand cmd = createCommand();

        AgentFormRequestEntity entity = store.create(TENANT, USER, cmd);

        assertNotNull(entity.getFormId());
        assertTrue(entity.getFormId().startsWith("form_"));
        assertEquals(AgentFormRequestEntity.STATUS_PENDING, entity.getStatus());
        ArgumentCaptor<AgentFormRequestEntity> captor = ArgumentCaptor.forClass(AgentFormRequestEntity.class);
        verify(mapper).insertForm(captor.capture());
        assertEquals(CONVERSATION, captor.getValue().getConversationId());
        assertEquals("发布插件", captor.getValue().getTitle());
        assertTrue(captor.getValue().getSchemaJson().contains("fields"));
    }

    @Test
    void createRejectsAConversationTheCallerDoesNotOwn() {
        when(sessionStore.get(TENANT, USER, CONVERSATION)).thenReturn(null);

        AgentStateException error = assertThrows(AgentStateException.class,
                () -> store.create(TENANT, USER, createCommand()));
        assertEquals("CONVERSATION_NOT_FOUND", error.getCode());
        verify(mapper, never()).insertForm(any(AgentFormRequestEntity.class));
    }

    @Test
    void answerMarksTheFormAnswered() {
        AgentFormRequestEntity pending = form(AgentFormRequestEntity.STATUS_PENDING);
        AgentFormRequestEntity answered = form(AgentFormRequestEntity.STATUS_ANSWERED);
        when(mapper.selectByFormId(TENANT, USER, pending.getFormId())).thenReturn(pending, answered);
        when(mapper.answer(eq(TENANT), eq(USER), eq(pending.getFormId()), anyString(), eq((String) null), eq(now)))
                .thenReturn(1);

        AgentFormRequestStore.AnswerCommand cmd = new AgentFormRequestStore.AnswerCommand();
        Map<String, Object> values = new HashMap<String, Object>();
        values.put("version", "1.0.0");
        cmd.setValues(values);

        AgentFormRequestEntity result = store.answer(TENANT, USER, pending.getFormId(), cmd);

        assertEquals(AgentFormRequestEntity.STATUS_ANSWERED, result.getStatus());
        verify(mapper).answer(eq(TENANT), eq(USER), eq(pending.getFormId()), anyString(), eq((String) null), eq(now));
    }

    @Test
    void aSecondAnswerIsANoOp() {
        AgentFormRequestEntity answered = form(AgentFormRequestEntity.STATUS_ANSWERED);
        when(mapper.selectByFormId(TENANT, USER, answered.getFormId())).thenReturn(answered);

        AgentFormRequestStore.AnswerCommand cmd = new AgentFormRequestStore.AnswerCommand();
        cmd.setValues(Collections.singletonMap("version", "2.0.0"));

        AgentFormRequestEntity result = store.answer(TENANT, USER, answered.getFormId(), cmd);

        assertEquals(AgentFormRequestEntity.STATUS_ANSWERED, result.getStatus());
        verify(mapper, never()).answer(anyLong(), anyLong(), anyString(), any(), any(), anyLong());
    }

    @Test
    void listExpiresAStalePendingForm() {
        AgentFormRequestEntity stale = form(AgentFormRequestEntity.STATUS_PENDING);
        stale.setExpiresAt(now - 1);
        when(mapper.selectByStatus(TENANT, USER, "pending", null, 100))
                .thenReturn(Arrays.asList(stale));
        when(mapper.expire(stale.getFormId(), now)).thenReturn(1);

        List<AgentFormRequestEntity> rows = store.list(TENANT, USER, "pending", null, 100);

        assertEquals(1, rows.size());
        assertEquals(AgentFormRequestEntity.STATUS_EXPIRED, rows.get(0).getStatus());
        verify(mapper).expire(stale.getFormId(), now);
    }

    @Test
    void cancelOnlyMovesAPendingForm() {
        AgentFormRequestEntity pending = form(AgentFormRequestEntity.STATUS_PENDING);
        when(mapper.selectByFormId(TENANT, USER, pending.getFormId())).thenReturn(pending, pending);
        when(mapper.cancel(TENANT, USER, pending.getFormId(), "不再需要", now)).thenReturn(1);

        AgentFormRequestEntity result = store.cancel(TENANT, USER, pending.getFormId(), "不再需要");

        assertEquals(AgentFormRequestEntity.STATUS_CANCELLED, result.getStatus());
    }

    @Test
    void markDeliveredIsIdempotent() {
        AgentFormRequestEntity answered = form(AgentFormRequestEntity.STATUS_ANSWERED);
        when(mapper.selectByFormId(TENANT, USER, answered.getFormId())).thenReturn(answered);
        when(mapper.markDelivered(TENANT, USER, answered.getFormId(), now)).thenReturn(1);

        AgentFormRequestEntity result = store.markDelivered(TENANT, USER, answered.getFormId());

        assertEquals(now, result.getDeliveredAt());
        verify(mapper).markDelivered(TENANT, USER, answered.getFormId(), now);
    }

    private AgentFormRequestStore.CreateCommand createCommand() {
        AgentFormRequestStore.CreateCommand cmd = new AgentFormRequestStore.CreateCommand();
        cmd.setConversationId(CONVERSATION);
        cmd.setRunId("run_1");
        cmd.setCallId("call_1");
        cmd.setTitle("发布插件");
        cmd.setSchema(Collections.singletonMap("fields", Collections.singletonList(
                Collections.singletonMap("key", "version"))));
        cmd.setExpiresAt(now + 600_000);
        return cmd;
    }

    private AgentFormRequestEntity form(String status) {
        AgentFormRequestEntity entity = new AgentFormRequestEntity();
        entity.setFormId("form_1");
        entity.setConversationId(CONVERSATION);
        entity.setRunId("run_1");
        entity.setCallId("call_1");
        entity.setTenantId(TENANT);
        entity.setUserId(USER);
        entity.setTitle("发布插件");
        entity.setSchemaJson("{\"fields\":[]}");
        entity.setStatus(status);
        entity.setCreatedAt(now);
        return entity;
    }
}