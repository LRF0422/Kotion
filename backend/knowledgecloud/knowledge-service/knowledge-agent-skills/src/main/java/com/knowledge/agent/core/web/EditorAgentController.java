package com.knowledge.agent.core.web;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.context.ContextManager;
import com.knowledge.agent.core.loop.ResumePayload;
import com.knowledge.agent.core.memory.MemoryEntry;
import com.knowledge.agent.core.memory.MemoryScope;
import com.knowledge.agent.core.memory.MemoryStore;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.RunView;
import com.knowledge.agent.core.supervisor.CreateRunCommand;
import com.knowledge.agent.core.supervisor.DefaultRunSupervisor;
import com.knowledge.agent.core.supervisor.ThreadStore;
import com.knowledge.agent.core.tool.ToolSpec;
import com.knowledge.agent.core.web.dto.CreateMemoryRequest;
import com.knowledge.agent.core.web.dto.CreateRunRequest;
import com.knowledge.agent.core.web.dto.ResumeRequest;
import com.knowledge.agent.core.web.dto.SendRunMessageRequest;
import com.knowledge.agent.core.web.dto.ThreadView;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Editor Agent API — the redesigned AgentCore transport (V1 contract, see
 * {@code docs/agent-redesign.md} §8).
 *
 * <pre>
 * POST   /api/agent/v1/runs                       create + start
 * GET    /api/agent/v1/runs/{runId}               run state view
 * GET    /api/agent/v1/runs/{runId}/events        SSE replay + live
 * POST   /api/agent/v1/runs/{runId}/resume        SSE (tool results / continue / approve)
 * POST   /api/agent/v1/runs/{runId}/messages      send a user turn to the running run
 * POST   /api/agent/v1/runs/{runId}/cancel        cancel
 * DELETE /api/agent/v1/threads/{threadId}/active-run   cancel conversation's run
 * GET    /api/agent/v1/threads/{threadId}         thread view (session memory)
 * GET    /api/agent/v1/memory                     browse/search long-term memory
 * POST   /api/agent/v1/memory                     create one memory by hand
 * DELETE /api/agent/v1/memory                     purge the caller's memory
 * DELETE /api/agent/v1/memory/{memoryId}          delete one memory
 * </pre>
 *
 * <p>All task endpoints perform ownership checks; "not found" and "not yours"
 * are indistinguishable to callers.
 */
@Api(tags = "Editor Agent V1 (AgentCore)")
@Slf4j
@RestController
@RequestMapping("/api/agent/v1")
public class EditorAgentController {

    /** Hard cap for one page of the memory browser (the store caps this too). */
    private static final int MAX_MEMORY_PAGE = 200;

    /** Manual memory text cap — longer "memories" are notes, not memories. */
    private static final int MAX_MEMORY_CONTENT = 2000;

    private static final int MAX_MEMORY_TAGS = 10;

    private final DefaultRunSupervisor supervisor;
    private final ThreadStore threadStore;
    private final RunStreamer streamer;
    private final MemoryStore memoryStore;

    public EditorAgentController(DefaultRunSupervisor supervisor,
                                 ThreadStore threadStore,
                                 RunStreamer streamer,
                                 MemoryStore memoryStore) {
        this.supervisor = supervisor;
        this.threadStore = threadStore;
        this.streamer = streamer;
        this.memoryStore = memoryStore;
    }

    // ==================== runs ====================

