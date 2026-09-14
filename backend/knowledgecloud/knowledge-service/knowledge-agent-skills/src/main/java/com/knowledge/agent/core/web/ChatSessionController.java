package com.knowledge.agent.core.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.session.ChatSessionStore;
import com.knowledge.agent.core.web.dto.ChatSessionView;
import com.knowledge.agent.core.web.dto.SaveChatSessionRequest;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Chat-session read API over the engine-owned projection cache.
 *
 * <pre>
 * GET    /api/agent/v1/sessions              list the caller's sessions (metadata only)
 * GET    /api/agent/v1/sessions/{id}         one session including the projected transcript
 * PUT    /api/agent/v1/sessions/{id}         upsert UI metadata only (title / @-page bindings)
 * POST   /api/agent/v1/sessions/{id}/import  one-time upload of a pre-migration local transcript
 * DELETE /api/agent/v1/sessions/{id}         delete one session
 * </pre>
 *
 * <p>The transcript is <b>engine-written</b> (see
 * {@code SessionTranscriptProjector}) — the client may only read it. The
 * client-owned {@code PUT} exists for UI-only metadata and for creating the row
 * of an empty session that has no run yet.
 */
@Api(tags = "Agent Chat Sessions")
@Slf4j
@RestController
@RequestMapping("/api/agent/v1/sessions")
public class ChatSessionController {

    private static final int MAX_SESSION_ID_LENGTH = 128;
    private static final int MAX_TITLE_LENGTH = 255;

    private final ChatSessionStore store;
    private final ObjectMapper objectMapper;

    public ChatSessionController(ChatSessionStore store, ObjectMapper objectMapper) {
        this.store = store;
        this.objectMapper = objectMapper;
    }

