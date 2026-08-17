package com.knowledge.agent.core.web.dto;

import com.knowledge.agent.core.loop.ResumePayload;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * POST /api/agent/v1/runs/{runId}/resume request body.
 */
@Data
public class ResumeRequest {

    /** tool_results | approve_plan | continue */
    private String action;

    private List<ResumePayload.ToolResultItem> toolResults = new ArrayList<>();

    private ResumePayload.PlanDecision planDecision;

    /** Client's last seen event seq — the resume stream continues from it. */
    private Long afterSeq;
}