    @ApiOperation("Create and start an agent run")
    @PostMapping("/runs")
    public R<RunView> create(@RequestBody CreateRunRequest request) {
        CreateRunCommand cmd = new CreateRunCommand();
        cmd.setConversationId(request.getConversationId());
        cmd.setModel(request.getModel());
        cmd.setMode(request.getMode());
        cmd.setMessages(request.getMessages());
        cmd.setTools(request.getTools());
        cmd.setTemperature(request.getTemperature());
        cmd.setMaxTokens(request.getMaxTokens());
        // No prompt text crosses this boundary. The agent prompt is the
        // backend's own (AgentPrompts) and says nothing about the client's
        // domain; only a pure-text run supplies its task instruction.
        cmd.setInstruction(request.getInstruction());
        cmd.setContextNote(request.getContextNote());
        cmd.setNoTools(request.isNoTools());
        cmd.setSpaceId(request.getSpaceId());
        cmd.setPageId(request.getPageId());
        cmd.setUserId(SecurityContextUtil.getUserId());
        cmd.setTenantId(parseTenantId());
        cmd.setToken(SecurityContextUtil.getToken());
        cmd.setSkillFragments(new ArrayList<>());
        cmd.setSkillTools(new ArrayList<>());
        // Deferred channel: the client advertises every callable tool in `tools`
        // with its schema, and sends here what must stay CALLABLE but out of that
        // array — the surplus the provider's ceiling cannot fit, plus the skills
        // this conversation already discovered (letting the array grow mid-session
        // would re-bill the whole cached prefix). Deduped against `tools` on
        // purpose — a tool already advertised must not be re-registered as
        // deferred, which would take its schema back out of the model's tool list.
        java.util.Set<String> seenTools = new java.util.HashSet<>();
        for (ToolSpec spec : request.getTools() != null ? request.getTools() : new ArrayList<ToolSpec>()) {
            if (spec != null && spec.getName() != null) {
                seenTools.add(spec.getName());
            }
        }
        if (request.getDeferredTools() != null) {
            for (ToolSpec spec : request.getDeferredTools()) {
                if (spec != null && spec.getName() != null && seenTools.add(spec.getName())) {
                    cmd.getSkillTools().add(spec);
                }
            }
        }
        if (request.getSkills() != null) {
            for (CreateRunRequest.SkillInput skill : request.getSkills()) {
                if (skill == null) {
                    continue;
                }
                // Name the skill's own tools under its fragment: the deferred
                // directory gives signatures without descriptions, so the model
                // otherwise has to guess which function a prose step refers to
                // (and invents names when it guesses wrong). Blank fragments
                // yield null and are dropped.
                String fragment = ContextManager.renderSkillFragment(
                        skill.getSystemPromptFragment(),
                        skill.getRequiredTools(),
                        skill.getOptionalTools());
                if (fragment != null) {
                    cmd.getSkillFragments().add(fragment);
                }
                if (skill.getTools() == null) {
                    continue;
                }
                for (ToolSpec spec : skill.getTools()) {
                    if (spec != null && spec.getName() != null && seenTools.add(spec.getName())) {
                        cmd.getSkillTools().add(spec);
                    }
                }
            }
        }
        try {
            return R.data(supervisor.create(cmd));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("Run create failed", e);
            return R.fail("创建任务失败：" + e.getMessage());
        }
    }

