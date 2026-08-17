package com.knowledge.agentcore.loop;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * Client resume request — frontend tool results, plan decision, or a budget
 * "continue" grant. All fields are optional; the loop applies what matches.
 */
@Data
public class ResumePayload {

    /** tool_results | approve_plan | continue */
    private String action;

    private List<ToolResultItem> toolResults = new ArrayList<>();

    private PlanDecision planDecision;

    @Data
    public static class ToolResultItem {
        private String callId;
        private boolean ok;
        private Object result;
        private String error;
    }

    @Data
    public static class PlanDecision {
        private boolean approved;
        private String feedback;
    }

    public static ResumePayload cancelMarker() {
        ResumePayload payload = new ResumePayload();
        payload.setAction("cancel");
        return payload;
    }
}
