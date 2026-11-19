package com.knowledge.agent.core.web;

import com.knowledge.agent.core.entity.AgentChatSessionGroupEntity;
import com.knowledge.agent.core.session.ChatSessionGroupStore;
import com.knowledge.agent.core.web.dto.ChatSessionGroupView;
import com.knowledge.agent.core.web.dto.SaveChatSessionGroupRequest;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
 * Conversation-group API for the AI chat session list.
 *
 * <pre>
 * GET    /api/agent/v1/session-groups          the caller's groups, in display order
 * PUT    /api/agent/v1/session-groups/{id}     create or rename / reposition one group
 * DELETE /api/agent/v1/session-groups/{id}     delete it and ungroup its sessions
 * </pre>
 *
 * <p>Group membership is NOT written here: it is client-owned session metadata
 * and travels through {@code PUT /api/agent/v1/sessions/{sessionId}}
 * ({@code groupId}). Keeping the two writes apart means moving a conversation
 * never has to rewrite the group, and a group rename never touches sessions.
 */
@Api(tags = "Agent Session Groups")
@Slf4j
@RestController
@RequestMapping("/api/agent/v1/session-groups")
public class SessionGroupController {

    private static final int MAX_GROUP_ID_LENGTH = 64;
    private static final int MAX_GROUP_NAME_LENGTH = 64;

    private final ChatSessionGroupStore store;

    public SessionGroupController(ChatSessionGroupStore store) {
        this.store = store;
    }

    @ApiOperation("List the caller's conversation groups")
    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(name = "limit", defaultValue = "200") int limit) {
        try {
            Identity identity = identity();
            List<ChatSessionGroupView> items = new ArrayList<>();
            for (AgentChatSessionGroupEntity entity
                    : store.list(identity.tenantId, identity.userId, limit)) {
                items.add(ChatSessionGroupView.of(entity));
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("count", items.size());
            result.put("items", items);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("Session group list failed", e);
            return R.fail("读取会话分组失败");
        }
    }

    @ApiOperation("Create or update one conversation group")
    @PutMapping("/{groupId}")
    public R<ChatSessionGroupView> upsert(@PathVariable String groupId,
                                          @RequestBody SaveChatSessionGroupRequest request) {
        if (request == null) {
            return R.fail("请求体不能为空");
        }
        String id = groupId == null ? null : groupId.trim();
        if (id == null || id.isEmpty() || id.length() > MAX_GROUP_ID_LENGTH) {
            return R.fail("分组 ID 无效");
        }
        String name = request.getName() == null ? null : request.getName().trim();
        if (name == null || name.isEmpty()) {
            return R.fail("分组名称不能为空");
        }
        if (name.length() > MAX_GROUP_NAME_LENGTH) {
            name = name.substring(0, MAX_GROUP_NAME_LENGTH);
        }
        try {
            Identity identity = identity();
            AgentChatSessionGroupEntity entity = new AgentChatSessionGroupEntity();
            entity.setGroupId(id);
            entity.setTenantId(identity.tenantId);
            entity.setUserId(identity.userId);
            entity.setName(name);
            entity.setSortIndex(request.getSortIndex());
            store.upsert(entity);
            return R.data(ChatSessionGroupView.of(entity));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("Session group upsert failed for {}", id, e);
            return R.fail("保存会话分组失败");
        }
    }

    @ApiOperation("Delete one conversation group and ungroup its sessions")
    @DeleteMapping("/{groupId}")
    public R<Map<String, Object>> delete(@PathVariable String groupId) {
        try {
            Identity identity = identity();
            // Idempotent: deleting a group the backend never saw is a success.
            boolean removed = store.delete(identity.tenantId, identity.userId, groupId);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("groupId", groupId);
            result.put("removed", removed);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("Session group delete failed for {}", groupId, e);
            return R.fail("删除会话分组失败");
        }
    }

    // ==================== internals ====================

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