package com.knowledge.agent.v2.handler;

import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.Transition;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.ToolEvent;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import com.knowledge.agent.v2.tool.ToolCall;
import com.knowledge.agent.v2.tool.ToolRouter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Tests for {@link ActHandler}'s mixed frontend/backend tool-call routing:
 * backend tools must be executed (and their results appended) BEFORE the
 * frontend dispatch suspends the engine, and only the frontend tools may
 * remain pending in the suspension checkpoint.
 */
class ActHandlerMixedToolsTest {

    private ToolRouter toolRouter;
    private ActHandler handler;
    private AgentSession session;

    @BeforeEach
    void setUp() {
        toolRouter = mock(ToolRouter.class);
        AgentProperties properties = new AgentProperties();
        handler = new ActHandler(toolRouter, properties.getContext());
        session = AgentSession.builder()
                .sessionId("s1")
                .conversationId("c1")
                .build();
    }

    @Test
    void mixedCallsExecuteBackendFirstThenSuspendWithFrontendPending() {
        InferenceResponse.ToolCallData backend =
                new InferenceResponse.ToolCallData("be-1", "web_search", "{\"q\":\"x\"}");
        InferenceResponse.ToolCallData frontend =
                new InferenceResponse.ToolCallData("fe-1", "insert_block", "{\"content\":\"hi\"}");
        session.getExecution().setPendingToolCalls(Arrays.asList(backend, frontend));

        when(toolRouter.resolveLocation("web_search", session))
                .thenReturn(ToolEvent.ToolLocation.BACKEND);
        when(toolRouter.resolveLocation("insert_block", session))
                .thenReturn(ToolEvent.ToolLocation.FRONTEND);

        ToolEvent.ToolCompleted completed =
                new ToolEvent.ToolCompleted("s1", "be-1", "web_search", "search results", 5L);
        when(toolRouter.dispatch(
                argThat((List<ToolCall> list) ->
                        list != null && list.size() == 1 && "be-1".equals(list.get(0).getId())),
                eq(session)))
                .thenReturn(Flux.<AgentEvent>just(completed));

        ToolEvent.ToolDispatched dispatched = new ToolEvent.ToolDispatched(
                "s1", "fe-1", "insert_block", "{\"content\":\"hi\"}",
                ToolEvent.ToolLocation.FRONTEND);
        when(toolRouter.dispatch(
                argThat((List<ToolCall> list) ->
                        list != null && list.size() == 1 && "fe-1".equals(list.get(0).getId())),
                eq(session)))
                .thenReturn(Flux.<AgentEvent>just(dispatched));

        List<AgentEvent> events = handler.handle(session, AgentState.ACT).collectList().block();

        assertThat(events).isNotNull().hasSize(3);
        // Order: backend completed → frontend dispatched → suspend transition.
        assertThat(events.get(0)).isInstanceOf(ToolEvent.ToolCompleted.class);
        assertThat(events.get(1)).isInstanceOf(ToolEvent.ToolDispatched.class);
        assertThat(events.get(2)).isInstanceOf(Transition.class);
        assertThat(((Transition) events.get(2)).getNextState()).isEqualTo(AgentState.SUSPENDED);
        assertThat(((Transition) events.get(2)).getReason()).isEqualTo("frontend_tool_calls");

        // The backend result answered its tool call in the conversation.
        List<ConversationMessage> messages = session.getExecution().getMessages();
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).getRole()).isEqualTo("tool");
        assertThat(messages.get(0).getToolCallId()).isEqualTo("be-1");
        assertThat(messages.get(0).getContent()).isEqualTo("search results");

        // Only the frontend tool stays pending for the suspension checkpoint.
        List<InferenceResponse.ToolCallData> pending = session.getExecution().getPendingToolCalls();
        assertThat(pending).hasSize(1);
        assertThat(pending.get(0).getId()).isEqualTo("fe-1");
    }

    @Test
    void backendOnlyCallsClearPendingAndObserve() {
        InferenceResponse.ToolCallData backend =
                new InferenceResponse.ToolCallData("be-1", "web_search", "{}");
        session.getExecution().setPendingToolCalls(Arrays.asList(backend));

        when(toolRouter.resolveLocation("web_search", session))
                .thenReturn(ToolEvent.ToolLocation.BACKEND);
        when(toolRouter.dispatch(any(), eq(session)))
                .thenReturn(Flux.<AgentEvent>just(new ToolEvent.ToolCompleted(
                        "s1", "be-1", "web_search", "done", 1L)));

        List<AgentEvent> events = handler.handle(session, AgentState.ACT).collectList().block();

        assertThat(events).isNotNull().hasSize(2);
        assertThat(((Transition) events.get(1)).getNextState()).isEqualTo(AgentState.OBSERVE);
        assertThat(session.getExecution().getPendingToolCalls()).isNull();
        assertThat(session.getExecution().getMessages()).hasSize(1);
    }

    @Test
    void noPendingCallsIsAnError() {
        List<AgentEvent> events = handler.handle(session, AgentState.ACT).collectList().block();
        assertThat(events).isNotNull().hasSize(1);
        assertThat(((Transition) events.get(0)).getNextState()).isEqualTo(AgentState.ERROR);
    }
}
