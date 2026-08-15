package com.knowledge.agent.v2.job;

import com.knowledge.agent.v2.context.ContextCompactor;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.v2.session.AgentMode;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Applies frontend tool results to a session as part of a resume.
 *
 * <p>Extracted from {@link AgentJobService} so the idempotency contract is
 * unit-testable without the full executor graph. Package-private: resume
 * semantics are an implementation detail of the job executor.
 */
public final class ResumeApplier {

    private ResumeApplier() {
    }

    /**
     * Apply tool results and/or a budget "continue" action to the session.
     *
     * <ul>
     *   <li>Tool results already present in the session (by toolCallId) are
     *       skipped — a retried resume never duplicates a result message and
     *       therefore never corrupts the assistant tool_calls ↔ tool result
     *       pairing that providers like DeepSeek validate strictly.</li>
     *   <li>{@code action="continue"} grants a fresh iteration budget.</li>
     *   <li>The session transitions to THINK so the resumed engine reasons on
     *       the completed tool round.</li>
     * </ul>
     */
    /**
     * User decision on a proposed plan (plan-approval resume).
     */
    public static final class PlanDecision {
        public String planId;
        public String decision;   // approved | rejected
        public String planJson;   // the (possibly edited) plan artifact
        public String feedback;   // rejection feedback
    }

    static void apply(AgentSession session, List<AgentJobService.ToolResult> toolResults,
            String action, int maxChars) {
        apply(session, toolResults, action, maxChars, null);
    }

    static void apply(AgentSession session, List<AgentJobService.ToolResult> toolResults,
            String action, int maxChars, PlanDecision planDecision) {
        if (toolResults != null && !toolResults.isEmpty()) {
            Set<String> applied = new HashSet<>();
            for (ConversationMessage msg : session.getExecution().getMessages()) {
                if ("tool".equals(msg.getRole()) && msg.getToolCallId() != null) {
                    applied.add(msg.getToolCallId());
                }
            }
            for (AgentJobService.ToolResult tr : toolResults) {
                if (tr == null || tr.toolCallId == null || !applied.add(tr.toolCallId)) {
                    continue; // already applied by a previous (retried) resume
                }
                ConversationMessage toolMsg = ConversationMessage.toolResult(
                        tr.toolCallId, tr.toolName,
                        ContextCompactor.truncateToolResult(tr.result, maxChars));
                session.getExecution().addMessage(toolMsg);
            }
        }
        if ("continue".equalsIgnoreCase(action)) {
            session.getExecution().setIteration(0);
        }
        if (planDecision != null && planDecision.decision != null) {
            applyPlanDecision(session, planDecision, maxChars);
        }
        session.getExecution().setSuspendReason(null);
        session.getExecution().transitionTo(AgentState.THINK);
    }

    /**
     * Answer the pending {@code present_plan} tool call with the user's
     * decision. Approved: flip the session to EXECUTE and inject the approved
     * plan as a system message. Rejected: stay in PLAN and hand the feedback
     * back to the LLM so it can re-plan.
     */
    private static void applyPlanDecision(AgentSession session, PlanDecision d, int maxChars) {
        String planCallId = d.planId;
        List<InferenceResponse.ToolCallData> pending = session.getExecution().getPendingToolCalls();
        if (planCallId == null && pending != null) {
            for (InferenceResponse.ToolCallData tc : pending) {
                if ("present_plan".equals(tc.getName())) {
                    planCallId = tc.getId();
                    break;
                }
            }
        }

        String content;
        if ("approved".equalsIgnoreCase(d.decision)) {
            session.setMode(AgentMode.EXECUTE);
            content = "计划已获用户批准，现在可以执行。";
            String planText = d.planJson != null ? d.planJson : "";
            if (!planText.isEmpty()) {
                List<ConversationMessage> messages = new ArrayList<>(session.getExecution().getMessages());
                messages.add(ConversationMessage.system("[已批准计划] 严格按照以下用户批准的计划执行：\n"
                        + ContextCompactor.truncateToolResult(planText, maxChars)));
                session.getExecution().setMessages(messages);
            }
        } else {
            session.setMode(AgentMode.PLAN);
            content = "用户拒绝该计划" + (d.feedback != null && !d.feedback.isEmpty()
                    ? "，反馈：" + d.feedback : "")
                    + "。请根据反馈重新调研，修正后再次调用 present_plan。";
        }

        if (planCallId != null) {
            session.getExecution().addMessage(
                    ConversationMessage.toolResult(planCallId, "present_plan", content));
        }
        session.getExecution().clearPendingToolCalls();
    }
}
