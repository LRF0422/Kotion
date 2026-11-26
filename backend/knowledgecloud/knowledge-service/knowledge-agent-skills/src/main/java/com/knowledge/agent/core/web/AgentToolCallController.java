package com.knowledge.agent.core.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.entity.AgentToolCallEntity;
import com.knowledge.agent.core.state.AgentToolCallStore;
import com.knowledge.agent.core.web.dto.AgentStateDtos;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Tool-execution ledger + approval control plane.
 *
 * <pre>
 * POST /api/agent/v1/runs/{runId}/tool-calls/{callId}/started
 * POST /api/agent/v1/runs/{runId}/tool-calls/{callId}/completed
 * POST /api/agent/v1/runs/{runId}/tool-calls/{callId}/uncertain
 * POST /api/agent/v1/runs/{runId}/tool-calls/{callId}/approval-request
 * POST /api/agent/v1/runs/{runId}/tool-calls/{callId}/approval-decision
 * GET  /api/agent/v1/runs/{runId}/tool-calls
 * GET  /api/agent/v1/runs/{runId}/tool-calls/{callId}
 * </pre>
 */
@Api(tags = "Agent Tool Execution Ledger")
@RestController
@RequestMapping("/api/agent/v1")
public class AgentToolCallController {

    private final AgentToolCallStore store;
    private final ObjectMapper objectMapper;

    public AgentToolCallController(AgentToolCallStore store, ObjectMapper objectMapper) {
        this.store = store;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
    }

    @ApiOperation("Record tool execution intent before the side effect")
    @PostMapping("/runs/{runId}/tool-calls/{callId}/started")
    public R<AgentStateDtos.ToolCallView> started(@PathVariable String runId,
                                                  @PathVariable String callId,
                                                  @RequestBody(required = false) AgentStateDtos.ToolStartedRequest request) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        AgentToolCallStore.StartedCommand cmd = new AgentToolCallStore.StartedCommand();
        if (request != null) {
            cmd.setToolName(request.getToolName());
            cmd.setArgsHash(request.getArgsHash());
            cmd.setArgs(request.getArgs());
            cmd.setIdempotencyKey(request.getIdempotencyKey());
        }
        AgentToolCallEntity entity = store.started(identity.tenantId, identity.userId, runId, callId, cmd);
        return R.data(AgentStateDtos.ToolCallView.of(entity, objectMapper, true));
    }

    @ApiOperation("Record tool outcome (idempotent)")
    @PostMapping("/runs/{runId}/tool-calls/{callId}/completed")
    public R<AgentStateDtos.ToolCallView> completed(@PathVariable String runId,
                                                    @PathVariable String callId,
                                                    @RequestBody(required = false) AgentStateDtos.ToolCompletedRequest request) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        AgentToolCallStore.CompletedCommand cmd = new AgentToolCallStore.CompletedCommand();
        if (request != null) {
            cmd.setOk(request.getOk() == null || request.getOk());
            cmd.setResult(request.getResult());
            cmd.setError(request.getError());
        }
        AgentToolCallEntity entity = store.completed(identity.tenantId, identity.userId, runId, callId, cmd);
        return R.data(AgentStateDtos.ToolCallView.of(entity, objectMapper, true));
    }

    @ApiOperation("Mark a started call as uncertain (restart recovery)")
    @PostMapping("/runs/{runId}/tool-calls/{callId}/uncertain")
    public R<AgentStateDtos.ToolCallView> uncertain(@PathVariable String runId,
                                                    @PathVariable String callId) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        AgentToolCallEntity entity = store.uncertain(identity.tenantId, identity.userId, runId, callId);
        return R.data(AgentStateDtos.ToolCallView.of(entity, objectMapper, true));
    }

    @ApiOperation("Persist an approval request before rendering the card")
    @PostMapping("/runs/{runId}/tool-calls/{callId}/approval-request")
    public R<AgentStateDtos.ToolCallView> requestApproval(@PathVariable String runId,
                                                          @PathVariable String callId,
                                                          @RequestBody AgentStateDtos.ToolApprovalRequest request) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        AgentToolCallStore.ApprovalCommand cmd = new AgentToolCallStore.ApprovalCommand();
        if (request != null) {
            cmd.setToolName(request.getToolName());
            cmd.setArgsHash(request.getArgsHash());
            cmd.setRequest(request.getRequest());
            cmd.setTimeoutMs(request.getTimeoutMs());
        }
        AgentToolCallEntity entity = store.requestApproval(identity.tenantId, identity.userId,
                runId, callId, cmd);
        return R.data(AgentStateDtos.ToolCallView.of(entity, objectMapper, true));
    }

    @ApiOperation("Approve/reject a persisted approval request")
    @PostMapping("/runs/{runId}/tool-calls/{callId}/approval-decision")
    public R<AgentStateDtos.ToolCallView> decideApproval(@PathVariable String runId,
                                                         @PathVariable String callId,
                                                         @RequestBody AgentStateDtos.ToolDecisionRequest request) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        AgentToolCallStore.DecisionCommand cmd = new AgentToolCallStore.DecisionCommand();
        if (request != null) {
            cmd.setAllowed(Boolean.TRUE.equals(request.getAllowed()));
            cmd.setNote(request.getNote());
        }
        AgentToolCallEntity entity = store.decideApproval(identity.tenantId, identity.userId,
                runId, callId, cmd);
        return R.data(AgentStateDtos.ToolCallView.of(entity, objectMapper, true));
    }

    @ApiOperation("List tool calls of one run")
    @GetMapping("/runs/{runId}/tool-calls")
    public R<AgentStateDtos.ToolCallListView> list(@PathVariable String runId,
                                                   @RequestParam(name = "status", required = false) String status,
                                                   @RequestParam(name = "limit", defaultValue = "100") int limit) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        List<AgentToolCallEntity> rows = store.list(identity.tenantId, identity.userId, runId, status, limit);
        AgentStateDtos.ToolCallListView view = new AgentStateDtos.ToolCallListView();
        view.setCount(rows.size());
        view.setCalls(AgentStateDtos.toolCalls(rows, objectMapper, true));
        return R.data(view);
    }

    @ApiOperation("Get one tool call")
    @GetMapping("/runs/{runId}/tool-calls/{callId}")
    public R<AgentStateDtos.ToolCallView> get(@PathVariable String runId,
                                              @PathVariable String callId) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        AgentToolCallEntity entity = store.get(identity.tenantId, identity.userId, runId, callId);
        return R.data(AgentStateDtos.ToolCallView.of(entity, objectMapper, true));
    }
}