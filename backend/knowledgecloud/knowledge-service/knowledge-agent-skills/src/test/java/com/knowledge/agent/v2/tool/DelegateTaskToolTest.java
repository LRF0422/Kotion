package com.knowledge.agent.v2.tool;

import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.DelegationEvent;
import com.knowledge.agent.v2.eventbus.AgentEventBus;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import reactor.core.publisher.Flux;

import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link DelegateTaskTool}: recursion depth guard and
 * custom-agent ({@code agent_name}) sub-session assembly.
 */
class DelegateTaskToolTest {

    private ObjectProvider<AgentEngine> engineProvider;
    private ObjectProvider<CustomAgentResolver> resolverProvider;
    private AgentEngine engine;
    private CustomAgentResolver resolver;
    private AgentEventBus eventBus;
    private AgentProperties properties;
    private DelegateTaskTool tool;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        engineProvider = mock(ObjectProvider.class);
        resolverProvider = mock(ObjectProvider.class);
        engine = mock(AgentEngine.class);
        resolver = mock(CustomAgentResolver.class);
        eventBus = mock(AgentEventBus.class);
        properties = new AgentProperties();
        properties.getEngine().setMaxDelegateDepth(2);
        when(engineProvider.getIfAvailable()).thenReturn(engine);
        when(resolverProvider.getIfAvailable()).thenReturn(resolver);
        tool = new DelegateTaskTool(engineProvider, eventBus, properties, resolverProvider);
    }

    private ToolContext contextWithDepth(Integer depth) {
        Map<String, Object> metadata = new HashMap<>();
        if (depth != null) {
            metadata.put(DelegateTaskTool.DELEGATE_DEPTH_KEY, depth);
        }
        return ToolContext.builder()
                .userId(1L)
                .tenantId(7L)
                .token("tok")
                .sessionId("parent-session")
                .conversationId("conv-1")
                .userName("Alice")
                .account("alice")
                .roleName("admin")
                .modelName("parent-model")
                .sessionMetadata(metadata)
                .build();
    }

    // ---- Basic guards ----

    @Test
    void failsWhenEngineUnavailable() {
        when(engineProvider.getIfAvailable()).thenReturn(null);
        ToolResult result = tool.execute(contextWithDepth(null), "{\"description\":\"x\"}");
        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getError()).contains("engine not initialized");
    }

    @Test
    void failsWhenDescriptionMissing() {
        ToolResult result = tool.execute(contextWithDepth(null), "{}");
        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getError()).contains("description");
        verify(engine, never()).run(any());
    }

    // ---- Depth guard ----

    @Test
    void rejectsDelegationAtMaxDepth() {
        ToolResult result = tool.execute(contextWithDepth(2), "{\"description\":\"deep task\"}");
        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getError()).contains("max delegate depth (2)");
        verify(engine, never()).run(any());
    }

    @Test
    void allowsDelegationBelowMaxDepthAndIncrementsChildDepth() {
        when(engine.run(any(AgentSession.class))).thenAnswer(inv -> {
            AgentSession child = inv.getArgument(0);
            child.getExecution().addMessage(ConversationMessage.assistant("child report"));
            child.getExecution().transitionTo(AgentState.DONE);
            return Flux.empty();
        });

        ToolResult result = tool.execute(contextWithDepth(1), "{\"description\":\"task\"}");

        assertThat(result.isSuccess()).isTrue();
        ArgumentCaptor<AgentSession> captor = ArgumentCaptor.forClass(AgentSession.class);
        verify(engine).run(captor.capture());
        assertThat(captor.getValue().getMetadata())
                .containsEntry(DelegateTaskTool.DELEGATE_DEPTH_KEY, 2);
    }

    // ---- agent_name assembly ----

    @Test
    void failsWhenResolverUnavailable() {
        when(resolverProvider.getIfAvailable()).thenReturn(null);
        ToolResult result = tool.execute(contextWithDepth(null),
                "{\"description\":\"task\",\"agent_name\":\"researcher\"}");
        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getError()).contains("not available");
        verify(engine, never()).run(any());
    }

    @Test
    void listsAvailableAgentsWhenNameNotFound() {
        when(resolver.resolve(eq("ghost"), anyLong())).thenReturn(Optional.empty());
        when(resolver.listAvailable(7L)).thenReturn(Collections.singletonList(
                new CustomAgentResolver.CustomAgentSpec(
                        "researcher", "检索专家", "prompt", null, Collections.emptySet(), null)));

        ToolResult result = tool.execute(contextWithDepth(null),
                "{\"description\":\"task\",\"agent_name\":\"ghost\"}");

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getError())
                .contains("'ghost' not found")
                .contains("researcher")
                .contains("检索专家");
        verify(engine, never()).run(any());
    }

    @Test
    void assemblesChildSessionFromCustomAgentSpec() {
        CustomAgentResolver.CustomAgentSpec spec = new CustomAgentResolver.CustomAgentSpec(
                "researcher", "检索专家", "custom system prompt", "custom-model",
                new LinkedHashSet<>(Collections.singletonList("web_search")), 5);
        when(resolver.resolve(eq("researcher"), eq(7L))).thenReturn(Optional.of(spec));
        when(engine.run(any(AgentSession.class))).thenAnswer(inv -> {
            AgentSession child = inv.getArgument(0);
            child.getExecution().addMessage(ConversationMessage.assistant("research findings"));
            child.getExecution().transitionTo(AgentState.DONE);
            return Flux.empty();
        });

        ToolResult result = tool.execute(contextWithDepth(null),
                "{\"description\":\"find docs\",\"expected_output\":\"要点列表\",\"agent_name\":\"researcher\"}");

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getOutput()).contains("researcher").contains("research findings");

        ArgumentCaptor<AgentSession> captor = ArgumentCaptor.forClass(AgentSession.class);
        verify(engine).run(captor.capture());
        AgentSession child = captor.getValue();
        // Spec settings take precedence over parent/default settings.
        assertThat(child.getSystemPrompt()).isEqualTo("custom system prompt");
        assertThat(child.getModelName()).isEqualTo("custom-model");
        assertThat(child.getToolIds()).containsExactly("web_search");
        assertThat(child.getMaxIterations()).isEqualTo(5);
        // Isolation invariants: no frontend tools, fresh session, depth+1.
        assertThat(child.getFrontendTools()).isEmpty();
        assertThat(child.getSessionId()).isNotEqualTo("parent-session");
        assertThat(child.getMetadata()).containsEntry(DelegateTaskTool.DELEGATE_DEPTH_KEY, 1);
        // Identity inherited from the parent context.
        assertThat(child.getIdentity().getTenantId()).isEqualTo(7L);
        assertThat(child.getIdentity().getToken()).isEqualTo("tok");
        // Task description (with expected output) is the child's first message.
        ConversationMessage first = child.getExecution().getMessages().get(0);
        assertThat(first.getRole()).isEqualTo("user");
        assertThat(first.getContent()).contains("find docs").contains("要点列表");

        // Lifecycle events published for the frontend sub-agent tree.
        verify(eventBus).publish(any(DelegationEvent.SubAgentSpawned.class));
        verify(eventBus).publish(any(DelegationEvent.SubAgentCompleted.class));
    }

    @Test
    void defaultsApplyWithoutCustomAgentSpec() {
        when(engine.run(any(AgentSession.class))).thenAnswer(inv -> {
            AgentSession child = inv.getArgument(0);
            child.getExecution().addMessage(ConversationMessage.assistant("done"));
            child.getExecution().transitionTo(AgentState.DONE);
            return Flux.empty();
        });

        ToolResult result = tool.execute(contextWithDepth(null), "{\"description\":\"task\"}");

        assertThat(result.isSuccess()).isTrue();
        ArgumentCaptor<AgentSession> captor = ArgumentCaptor.forClass(AgentSession.class);
        verify(engine).run(captor.capture());
        AgentSession child = captor.getValue();
        // Parent model + engine defaults when no spec is given.
        assertThat(child.getModelName()).isEqualTo("parent-model");
        assertThat(child.getMaxIterations()).isEqualTo(properties.getEngine().getMaxIterations());
        assertThat(child.getToolIds()).isEmpty(); // empty = all backend tools
    }

    @Test
    void reportsSubAgentFailure() {
        when(engine.run(any(AgentSession.class)))
                .thenReturn(Flux.error(new RuntimeException("boom")));

        ToolResult result = tool.execute(contextWithDepth(null), "{\"description\":\"task\"}");

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getError()).contains("boom");
        verify(eventBus).publish(any(DelegationEvent.SubAgentCompleted.class));
    }
}
