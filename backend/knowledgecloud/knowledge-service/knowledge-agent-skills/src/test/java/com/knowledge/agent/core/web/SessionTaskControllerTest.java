package com.knowledge.agent.core.web;

import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.entity.AgentSessionTaskEntity;
import com.knowledge.agent.core.session.ChatSessionStore;
import com.knowledge.agent.core.task.SessionTaskStore;
import com.knowledge.agent.core.web.dto.SessionTaskView;
import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Read API contract: owner scoping, unfinished rows only, title enrichment. */
class SessionTaskControllerTest {

    private final SessionTaskStore taskStore = mock(SessionTaskStore.class);
    private final ChatSessionStore chatSessionStore = mock(ChatSessionStore.class);
    private final SessionTaskController controller =
            new SessionTaskController(taskStore, chatSessionStore);

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void returnsOpenTasksWithSessionTitles() {
        authenticate(1L, 2L);
        when(taskStore.listOpen(1L, 2L, 200)).thenReturn(Arrays.asList(
                taskRow("s-1", "t2", "补充竞品对比表", 1, 1_000L),
                taskRow("s-2", "t1", "整理数据", 0, 900L)));
        when(chatSessionStore.list(1L, 2L, 200)).thenReturn(
                Collections.singletonList(session("s-1", "整理第三季度周报")));

        R<Map<String, Object>> response = controller.list(200);

        assertTrue(R.isSuccess(response));
        Map<String, Object> data = response.getData();
        assertEquals(2, data.get("count"));
        @SuppressWarnings("unchecked")
        List<SessionTaskView> items = (List<SessionTaskView>) data.get("items");
        assertEquals(2, items.size());

        SessionTaskView first = items.get(0);
        assertEquals("s-1", first.getSessionId());
        assertEquals("整理第三季度周报", first.getSessionTitle());
        assertEquals("t2", first.getTaskId());
        assertEquals("补充竞品对比表", first.getTitle());
        assertEquals("in_progress", first.getStatus());
        assertEquals(1, first.getPosition());
        assertEquals(Long.valueOf(1_000L), first.getUpdatedAt());

        // A task whose session row is missing degrades to an empty title, it is
        // not dropped from the list.
        assertEquals("", items.get(1).getSessionTitle());
    }

    @Test
    void rejectsAnUnauthenticatedCaller() {
        // No SecurityContext: identity resolution must fail before any query.
        R<Map<String, Object>> response = controller.list(200);

        assertFalse(R.isSuccess(response));
        assertEquals("SESSION_TASK_IDENTITY_REQUIRED", response.getMsg());
    }

    @Test
    void returnsFailWhenTheStoreBlowsUp() {
        authenticate(1L, 2L);
        when(taskStore.listOpen(anyLong(), anyLong(), anyInt()))
                .thenThrow(new RuntimeException("db down"));

        R<Map<String, Object>> response = controller.list(200);

        assertFalse(R.isSuccess(response));
        assertEquals("读取未完成任务失败", response.getMsg());
    }

    @Test
    void titleEnrichmentFailureDoesNotHideTheTasks() {
        authenticate(1L, 2L);
        when(taskStore.listOpen(anyLong(), anyLong(), anyInt())).thenReturn(
                Collections.singletonList(taskRow("s-1", "t1", "任务", 0, 1L)));
        when(chatSessionStore.list(1L, 2L, 200)).thenThrow(new RuntimeException("session index down"));

        R<Map<String, Object>> response = controller.list(200);

        assertTrue(R.isSuccess(response));
        @SuppressWarnings("unchecked")
        List<SessionTaskView> items = (List<SessionTaskView>) response.getData().get("items");
        assertEquals(1, items.size());
        assertEquals("", items.get(0).getSessionTitle());
    }

    @Test
    void defaultsTheLimitAndCapsItAtFiveHundred() {
        authenticate(1L, 2L);
        when(taskStore.listOpen(anyLong(), anyLong(), anyInt()))
                .thenReturn(Collections.emptyList());

        controller.list(0);
        verify(taskStore).listOpen(1L, 2L, 200);

        controller.list(10_000);
        verify(taskStore).listOpen(1L, 2L, 500);
    }

    @Test
    void mapsTheSessionTaskEndpointUnderTheAgentNamespace() throws NoSuchMethodException {
        RequestMapping root = SessionTaskController.class.getAnnotation(RequestMapping.class);
        assertNotNull(root);
        assertArrayEquals(new String[] { "/api/agent/v1/session-tasks" }, root.value());

        Method list = SessionTaskController.class.getMethod("list", int.class);
        assertNotNull(list.getAnnotation(GetMapping.class));
    }

    // ==================== fixtures ====================

    private void authenticate(long tenantId, long userId) {
        KnowledgeUser user = new KnowledgeUser();
        user.setTenantId(String.valueOf(tenantId));
        user.setUserId(userId);
        SecurityContextHolder.getContext()
                .setAuthentication(new KnowledgeUserAuthentication(user, "test-token"));
    }

    private AgentSessionTaskEntity taskRow(String sessionId, String itemId, String title,
                                           int sortIndex, long updatedAt) {
        AgentSessionTaskEntity row = new AgentSessionTaskEntity();
        row.setTenantId(1L);
        row.setUserId(2L);
        row.setSessionId(sessionId);
        row.setItemId(itemId);
        row.setTitle(title);
        row.setStatus("in_progress");
        row.setSortIndex(sortIndex);
        row.setRunId("run-1");
        row.setCreateTime(updatedAt);
        row.setUpdateTime(updatedAt);
        return row;
    }

    private AgentChatSessionEntity session(String sessionId, String title) {
        AgentChatSessionEntity entity = new AgentChatSessionEntity();
        entity.setTenantId(1L);
        entity.setUserId(2L);
        entity.setSessionId(sessionId);
        entity.setTitle(title);
        return entity;
    }
}
