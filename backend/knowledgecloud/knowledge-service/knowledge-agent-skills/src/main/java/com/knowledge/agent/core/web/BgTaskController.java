package com.knowledge.agent.core.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.bgtask.BgTaskException;
import com.knowledge.agent.core.bgtask.BgTaskStore;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentBgTaskEntity;
import com.knowledge.agent.core.web.dto.BgTaskDtos;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/**
 * Background task control plane.
 *
 * <pre>
 * POST   /api/agent/v1/bg-tasks                     create (clientTaskId idempotent)
 * POST   /api/agent/v1/bg-tasks/{id}/attach         attach/resume (new lease, attempt+1)
 * PATCH  /api/agent/v1/bg-tasks/{id}                progress/meta/checkpoint/title
 * POST   /api/agent/v1/bg-tasks/{id}/logs           append a batch (batchId idempotent)
 * GET    /api/agent/v1/bg-tasks/{id}/logs           incremental logs (sinceSeq)
 * POST   /api/agent/v1/bg-tasks/{id}/heartbeat      renew lease, return cancelRequested
 * POST   /api/agent/v1/bg-tasks/{id}/finish         terminal state (idempotent)
 * POST   /api/agent/v1/bg-tasks/{id}/cancel         request cancellation
 * GET    /api/agent/v1/bg-tasks                     list the caller's tasks
 * GET    /api/agent/v1/bg-tasks/{id}                task detail
 * </pre>
 *
 * <p>All calls are owner-scoped from the JWT. The client executes; this
 * controller only records state. Writes are gated by
 * {@code agent.bg-task.enabled}; reads stay available so historical rows remain
 * visible during rollout.
 */
@Api(tags = "Agent Background Tasks")
@Slf4j
@RestController
@RequestMapping("/api/agent/v1/bg-tasks")
public class BgTaskController {

    private final BgTaskStore store;
    private final AgentCoreProperties properties;
    private final ObjectMapper objectMapper;

    public BgTaskController(BgTaskStore store, AgentCoreProperties properties, ObjectMapper objectMapper) {
        this.store = store;
        this.properties = properties;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
    }

    @ApiOperation("Create a background task (clientTaskId is idempotent)")
    @PostMapping
    public R<BgTaskDtos.LeaseView> create(@RequestBody BgTaskDtos.CreateRequest request) {
        ensureEnabled();
        Identity identity = identity();
        BgTaskStore.CreateCommand cmd = new BgTaskStore.CreateCommand();
        if (request != null) {
            cmd.setClientTaskId(request.getClientTaskId());
            cmd.setClientId(request.getClientId());
            cmd.setKind(request.getKind());
            cmd.setTitle(request.getTitle());
            cmd.setMode(request.getMode());
            cmd.setConversationId(request.getConversationId());
            cmd.setRunId(request.getRunId());
            cmd.setPluginKey(request.getPluginKey());
            cmd.setToolName(request.getTool());
            cmd.setProgress(request.getProgress());
            cmd.setMeta(request.getMeta());
            cmd.setHeartbeatMs(request.getHeartbeatMs());
            cmd.setResumable(request.getResumable());
            cmd.setResumePolicy(request.getResumePolicy());
        }
        BgTaskStore.Lease lease = store.create(identity.tenantId, identity.userId, cmd);
        return R.data(BgTaskDtos.LeaseView.of(lease, objectMapper, false));
    }

    @ApiOperation("Attach/resume a background task")
    @PostMapping("/{taskId}/attach")
    public R<BgTaskDtos.LeaseView> attach(@PathVariable String taskId,
                                          @RequestBody(required = false) BgTaskDtos.AttachRequest request) {
        ensureEnabled();
        Identity identity = identity();
        String clientId = request == null ? null : request.getClientId();
        BgTaskStore.Lease lease = store.attach(identity.tenantId, identity.userId, taskId, clientId);
        return R.data(BgTaskDtos.LeaseView.of(lease, objectMapper, true));
    }

    @ApiOperation("Update progress/meta/checkpoint/title")
    @PatchMapping("/{taskId}")
    public R<BgTaskDtos.TaskView> update(@PathVariable String taskId,
                                         @RequestBody BgTaskDtos.UpdateRequest request) {
        ensureEnabled();
        Identity identity = identity();
        BgTaskStore.UpdateCommand cmd = new BgTaskStore.UpdateCommand();
        if (request != null) {
            cmd.setProgress(request.getProgress());
            cmd.setMeta(request.getMeta());
            cmd.setCheckpoint(request.getCheckpoint());
            cmd.setTitle(request.getTitle());
        }
        String leaseToken = request == null ? null : request.getLeaseToken();
        AgentBgTaskEntity task = store.update(identity.tenantId, identity.userId, taskId, leaseToken, cmd);
        return R.data(BgTaskDtos.TaskView.of(task, objectMapper, false));
    }

