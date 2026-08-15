package com.knowledge.agent.v2.event;

/**
 * Plan-mode events — the plan-proposal human-in-the-loop contract.
 *
 * <p>When the engine intercepts a {@code present_plan} tool call it emits a
 * {@link PlanProposed} event carrying the structured plan artifact and then
 * suspends with finishReason {@code suspended:plan_approval}. The client
 * renders the plan card and resumes with a decision (approved / rejected).
 */
public abstract class PlanEvent extends AgentEvent {

    private final String toolCallId;
    private final String planJson;

    protected PlanEvent(String sessionId, String toolCallId, String planJson) {
        super(sessionId);
        this.toolCallId = toolCallId;
        this.planJson = planJson;
    }

    public String getToolCallId() {
        return toolCallId;
    }

    public String getPlanJson() {
        return planJson;
    }

    /**
     * Emitted when the agent submits a structured plan for user approval.
     */
    public static class PlanProposed extends PlanEvent {

        public PlanProposed(String sessionId, String toolCallId, String planJson) {
            super(sessionId, toolCallId, planJson);
        }

        @Override
        public String type() {
            return "plan.proposed";
        }
    }

    /**
     * Emitted when the user's decision is applied and the engine resumes.
     */
    public static class PlanResolved extends PlanEvent {

        private final String decision;
        private final String feedback;

        public PlanResolved(String sessionId, String toolCallId, String planJson,
                String decision, String feedback) {
            super(sessionId, toolCallId, planJson);
            this.decision = decision;
            this.feedback = feedback;
        }

        public String getDecision() {
            return decision;
        }

        public String getFeedback() {
            return feedback;
        }

        @Override
        public String type() {
            return "plan.resolved";
        }
    }
}
