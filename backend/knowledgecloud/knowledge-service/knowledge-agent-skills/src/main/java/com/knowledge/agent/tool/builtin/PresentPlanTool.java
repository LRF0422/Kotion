package com.knowledge.agent.tool.builtin;

import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import org.springframework.stereotype.Component;

/**
 * Plan-mode tool (P7): the agent calls {@code present_plan} to submit its
 * structured plan for user approval.
 *
 * <p>This tool is <b>intercepted</b> by the harness loop — its {@link #execute}
 * is never actually invoked. When the LLM calls it, the loop emits a
 * {@code plan_proposed} annotation and finishes the turn with
 * {@code finishReason="plan-approval"}, pausing for the user's decision.
 *
 * <p>It is read-only (does not mutate anything) so it remains available while in
 * PLAN mode.
 */
@Component
public class PresentPlanTool implements Tool {

    @Override
    public String getId() {
        return "present_plan";
    }

    @Override
    public String getDescription() {
        return "Submit your finished plan for the user to approve before any changes are made. "
                + "Call this once you have finished read-only research in plan mode. Provide a title, "
                + "a short summary, an ordered list of steps (each with the tools it will use and a risk "
                + "level), any open questions, and the estimated number of mutations.";
    }

    @Override
    public String getJsonSchema() {
        return "{\"type\":\"object\",\"properties\":{"
                + "\"title\":{\"type\":\"string\",\"description\":\"Short plan title\"},"
                + "\"summary\":{\"type\":\"string\",\"description\":\"One- or two-sentence summary\"},"
                + "\"steps\":{\"type\":\"array\",\"items\":{\"type\":\"object\",\"properties\":{"
                + "\"id\":{\"type\":\"integer\"},"
                + "\"action\":{\"type\":\"string\",\"description\":\"What this step does\"},"
                + "\"tools\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},"
                + "\"risk\":{\"type\":\"string\",\"enum\":[\"low\",\"medium\",\"high\"]}"
                + "},\"required\":[\"action\"]},\"description\":\"Ordered plan steps\"},"
                + "\"openQuestions\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},"
                + "\"estimatedMutations\":{\"type\":\"integer\"}"
                + "},\"required\":[\"summary\",\"steps\"]}";
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        // Never invoked — the harness intercepts present_plan before execution.
        return ToolResult.success("Plan submitted for approval.");
    }

    @Override
    public boolean isFrontend() {
        return false;
    }
}