    @ApiOperation("Append one log batch")
    @PostMapping("/{taskId}/logs")
    public R<BgTaskDtos.LogAppendView> appendLogs(@PathVariable String taskId,
                                                  @RequestBody BgTaskDtos.LogsRequest request) {
        ensureEnabled();
        Identity identity = identity();
        List<BgTaskStore.LogEntry> entries = new ArrayList<BgTaskStore.LogEntry>();
        if (request != null && request.getEntries() != null) {
            for (BgTaskDtos.LogEntryRequest entry : request.getEntries()) {
                if (entry == null) {
                    continue;
                }
                entries.add(new BgTaskStore.LogEntry(entry.getKind(), entry.getLevel(),
                        entry.getMessage(), entry.getAt()));
            }
        }
        String leaseToken = request == null ? null : request.getLeaseToken();
        String batchId = request == null ? null : request.getBatchId();
        BgTaskStore.LogAppend append = store.appendLogs(identity.tenantId, identity.userId,
                taskId, leaseToken, batchId, entries);
        return R.data(BgTaskDtos.LogAppendView.of(append));
    }

    @ApiOperation("Read incremental logs")
    @GetMapping("/{taskId}/logs")
    public R<BgTaskDtos.LogPageView> logs(@PathVariable String taskId,
                                          @RequestParam(name = "sinceSeq", defaultValue = "0") long sinceSeq,
                                          @RequestParam(name = "limit", defaultValue = "200") int limit) {
        Identity identity = identity();
        BgTaskStore.LogPage page = store.logsSince(identity.tenantId, identity.userId,
                taskId, sinceSeq, limit);
        return R.data(BgTaskDtos.LogPageView.of(page));
    }

    @ApiOperation("Heartbeat: renew lease and report cancellation")
    @PostMapping("/{taskId}/heartbeat")
    public R<BgTaskDtos.HeartbeatView> heartbeat(@PathVariable String taskId,
                                                 @RequestBody(required = false) BgTaskDtos.HeartbeatRequest request) {
        ensureEnabled();
        Identity identity = identity();
        String leaseToken = request == null ? null : request.getLeaseToken();
        BgTaskStore.Heartbeat heartbeat = store.heartbeat(identity.tenantId, identity.userId,
                taskId, leaseToken);
        return R.data(BgTaskDtos.HeartbeatView.of(heartbeat));
    }

    @ApiOperation("Finish a background task")
    @PostMapping("/{taskId}/finish")
    public R<BgTaskDtos.TaskView> finish(@PathVariable String taskId,
                                         @RequestBody BgTaskDtos.FinishRequest request) {
        ensureEnabled();
        Identity identity = identity();
        String leaseToken = request == null ? null : request.getLeaseToken();
        String state = request == null ? null : request.getState();
        Object result = request == null ? null : request.getResult();
        String error = request == null ? null : request.getError();
        String message = request == null ? null : request.getMessage();
        AgentBgTaskEntity task = store.finish(identity.tenantId, identity.userId, taskId,
                leaseToken, state, result, error, message);
        return R.data(BgTaskDtos.TaskView.of(task, objectMapper, false));
    }

    @ApiOperation("Request cancellation")
    @PostMapping("/{taskId}/cancel")
    public R<BgTaskDtos.TaskView> cancel(@PathVariable String taskId) {
        ensureEnabled();
        Identity identity = identity();
        AgentBgTaskEntity task = store.cancel(identity.tenantId, identity.userId, taskId);
        return R.data(BgTaskDtos.TaskView.of(task, objectMapper, false));
    }

    @ApiOperation("List the caller's background tasks")
    @GetMapping
    public R<BgTaskDtos.ListView> list(
            @RequestParam(name = "state", required = false) String state,
            @RequestParam(name = "conversationId", required = false) String conversationId,
            @RequestParam(name = "pluginKey", required = false) String pluginKey,
            @RequestParam(name = "clientId", required = false) String clientId,
            @RequestParam(name = "limit", defaultValue = "100") int limit) {
        Identity identity = identity();
        List<AgentBgTaskEntity> rows = store.list(identity.tenantId, identity.userId,
                state, conversationId, pluginKey, clientId, limit);
        List<BgTaskDtos.TaskView> tasks = new ArrayList<BgTaskDtos.TaskView>(rows.size());
        for (AgentBgTaskEntity row : rows) {
            tasks.add(BgTaskDtos.TaskView.of(row, objectMapper, false));
        }
        BgTaskDtos.ListView view = new BgTaskDtos.ListView();
        view.setCount(tasks.size());
        view.setTasks(tasks);
        return R.data(view);
    }

    @ApiOperation("Get one background task")
    @GetMapping("/{taskId}")
    public R<BgTaskDtos.TaskView> get(@PathVariable String taskId) {
        Identity identity = identity();
        AgentBgTaskEntity task = store.get(identity.tenantId, identity.userId, taskId);
        return R.data(BgTaskDtos.TaskView.of(task, objectMapper, true));
    }

    // ==================== internals ====================

    private void ensureEnabled() {
        if (!properties.getBgTask().isEnabled()) {
            throw new BgTaskException("TASK_DISABLED",
                    "background tasks are disabled on this server (agent.bg-task.enabled=false)");
        }
    }

    private Identity identity() {
        Long userId = SecurityContextUtil.getUserId();
        Long tenantId = parseTenantId();
        if (userId == null || userId.longValue() <= 0 || tenantId == null) {
            throw new BgTaskException("TASK_IDENTITY_REQUIRED",
                    "authentication is required to access background tasks");
        }
        return new Identity(tenantId, userId);
    }

    private Long parseTenantId() {
        try {
            String tenantId = SecurityContextUtil.getTenantId();
            if (tenantId == null || tenantId.trim().isEmpty()) {
                return null;
            }
            return Long.valueOf(tenantId.trim());
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