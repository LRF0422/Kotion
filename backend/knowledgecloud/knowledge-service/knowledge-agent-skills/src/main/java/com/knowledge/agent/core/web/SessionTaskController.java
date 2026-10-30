package com.knowledge.agent.core.web;

import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.entity.AgentSessionTaskEntity;
import com.knowledge.agent.core.session.ChatSessionStore;
import com.knowledge.agent.core.task.SessionTaskStore;
import com.knowledge.agent.core.web.dto.SessionTaskView;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Cross-session "unfinished tasks" read API.
 *
 * <pre>
 * GET /api/agent/v1/session-tasks?limit=200   the caller's pending / in_progress tasks
 * </pre>
 *
 * <p>Owner-scoped ({@code tenant_id} + {@code user_id} from the JWT), only
 * unfinished rows, most recently written first. The task table stores no
 * session title, so it is enriched from the chat-session index via
 * {@link ChatSessionStore#list}; a missing session row or blank title renders as
 * {@code ""}. Title enrichment is best effort — a failure there must not hide
 * the task data the panel exists to show.
 */
@Api(tags = "Agent Session Tasks")
@Slf4j
@RestController
@RequestMapping("/api/agent/v1/session-tasks")
public class SessionTaskController {

    private static final int DEFAULT_LIMIT = 200;
    private static final int MAX_LIMIT = SessionTaskStore.MAX_OPEN_LIMIT;
    /** Upper bound of the session index used only to fill in titles. */
    private static final int SESSION_INDEX_LIMIT = 200;

    private final SessionTaskStore taskStore;
    private final ChatSessionStore chatSessionStore;

    public SessionTaskController(SessionTaskStore taskStore, ChatSessionStore chatSessionStore) {
        this.taskStore = taskStore;
        this.chatSessionStore = chatSessionStore;
    }

    @ApiOperation("List the caller's unfinished session tasks (pending / in_progress)")
    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(name = "limit", defaultValue = "200") int limit) {
        try {
            Identity identity = identity();
            List<AgentSessionTaskEntity> rows = taskStore.listOpen(
                    identity.tenantId, identity.userId, clampLimit(limit));
            Map<String, String> titles = sessionTitles(identity.tenantId, identity.userId);
            List<SessionTaskView> items = new ArrayList<>();
            for (AgentSessionTaskEntity row : rows) {
                SessionTaskView view = SessionTaskView.of(
                        row, titles.getOrDefault(row.getSessionId(), ""));
                if (view != null) {
                    items.add(view);
                }
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("count", items.size());
            result.put("items", items);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("Session task list failed", e);
            return R.fail("读取未完成任务失败");
        }
    }

    // ==================== internals ====================

    private int clampLimit(int limit) {
        if (limit <= 0) {
            return DEFAULT_LIMIT;
        }
        return Math.min(limit, MAX_LIMIT);
    }

    /** sessionId → title for the caller's sessions; never throws. */
    private Map<String, String> sessionTitles(Long tenantId, Long userId) {
        try {
            List<AgentChatSessionEntity> sessions =
                    chatSessionStore.list(tenantId, userId, SESSION_INDEX_LIMIT);
            if (sessions == null || sessions.isEmpty()) {
                return Collections.emptyMap();
            }
            Map<String, String> titles = new HashMap<>();
            for (AgentChatSessionEntity session : sessions) {
                if (session == null || session.getSessionId() == null) {
                    continue;
                }
                String title = session.getTitle();
                titles.put(session.getSessionId(), title == null ? "" : title);
            }
            return titles;
        } catch (Exception e) {
            log.warn("Session task title enrichment failed: {}", e.toString());
            return Collections.emptyMap();
        }
    }

    private Identity identity() {
        Long userId = SecurityContextUtil.getUserId();
        Long tenantId = parseTenantId();
        // JwtTokenProvider / SecurityContextUtil report an unauthenticated caller
        // as userId == -1 and tenantId == ""; both mean "no identity".
        if (userId == null || userId <= 0 || tenantId == null) {
            throw new IllegalArgumentException("SESSION_TASK_IDENTITY_REQUIRED");
        }
        return new Identity(tenantId, userId);
    }

    private Long parseTenantId() {
        try {
            String tenantId = SecurityContextUtil.getTenantId();
            return tenantId == null || tenantId.trim().isEmpty()
                    ? null : Long.parseLong(tenantId.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static final class Identity {
        private final Long tenantId;
        private final Long userId;

        private Identity(Long tenantId, Long userId) {
            this.tenantId = tenantId;
            this.userId = userId;
        }
    }
}
