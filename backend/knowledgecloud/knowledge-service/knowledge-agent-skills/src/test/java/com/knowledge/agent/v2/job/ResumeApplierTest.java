package com.knowledge.agent.v2.job;

import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ResumeApplier} — the resume idempotency contract.
 */
class ResumeApplierTest {

    private AgentSession session() {
        AgentSession session = AgentSession.builder()
                .sessionId("sess-1")
                .conversationId("conv-1")
                .build();
        session.getExecution().setMessages(new ArrayList<>(Arrays.asList(
                ConversationMessage.system("sys"),
                ConversationMessage.user("go"),
                ConversationMessage.builder()
                        .role("assistant")
                        .content("calling")
                        .toolCalls(Arrays.asList(
                                new ConversationMessage.ToolCallInfo("c1", "function", "fe_tool", "{}"),
                                new ConversationMessage.ToolCallInfo("c2", "function", "fe_tool2", "{}")))
                        .build(),
                ConversationMessage.toolResult("c1", "fe_tool", "already applied"))));
        session.getExecution().setIteration(12);
        session.getExecution().setSuspendReason("frontend_tool_calls");
        session.getExecution().setPendingToolCalls(Arrays.asList(
                new InferenceResponse.ToolCallData("c2", "fe_tool2", "{}")));
        session.getExecution().transitionTo(AgentState.SUSPENDED);
        return session;
    }

    private AgentJobService.ToolResult result(String id, String name, String out) {
        AgentJobService.ToolResult r = new AgentJobService.ToolResult();
        r.toolCallId = id;
        r.toolName = name;
        r.result = out;
        r.success = true;
        return r;
    }

    @Test
    void appliesNewResultsAndSkipsAlreadyAppliedOnes() {
        AgentSession session = session();
        ResumeApplier.apply(session, Arrays.asList(
                result("c1", "fe_tool", "DUPLICATE-SHOULD-BE-IGNORED"),
                result("c2", "fe_tool2", "second result")), null, 8000);

        List<ConversationMessage> messages = session.getExecution().getMessages();
        // c1 already applied → skipped; only c2 appended.
        assertThat(messages).hasSize(5);
        assertThat(messages.stream()
                .filter(m -> "tool".equals(m.getRole()) && "c1".equals(m.getToolCallId()))
                .count()).isEqualTo(1);
        assertThat(messages.get(3).getContent()).isEqualTo("already applied");
        assertThat(messages.get(4).getToolCallId()).isEqualTo("c2");
        assertThat(messages.get(4).getContent()).isEqualTo("second result");

        // Suspension cleared and the engine resumes at THINK.
        assertThat(session.getExecution().getSuspendReason()).isNull();
        assertThat(session.getExecution().getCurrentState()).isEqualTo(AgentState.THINK);
        assertThat(session.getExecution().getIteration()).isEqualTo(12);
        // Tool-result resume consumes the suspension checkpoint.
        assertThat(session.getExecution().getPendingToolCalls()).isNull();
    }

    @Test
    void continueActionGrantsFreshIterationBudget() {
        AgentSession session = session();
        ResumeApplier.apply(session, null, "continue", 8000);

        assertThat(session.getExecution().getIteration()).isZero();
        assertThat(session.getExecution().getCurrentState()).isEqualTo(AgentState.THINK);
        assertThat(session.getExecution().getSuspendReason()).isNull();
    }

    @Test
    void truncatesOversizedToolResults() {
        AgentSession session = session();
        String longResult = String.join("", java.util.Collections.nCopies(200, "x"));
        ResumeApplier.apply(session,
                Arrays.asList(result("c2", "fe_tool2", longResult)), null, 100);

        ConversationMessage last = session.getExecution().getMessages()
                .get(session.getExecution().getMessages().size() - 1);
        assertThat(last.getToolCallId()).isEqualTo("c2");
        assertThat(last.getContent()).hasSizeLessThan(200);
        assertThat(last.getContent()).startsWith("xxxxxxxxxx");
        assertThat(last.getContent()).contains("已截断");
    }

    @Test
    void nullAndEmptyResultsAreNoOps() {
        AgentSession session = session();
        ResumeApplier.apply(session, null, null, 8000);
        ResumeApplier.apply(session, new ArrayList<>(), null, 8000);

        assertThat(session.getExecution().getMessages()).hasSize(4);
        assertThat(session.getExecution().getCurrentState()).isEqualTo(AgentState.THINK);
    }
}