    @ApiOperation("Get run state view")
    @GetMapping("/runs/{runId}")
    public R<RunView> get(@PathVariable String runId) {
        try {
            AgentRun run = supervisor.requireOwned(runId,
                    SecurityContextUtil.getUserId(), parseTenantId());
            RunView view = supervisor.get(run.getRunId());
            return view != null ? R.data(view) : R.fail("任务不存在");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @ApiOperation("List a run's delegated child runs (sub-agent audit drill-down)")
    @GetMapping("/runs/{runId}/children")
    public R<List<RunView>> children(@PathVariable String runId) {
        try {
            return R.data(supervisor.children(runId,
                    SecurityContextUtil.getUserId(), parseTenantId()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @ApiOperation("Stream run events (replay + live)")
    @GetMapping(value = "/runs/{runId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@PathVariable String runId,
                             @RequestParam(name = "afterSeq", defaultValue = "0") long afterSeq) {
        try {
            supervisor.requireOwned(runId, SecurityContextUtil.getUserId(), parseTenantId());
            return streamer.stream(runId, afterSeq);
        } catch (IllegalArgumentException e) {
            return streamer.error("RUN_NOT_FOUND", e.getMessage());
        }
    }

    @ApiOperation("Resume a paused run (tool results / plan decision / continue)")
    @PostMapping(value = "/runs/{runId}/resume", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter resume(@PathVariable String runId, @RequestBody ResumeRequest request) {
        try {
            supervisor.requireOwned(runId, SecurityContextUtil.getUserId(), parseTenantId());
        } catch (IllegalArgumentException e) {
            return streamer.error("RUN_NOT_FOUND", e.getMessage());
        }
        ResumePayload payload = new ResumePayload();
        payload.setAction(request.getAction());
        payload.setToolResults(request.getToolResults());
        payload.setPlanDecision(request.getPlanDecision());
        long afterSeq = request.getAfterSeq() != null ? request.getAfterSeq() : 0;
        boolean accepted = supervisor.resume(runId, payload);
        if (!accepted) {
            return streamer.error("RUN_BUSY", "任务正在其他节点执行，请稍后重试");
        }
        return streamer.stream(runId, afterSeq);
    }

    @ApiOperation("Send a user message to a running run (mid-run steering)")
    @PostMapping("/runs/{runId}/messages")
    public R<Map<String, Object>> sendMessage(@PathVariable String runId,
                                              @RequestBody SendRunMessageRequest request) {
        boolean hasText = request != null && request.getContent() != null
                && !request.getContent().trim().isEmpty();
        boolean hasParts = request != null && request.getContentParts() != null
                && !request.getContentParts().isEmpty();
        if (!hasText && !hasParts) {
            return R.fail("消息内容不能为空");
        }
        try {
            supervisor.requireOwned(runId, SecurityContextUtil.getUserId(), parseTenantId());
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
        ChatMessage message = ChatMessage.builder()
                .role("user")
                .content(hasText ? request.getContent() : "")
                .contentParts(hasParts ? request.getContentParts() : null)
                .build();
        boolean accepted = supervisor.steer(runId, message);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("runId", runId);
        // Rejected means the run is past its last safe boundary: the caller
        // answers the turn as a new run (the transcript already holds everything).
        data.put("accepted", accepted);
        return R.data(data);
    }

    @ApiOperation("Cancel a run")
    @PostMapping("/runs/{runId}/cancel")
    public R<Map<String, String>> cancel(@PathVariable String runId) {
        try {
            supervisor.requireOwned(runId, SecurityContextUtil.getUserId(), parseTenantId());
            supervisor.cancel(runId);
            Map<String, String> result = new LinkedHashMap<>();
            result.put("runId", runId);
            result.put("status", "CANCELLED");
            return R.data(result);
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    // ==================== threads ====================

    @ApiOperation("Cancel the conversation's active run")
    @DeleteMapping("/threads/{threadId}/active-run")
    public R<Map<String, String>> cancelActive(@PathVariable String threadId) {
        supervisor.cancelActiveByConversation(threadId,
                SecurityContextUtil.getUserId(), parseTenantId());
        Map<String, String> result = new LinkedHashMap<>();
        result.put("threadId", threadId);
        result.put("status", "CANCELLED");
        return R.data(result);
    }

    @ApiOperation("Get thread view (title/summary/active run)")
    @GetMapping("/threads/{threadId}")
    public R<ThreadView> getThread(@PathVariable String threadId) {
        com.knowledge.agent.core.entity.AgentThreadEntity entity = threadStore.get(threadId);
        if (entity == null) {
            return R.fail("会话不存在");
        }
        Long userId = SecurityContextUtil.getUserId();
        Long tenantId = parseTenantId();
        boolean userOk = entity.getUserId() == null || userId == null || entity.getUserId().equals(userId);
        boolean tenantOk = entity.getTenantId() == null || tenantId == null || entity.getTenantId().equals(tenantId);
        if (!userOk || !tenantOk) {
            return R.fail("会话不存在");
        }
        return R.data(ThreadView.of(entity));
    }

    // ==================== memory ====================

    /**
     * Browse / search long-term memory for the memory-management UI.
     *
     * <ul>
     *   <li>{@code scope=*} (alias {@code all}) — every scope the caller owns
     *       (user → space → page), newest first. This is the only way the UI can
     *       see page-scoped memories, because it cannot enumerate page ids.</li>
     *   <li>{@code query} — keyword recall. It spans the caller's scopes when
     *       {@code scope=*}, otherwise the scopes reachable from
     *       {@code spaceId}/{@code pageId} (most specific first). A ranked result
     *       ignores {@code offset}.</li>
     *   <li>neither — one exact scope (default: the caller's user scope).</li>
     * </ul>
     *
     * {@code total} counts the caller's whole set for the same {@code type}
     * filter, so the UI can page honestly instead of guessing from {@code count}.
     */
    @ApiOperation("Browse or search long-term memory (scope=* spans every scope)")
    @GetMapping("/memory")
    public R<Map<String, Object>> listMemory(
            @RequestParam(name = "scope", required = false) String scope,
            @RequestParam(name = "query", required = false) String query,
            @RequestParam(name = "type", required = false) String type,
            @RequestParam(name = "spaceId", required = false) String spaceId,
            @RequestParam(name = "pageId", required = false) String pageId,
            @RequestParam(name = "offset", defaultValue = "0") int offset,
            @RequestParam(name = "limit", defaultValue = "20") int limit) {
        Long userId = SecurityContextUtil.getUserId();
        Long tenantId = parseTenantId();
        int safeLimit = Math.max(1, Math.min(limit, MAX_MEMORY_PAGE));
        int safeOffset = Math.max(0, offset);
        String typeFilter = blankToNull(type);
        List<Map<String, Object>> items = new ArrayList<>();
        int total;
        try {
            List<MemoryEntry> entries;
            if (isAllScopes(scope)) {
                entries = memoryStore.listAll(userId, tenantId, query, typeFilter, safeLimit, safeOffset);
                total = memoryStore.countAll(userId, tenantId, typeFilter);
            } else if (query != null && !query.trim().isEmpty()) {
                entries = memoryStore.recall(
                        MemoryScope.scopesFor(userId, spaceId, pageId), query, typeFilter, safeLimit);
                total = entries.size();
            } else {
                String targetScope = blankToNull(scope);
                if (targetScope == null) {
                    targetScope = MemoryScope.userScope(userId);
                }
                entries = memoryStore.list(targetScope, safeLimit);
                if (typeFilter != null) {
                    entries.removeIf(entry -> !typeFilter.equalsIgnoreCase(entry.getType()));
                }
                total = entries.size();
            }
            for (MemoryEntry entry : entries) {
                items.add(toMemoryItem(entry));
            }
        } catch (Exception e) {
            return R.fail("读取记忆失败：" + e.getMessage());
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("count", items.size());
        result.put("total", total);
        result.put("memories", items);
        return R.data(result);
    }

    @ApiOperation("Create one long-term memory entry by hand (user scope by default)")
    @PostMapping("/memory")
    public R<Map<String, Object>> createMemory(@RequestBody CreateMemoryRequest request) {
        String content = request.getContent() == null ? "" : request.getContent().trim();
        if (content.isEmpty()) {
            return R.fail("记忆内容不能为空");
        }
        if (content.length() > MAX_MEMORY_CONTENT) {
            content = content.substring(0, MAX_MEMORY_CONTENT);
        }
        Long userId = SecurityContextUtil.getUserId();
        if (userId == null) {
            // Without an identity the scope key would be "u:null" — a memory
            // nobody can ever list or delete again.
            return R.fail("未登录");
        }
        String spaceId = blankToNull(request.getSpaceId());
        String pageId = blankToNull(request.getPageId());
        String scopeMode = request.getScope() == null
                ? "user" : request.getScope().trim().toLowerCase(Locale.ROOT);
        String scopeKey;
        if ("space".equals(scopeMode)) {
            if (spaceId == null) {
                return R.fail("空间级记忆需要 spaceId");
            }
            scopeKey = MemoryScope.spaceScope(userId, spaceId);
        } else if ("page".equals(scopeMode)) {
            if (spaceId == null || pageId == null) {
                return R.fail("页面级记忆需要 spaceId 与 pageId");
            }
            scopeKey = MemoryScope.pageScope(userId, spaceId, pageId);
        } else {
            scopeKey = MemoryScope.userScope(userId);
        }

        MemoryEntry entry = new MemoryEntry();
        entry.setUserId(userId);
        entry.setTenantId(parseTenantId());
        entry.setSpaceId(spaceId);
        entry.setPageId(pageId);
        entry.setScope(scopeKey);
        entry.setType(normalizeMemoryType(request.getType()));
        entry.setContent(content);
        entry.setImportance(clampImportance(request.getImportance()));
        if (request.getTags() != null) {
            for (String tag : request.getTags()) {
                if (tag == null || tag.trim().isEmpty() || entry.getTags().size() >= MAX_MEMORY_TAGS) {
                    continue;
                }
                // Tags travel as one comma-joined column; a comma inside a tag
                // would split it apart on the next read.
                entry.getTags().add(tag.trim().replace(',', ' ').replace('，', ' '));
            }
        }
        try {
            return R.data(toMemoryItem(memoryStore.remember(entry)));
        } catch (Exception e) {
            return R.fail("保存记忆失败：" + e.getMessage());
        }
    }

    @ApiOperation("Delete every long-term memory entry owned by the caller")
    @DeleteMapping("/memory")
    public R<Map<String, Object>> purgeMemory() {
        int removed;
        try {
            removed = memoryStore.forgetAll(SecurityContextUtil.getUserId(), parseTenantId());
        } catch (Exception e) {
            return R.fail("清空记忆失败：" + e.getMessage());
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("removed", removed);
        return R.data(result);
    }

    @ApiOperation("Delete one long-term memory entry")
    @DeleteMapping("/memory/{memoryId}")
    public R<Map<String, Object>> deleteMemory(@PathVariable String memoryId) {
        boolean removed = memoryStore.forget(memoryId, SecurityContextUtil.getUserId(), parseTenantId());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("memoryId", memoryId);
        result.put("removed", removed);
        return removed ? R.data(result) : R.fail("记忆不存在或无权限");
    }

    /** One memory row as JSON for the management UI. */
    private Map<String, Object> toMemoryItem(MemoryEntry entry) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("memoryId", entry.getMemoryId());
        item.put("scope", entry.getScope());
        item.put("type", entry.getType());
        item.put("content", entry.getContent());
        item.put("importance", entry.getImportance());
        item.put("tags", entry.getTags());
        item.put("createTime", entry.getCreateTime());
        item.put("lastAccessTime", entry.getLastAccessTime());
        return item;
    }

    /** {@code scope=*} / {@code scope=all} = the caller's every scope. */
    private static boolean isAllScopes(String scope) {
        if (scope == null) {
            return false;
        }
        String value = scope.trim();
        return "*".equals(value) || "all".equalsIgnoreCase(value);
    }

    private static String blankToNull(String value) {
        return (value == null || value.trim().isEmpty()) ? null : value.trim();
    }

    private static String normalizeMemoryType(String type) {
        String value = type == null ? "" : type.trim().toLowerCase(Locale.ROOT);
        if ("fact".equals(value) || "preference".equals(value) || "note".equals(value)
                || "episode".equals(value)) {
            return value;
        }
        return "note";
    }

    private static int clampImportance(Integer importance) {
        int value = importance == null ? 50 : importance;
        return Math.max(0, Math.min(100, value));
    }

    // ==================== internals ====================

    private Long parseTenantId() {
        try {
            String tenantId = SecurityContextUtil.getTenantId();
            return (tenantId == null || tenantId.trim().isEmpty()) ? null : Long.parseLong(tenantId.trim());
        } catch (Exception e) {
            return null;
        }
    }
}
