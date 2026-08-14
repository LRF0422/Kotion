package com.knowledge.agent.v2.job;

import com.knowledge.agent.v2.context.ContextCompactor;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;

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
final class ResumeApplier {

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
    static void apply(AgentSession session, List<AgentJobService.ToolResult> toolResults,
            String action, int maxChars) {
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
        session.getExecution().setSuspendReason(null);
        session.getExecution().transitionTo(AgentState.THINK);
    }
}
