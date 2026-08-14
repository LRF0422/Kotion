package com.knowledge.agent.controller;

import com.knowledge.agent.observability.AgentJobMetrics;
import com.knowledge.agent.v2.job.AgentJobService;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Platform-admin endpoint for async agent task metrics.
 *
 * <p>Mirrors the {@code /admin/ai} surface (gateway-protected) and exposes the
 * {@link AgentJobMetrics} counters plus the live executor's active/runs-in-
 * memory gauges.
 */
@Api(tags = "Admin AI Tasks")
@RestController
@RequestMapping("/admin/ai/tasks")
@RequiredArgsConstructor
public class AdminAgentTaskController {

    private final AgentJobMetrics metrics;
    private final AgentJobService jobService;

    @ApiOperation("Async agent task metrics (counters + live gauges)")
    @GetMapping("/metrics")
    public R<Map<String, Object>> metrics() {
        Map<String, Object> out = new LinkedHashMap<>(metrics.snapshot());
        out.put("active", jobService.activeCount());
        out.put("runsInMemory", jobService.runCount());
        return R.data(out);
    }
}