    @ApiOperation("List the caller's chat sessions (metadata only)")
    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(name = "limit", defaultValue = "100") int limit) {
        try {
            Identity identity = identity();
            List<ChatSessionView> items = new ArrayList<>();
            for (AgentChatSessionEntity entity : store.list(identity.tenantId, identity.userId, limit)) {
                items.add(ChatSessionView.of(entity, objectMapper, false));
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("count", items.size());
            result.put("items", items);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("Chat session list failed", e);
            return R.fail("读取会话列表失败");
        }
    }

    @ApiOperation("Get one chat session including the projected transcript")
    @GetMapping("/{sessionId}")
    public R<ChatSessionView> get(@PathVariable String sessionId) {
        try {
            Identity identity = identity();
            AgentChatSessionEntity entity = store.get(identity.tenantId, identity.userId, sessionId);
            return entity != null
                    ? R.data(ChatSessionView.of(entity, objectMapper, true))
                    : R.fail("会话不存在");
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        }
    }

    @ApiOperation("Upsert chat-session UI metadata (transcript is engine-owned)")
    @PutMapping("/{sessionId}")
    public R<Map<String, Object>> upsert(@PathVariable String sessionId,
                                         @RequestBody SaveChatSessionRequest request) {
        if (request == null) {
            return R.fail("请求体不能为空");
        }
        String id = sessionId == null ? null : sessionId.trim();
        if (id == null || id.isEmpty() || id.length() > MAX_SESSION_ID_LENGTH) {
            return R.fail("会话 ID 无效");
        }
        try {
            Identity identity = identity();
            AgentChatSessionEntity entity = new AgentChatSessionEntity();
            entity.setSessionId(id);
            entity.setTenantId(identity.tenantId);
            entity.setUserId(identity.userId);
            entity.setTitle(truncate(request.getTitle(), MAX_TITLE_LENGTH));
            entity.setTargetPageJson(writeJson(request.getTargetPage()));
            entity.setBoundPageJson(writeJson(request.getBoundPage()));
            entity.setCreateTime(request.getCreatedAt());
            entity.setUpdateTime(request.getUpdatedAt());
            // A client-supplied transcript is intentionally ignored: the engine
            // is the only writer of messages_json (use /import for migration).
            store.upsertMeta(entity);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("sessionId", id);
            result.put("updatedAt", entity.getUpdateTime());
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("Chat session metadata upsert failed for {}", id, e);
            return R.fail("保存会话失败");
        }
    }

    @ApiOperation("One-time import of a pre-migration local transcript")
    @PostMapping("/{sessionId}/import")
    public R<Map<String, Object>> importTranscript(@PathVariable String sessionId,
                                                   @RequestBody SaveChatSessionRequest request) {
        if (request == null || request.getMessages() == null || !request.getMessages().isArray()) {
            return R.fail("messages 必须是非空数组");
        }
        String id = sessionId == null ? null : sessionId.trim();
        if (id == null || id.isEmpty() || id.length() > MAX_SESSION_ID_LENGTH) {
            return R.fail("会话 ID 无效");
        }
        try {
            Identity identity = identity();
            AgentChatSessionEntity existing = store.get(identity.tenantId, identity.userId, id);
            JsonNode incoming = request.getMessages();
            // A client may only enrich an EMPTY or SHORTER projection (one-time
            // migration of a pre-engine local history). It can never truncate or
            // overwrite a richer engine-owned transcript.
            int existingCount = existing != null && existing.getMessageCount() != null
                    ? existing.getMessageCount() : 0;
            if (existing != null && existing.getMessagesJson() != null
                    && !existing.getMessagesJson().trim().isEmpty()
                    && !"[]".equals(existing.getMessagesJson().trim())
                    && incoming.size() <= existingCount) {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("sessionId", id);
                result.put("imported", false);
                return R.data(result);
            }
            JsonNode messages = incoming;
            AgentChatSessionEntity entity = new AgentChatSessionEntity();
            entity.setSessionId(id);
            entity.setTenantId(identity.tenantId);
            entity.setUserId(identity.userId);
            entity.setTitle(truncate(request.getTitle(), MAX_TITLE_LENGTH));
            entity.setTargetPageJson(writeJson(request.getTargetPage()));
            entity.setBoundPageJson(writeJson(request.getBoundPage()));
            entity.setMessagesJson(writeJson(messages));
            entity.setMessageCount(messages.size());
            entity.setSchemaVersion(1);
            entity.setAsOfSeq(0L);
            entity.setCreateTime(request.getCreatedAt());
            store.saveTranscript(entity);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("sessionId", id);
            result.put("imported", true);
            result.put("messageCount", messages.size());
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("Chat session transcript import failed for {}", id, e);
            return R.fail("导入会话失败");
        }
    }

    @ApiOperation("Clear one session's projected transcript (explicit user action)")
    @DeleteMapping("/{sessionId}/transcript")
    public R<Map<String, Object>> clearTranscript(@PathVariable String sessionId) {
        try {
            Identity identity = identity();
            boolean cleared = store.clearTranscript(identity.tenantId, identity.userId, sessionId);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("sessionId", sessionId);
            result.put("cleared", cleared);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        }
    }

    @ApiOperation("Delete one chat session")
    @DeleteMapping("/{sessionId}")
    public R<Map<String, Object>> delete(@PathVariable String sessionId) {
        try {
            Identity identity = identity();
            // Idempotent: deleting a session the backend never saw is a success.
            boolean removed = store.delete(identity.tenantId, identity.userId, sessionId);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("sessionId", sessionId);
            result.put("removed", removed);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        }
    }

    // ==================== internals ====================

    private String writeJson(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(node);
        } catch (Exception e) {
            return null;
        }
    }

    private String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
    }

    private Identity identity() {
        Long userId = SecurityContextUtil.getUserId();
        Long tenantId = parseTenantId();
        if (userId == null || tenantId == null) {
            throw new IllegalArgumentException("CHAT_SESSION_IDENTITY_REQUIRED");
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
