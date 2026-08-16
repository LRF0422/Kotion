package com.knowledge.agent.v2.handler;

import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.Transition;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.llm.LlmAdapter;
import com.knowledge.agent.v2.llm.LlmChunk;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ThinkHandlerContextLimitTest {

    private LlmAdapter llmAdapter;
    private ThinkHandler handler;
    private AgentSession session;

    @BeforeEach
    void setUp() {
        llmAdapter = mock(LlmAdapter.class);
        handler = new ThinkHandler(llmAdapter, mock(ToolRegistry.class));
        session = AgentSession.builder()
                .sessionId("s1")
                .conversationId("c1")
                .build();
        session.getExecution().addMessage(ConversationMessage.user("go"));
    }

    @Test
    void lengthFinishContinuesInsteadOfStopping() {
        when(llmAdapter.streamInfer(any())).thenReturn(Flux.just(
                LlmChunk.textDelta("partial answer"),
                LlmChunk.finish("length", 100, 50)));

        List<AgentEvent> events = handler.handle(session, AgentState.THINK).collectList().block();

        assertThat(events).isNotNull();
        assertThat(events.stream().filter(e -> e instanceof Transition)
                .map(e -> ((Transition) e).getNextState()))
                .contains(AgentState.THINK)
                .doesNotContain(AgentState.DONE);
        // Output truncation alone must not invalidate the prompt-cache prefix.
        assertThat(session.getExecution().isCompactNextThink()).isFalse();
        // Automatic continuation must not consume the iteration budget.
        assertThat(session.getExecution().getIteration()).isZero();
        assertThat(session.getExecution().getMessages())
                .anyMatch(m -> "assistant".equals(m.getRole()) && "partial answer".equals(m.getContent()))
                .anyMatch(m -> "user".equals(m.getRole()) && m.getContent().contains("系统续写指令"));
    }

    @Test
    void contextLengthErrorRetriesAfterCompaction() {
        when(llmAdapter.streamInfer(any()))
                .thenReturn(Flux.error(new RuntimeException("maximum context length exceeded")));

        List<AgentEvent> events = handler.handle(session, AgentState.THINK).collectList().block();

        assertThat(events).isNotNull();
        assertThat(events.stream().filter(e -> e instanceof Transition)
                .map(e -> ((Transition) e).getNextState()))
                .containsExactly(AgentState.THINK);
        assertThat(session.getExecution().isCompactNextThink()).isTrue();
        // Context-error retry stays in the same iteration.
        assertThat(session.getExecution().getIteration()).isZero();
    }
}
