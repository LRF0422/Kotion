package com.knowledge.agent.core.web;

import com.knowledge.agent.core.entity.AgentRunEntity;
import com.knowledge.agent.core.mapper.AgentRunMapper;
import com.knowledge.agent.core.web.dto.AgentStateDtos;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Boot-time discovery of runs that are not terminal.
 *
 * <p>Reopening the app used to rely on {@code thread.activeRunId}; if that
 * pointer was missing the client could not find a suspended run. This endpoint
 * lists active runs by conversation (or by owner) so the client can attach and
 * restore pending actions.
 *
 * <pre>GET /api/agent/v1/runs?conversationId=&limit=20</pre>
 */
@Api(tags = "Agent Active Run Discovery")
@RestController
@RequestMapping("/api/agent/v1")
public class AgentRunDiscoveryController {

    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 100;

    private final AgentRunMapper runMapper;

    public AgentRunDiscoveryController(AgentRunMapper runMapper) {
        this.runMapper = runMapper;
    }

    @ApiOperation("List active (non-terminal) runs for boot recovery")
    @GetMapping("/runs")
    public R<AgentStateDtos.ActiveRunListView> active(
            @RequestParam(name = "conversationId", required = false) String conversationId,
            @RequestParam(name = "limit", defaultValue = "20") int limit) {
        AgentStateIdentity.Identity identity = AgentStateIdentity.require();
        int effective = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);

        List<AgentRunEntity> rows = conversationId == null || conversationId.trim().isEmpty()
                ? runMapper.selectActiveByOwner(identity.userId, identity.tenantId, effective)
                : runMapper.selectActiveByConversation(conversationId.trim(), identity.userId,
                        identity.tenantId, effective);

        AgentStateDtos.ActiveRunListView view = new AgentStateDtos.ActiveRunListView();
        view.setCount(rows == null ? 0 : rows.size());
        view.setRuns(AgentStateDtos.activeRuns(rows));
        return R.data(view);
    }
}