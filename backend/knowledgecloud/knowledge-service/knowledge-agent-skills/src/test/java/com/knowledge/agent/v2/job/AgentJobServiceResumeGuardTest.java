package com.knowledge.agent.v2.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.observability.AgentJobMetrics;
import com.knowledge.agent.store.AgentStateStore;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.profile.ProfileRecorder;
import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.AgentSessionFactory;
import com.knowledge.agent.v2.session.ConversationMessage;
import com.knowledge.agent.v2.state.SessionSnapshotCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Re-entrancy tests for {@link AgentJobService#resume}: a retried resume while
 * an execution is already active must NOT double-subscribe the engine.
 */
class AgentJobServiceResumeGuardTest {

    private AgentEngine engine;
    private AgentJobService service;
    private AgentSessionFactory sessionFactory;
    private AgentProperties properties;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        engine = mock(AgentEngine.class);
        com.knowledge.agent.v2.eventbus.AgentEventBus eventBus =
                mock(com.knowledge.agent.v2.eventbus.AgentEventBus.class);
        sessionFactory = mock(AgentSessionFactory.class);
        AgentJobStore jobStore = mock(AgentJobStore.class);
        AgentTaskEventStore eventStore = mock(AgentTaskEventStore.class);
        properties = new AgentProperties();
        ProfileRecorder profileRecorder = mock(ProfileRecorder.class);
        AgentJobMetrics metrics = mock(AgentJobMetrics.class);
        SessionSnapshotCodec snapshotCodec = mock(SessionSnapshotCodec.class);
        ObjectProvider<AgentStateStore> stateStoreProvider = mock(ObjectProvider.class);
        ObjectMapper objectMapper = new ObjectMapper();

        service = new AgentJobService(engine, eventBus, sessionFactory, jobStore, eventStore,
                properties, profileRecorder, metrics, snapshotCodec, stateStoreProvider, objectMapper);

        AgentSession session = AgentSession.builder()
                .sessionId("s1")
                .conversationId("c1")
                .build();
        session.getExecution().setMessages(new ArrayList<>(Arrays.asList(
                ConversationMessage.system("sys"),
                ConversationMessage.user("go"),
                ConversationMessage.builder()
                        .role("assistant")
                        .content("calling")
                        .toolCalls(Collections.singletonList(
                                new ConversationMessage.ToolCallInfo("c1", "function", "fe_tool", "{}")))
                        .build())));
        when(sessionFactory.build(any(), any())).thenReturn(session);

        // The initial run completes immediately (no events) so the task settles
        // into an idle state; resumes then own the engine subscription.
        when(engine.run(any())).thenReturn(Flux.empty());
        when(engine.resume(any())).thenReturn(Flux.never());
        when(stateStoreProvider.getIfAvailable()).thenReturn(null);
    }

    @Test
    void retriedResumeDoesNotDoubleSubscribe() throws Exception {
        AgentIdentity identity = AgentIdentity.builder().userId(1L).tenantId(1L).build();
        AgentJob job = service.create(ChatCompletionRequest.builder().build(), identity);

        // Wait until the initial (empty) execution settles, then simulate the
        // paused state a real engine reaches after a budget suspension.
        awaitTrue(() -> !service.isExecutionActive(job.getTaskId()), 2000);
        AgentJob created = service.status(job.getTaskId());
        created.setStatus(AgentJobStatus.SUSPENDED);
        created.setFinishReason("suspended:iteration_budget_exhausted");

        // First resume: engine.resume subscribed exactly once.
        service.resume(job.getTaskId(), new ArrayList<>(), "continue");
        verify(engine, times(1)).resume(any());

        // Retried resume while execution is active: no second subscription.
        assertThat(service.isExecutionActive(job.getTaskId())).isTrue();
        service.resume(job.getTaskId(), new ArrayList<>(), "continue");
        verify(engine, times(1)).resume(any());

        service.cancel(job.getTaskId());
    }

    @Test
    void createChildLinksParentTaskAndStartsJob() throws Exception {
        AgentIdentity identity = AgentIdentity.builder().userId(1L).tenantId(1L).build();
        AgentSession childSession = sessionFactory.build(ChatCompletionRequest.builder().build(), identity);

        AgentJob child = service.createChild(childSession, "parent-task");

        assertThat(child.getParentTaskId()).isEqualTo("parent-task");
        assertThat(child.getSessionId()).isEqualTo(childSession.getSessionId());
        awaitTrue(() -> service.isExecutionActive(child.getTaskId()), 2000);
        service.cancel(child.getTaskId());
    }

    @Test
    void createEnforcesPerTenantConcurrentLimit() {
        properties.getRateLimit().setMaxConcurrentSessions(2);
        AgentIdentity identity = AgentIdentity.builder().userId(1L).tenantId(7L).build();
        ChatCompletionRequest request = ChatCompletionRequest.builder().build();

        service.create(request, identity);
        service.create(request, identity);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.create(request, identity))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Concurrent task limit");
    }

    /** Poll a condition with a timeout (small Awaitility stand-in). */
    private void awaitTrue(java.util.function.BooleanSupplier condition, long timeoutMs)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (!condition.getAsBoolean() && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
    }
}
