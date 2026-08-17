package com.knowledge.agent.core.web;

import com.knowledge.agent.core.loop.ResumePayload;
import com.knowledge.agent.core.memory.MemoryEntry;
import com.knowledge.agent.core.memory.MemoryScope;
import com.knowledge.agent.core.memory.MemoryStore;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.RunView;
import com.knowledge.agent.core.supervisor.CreateRunCommand;
import com.knowledge.agent.core.supervisor.DefaultRunSupervisor;
import com.knowledge.agent.core.supervisor.ThreadStore;
import com.knowledge.agent.core.web.dto.CreateRunRequest;
import com.knowledge.agent.core.web.dto.ResumeRequest;
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
 * POST   /api/agent/v1/runs/{runId}/cancel        cancel
 * DELETE /api/agent/v1/threads/{threadId}/active-run   cancel conversation's run
 * GET    /api/agent/v1/threads/{threadId}         thread view (session memory)
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
        cmd.setNoTools(request.isNoTools());
        cmd.setSpaceId(request.getSpaceId());
        cmd.setPageId(request.getPageId());
        cmd.setUserId(SecurityContextUtil.getUserId());
        cmd.setTenantId(parseTenantId());
        cmd.setToken(SecurityContextUtil.getToken());
        cmd.setSkillFragments(new ArrayList<>());
        if (request.getSkills() != null) {
            for (CreateRunRequest.SkillInput skill : request.getSkills()) {
                if (skill != null && skill.getSystemPromptFragment() != null
                        && !skill.getSystemPromptFragment().trim().isEmpty()) {
                    cmd.getSkillFragments().add(skill.getSystemPromptFragment().trim());
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

    @ApiOperation("Browse long-term memory (optionally keyword recall)")
    @GetMapping("/memory")
    public R<Map<String, Object>> listMemory(
            @RequestParam(name = "scope", required = false) String scope,
            @RequestParam(name = "query", required = false) String query,
            @RequestParam(name = "spaceId", required = false) String spaceId,
            @RequestParam(name = "pageId", required = false) String pageId,
            @RequestParam(name = "limit", defaultValue = "20") int limit) {
        Long userId = SecurityContextUtil.getUserId();
        Map<String, Object> result = new LinkedHashMap<>();
        List<Map<String, Object>> items = new ArrayList<>();
        try {
            List<MemoryEntry> entries;
            if (query != null && !query.trim().isEmpty()) {
                entries = memoryStore.recall(
                        MemoryScope.scopesFor(userId, spaceId, pageId), query, null, limit);
            } else {
                String targetScope = scope;
                if (targetScope == null || targetScope.trim().isEmpty()) {
                    targetScope = MemoryScope.userScope(userId);
                }
                entries = memoryStore.list(targetScope, limit);
            }
            for (MemoryEntry entry : entries) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("memoryId", entry.getMemoryId());
                item.put("scope", entry.getScope());
                item.put("type", entry.getType());
                item.put("content", entry.getContent());
                item.put("importance", entry.getImportance());
                item.put("tags", entry.getTags());
                item.put("createTime", entry.getCreateTime());
                item.put("lastAccessTime", entry.getLastAccessTime());
                items.add(item);
            }
        } catch (Exception e) {
            return R.fail("读取记忆失败：" + e.getMessage());
        }
        result.put("count", items.size());
        result.put("memories", items);
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
