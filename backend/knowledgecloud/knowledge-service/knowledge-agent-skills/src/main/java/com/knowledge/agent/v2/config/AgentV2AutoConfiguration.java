package com.knowledge.agent.v2.config;

import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.store.AgentStateStore;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.agent.v2.context.ContextCompactor;
import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.AgentUsageListener;
import com.knowledge.agent.v2.engine.StateHandler;
import com.knowledge.agent.v2.eventbus.AgentEventBus;
import com.knowledge.agent.v2.eventbus.ReactorEventBus;
import com.knowledge.agent.v2.handler.ActHandler;
import com.knowledge.agent.v2.handler.InitHandler;
import com.knowledge.agent.v2.handler.ObserveHandler;
import com.knowledge.agent.v2.handler.ThinkHandler;
import com.knowledge.agent.v2.interceptor.AuditInterceptor;
import com.knowledge.agent.v2.interceptor.ContextWindowInterceptor;
import com.knowledge.agent.v2.interceptor.MetricsInterceptor;
import com.knowledge.agent.v2.interceptor.PlanModeGuardInterceptor;
import com.knowledge.agent.v2.interceptor.RateLimitInterceptor;
import com.knowledge.agent.v2.interceptor.SnapshotInterceptor;
import com.knowledge.agent.v2.interceptor.TracingInterceptor;
import com.knowledge.agent.v2.llm.DefaultLlmAdapter;
import com.knowledge.agent.v2.llm.LlmAdapter;
import com.knowledge.agent.v2.llm.ResilientLlmAdapter;
import com.knowledge.agent.v2.pipeline.AgentInterceptor;
import com.knowledge.agent.v2.pipeline.InterceptorPipeline;
import com.knowledge.agent.v2.tool.BackendExecutor;
import com.knowledge.agent.v2.tool.CustomAgentResolver;
import com.knowledge.agent.v2.tool.DelegateTaskTool;
import com.knowledge.agent.v2.tool.RegistryRoutingStrategy;
import com.knowledge.agent.v2.tool.RoutingStrategy;
import com.knowledge.agent.v2.tool.SessionFrontendRoutingStrategy;
import com.knowledge.agent.v2.tool.ToolRouter;
import com.knowledge.agent.v2.state.SessionSnapshotCodec;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.*;

/**
 * Spring auto-configuration for the V2 Agent engine.
 *
 * <p>
 * Wires together all V2 components: engine, handlers, pipeline,
 * event bus, LLM adapter, and tool router. Uses conditional beans so
 * that custom implementations can override defaults.
 */
@Configuration
@EnableConfigurationProperties(AgentProperties.class)
public class AgentV2AutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public AgentEventBus agentEventBus() {
        return new ReactorEventBus();
    }

    @Bean
    @ConditionalOnMissingBean
    public InterceptorPipeline interceptorPipeline(List<AgentInterceptor> interceptors) {
        return new InterceptorPipeline(interceptors != null ? interceptors : Collections.emptyList());
    }

    @Bean
    @ConditionalOnMissingBean(LlmAdapter.class)
    public LlmAdapter llmAdapter(LlmClientFactory clientFactory, AgentProperties properties) {
        String defaultModel = properties.getLlm().getDefaultModel();
        LlmAdapter base = new DefaultLlmAdapter(clientFactory, defaultModel);
        return new ResilientLlmAdapter(base, properties.getLlm());
    }

    // ---- Interceptors (collected into the InterceptorPipeline bean above) ----

    @Bean
    @ConditionalOnMissingBean
    public ContextCompactor contextCompactor(AgentProperties properties, LlmAdapter llmAdapter) {
        return new ContextCompactor(properties.getContext(), llmAdapter);
    }

    @Bean
    @ConditionalOnMissingBean
    public ContextWindowInterceptor contextWindowInterceptor(ContextCompactor contextCompactor) {
        return new ContextWindowInterceptor(contextCompactor);
    }

    @Bean
    @ConditionalOnMissingBean
    public TracingInterceptor tracingInterceptor() {
        return new TracingInterceptor();
    }

    @Bean
    @ConditionalOnMissingBean
    public MetricsInterceptor metricsInterceptor() {
        return new MetricsInterceptor();
    }

    @Bean
    @ConditionalOnMissingBean
    public AuditInterceptor auditInterceptor() {
        return new AuditInterceptor();
    }

    @Bean
    @ConditionalOnMissingBean
    public PlanModeGuardInterceptor planModeGuardInterceptor() {
        return new PlanModeGuardInterceptor();
    }

    @Bean
    @ConditionalOnMissingBean
    public RateLimitInterceptor rateLimitInterceptor(AgentProperties properties) {
        return new RateLimitInterceptor(properties.getRateLimit());
    }

    @Bean
    @ConditionalOnMissingBean
    public SessionSnapshotCodec sessionSnapshotCodec(ObjectMapper objectMapper) {
        return new SessionSnapshotCodec(objectMapper);
    }

    @Bean
    @ConditionalOnMissingBean
    public SnapshotInterceptor snapshotInterceptor(AgentProperties properties,
            ObjectProvider<AgentStateStore> stateStoreProvider,
            SessionSnapshotCodec codec) {
        return new SnapshotInterceptor(properties.getState(),
                stateStoreProvider.getIfAvailable(), codec);
    }

    @Bean
    @ConditionalOnMissingBean
    public BackendExecutor backendExecutor(ToolRegistry toolRegistry, AgentProperties properties) {
        return new BackendExecutor(toolRegistry, properties.getTool());
    }

    /**
     * Delegation tool — runs isolated sub-agents. Uses ObjectProviders to
     * break the construction cycle (engine → handlers → tool router →
     * registry → tools → engine) and to keep working when the custom-agent
     * feature is absent.
     */
    @Bean
    @ConditionalOnMissingBean
    public DelegateTaskTool delegateTaskTool(ObjectProvider<AgentEngine> engineProvider,
            AgentEventBus eventBus,
            AgentProperties properties,
            ObjectProvider<CustomAgentResolver> resolverProvider) {
        return new DelegateTaskTool(engineProvider, eventBus, properties, resolverProvider);
    }

    @Bean
    @ConditionalOnMissingBean(name = "registryRoutingStrategy")
    public RoutingStrategy registryRoutingStrategy(ToolRegistry toolRegistry) {
        return new RegistryRoutingStrategy(toolRegistry);
    }

    @Bean
    @ConditionalOnMissingBean(name = "sessionFrontendRoutingStrategy")
    public RoutingStrategy sessionFrontendRoutingStrategy(ToolRegistry toolRegistry) {
        return new SessionFrontendRoutingStrategy(toolRegistry);
    }

    @Bean
    @ConditionalOnMissingBean
    public ToolRouter toolRouter(List<RoutingStrategy> strategies,
            BackendExecutor backendExecutor,
            AgentProperties properties) {
        return new ToolRouter(strategies, backendExecutor, properties.getTool());
    }

    @Bean
    @ConditionalOnMissingBean(name = "initHandler")
    public StateHandler initHandler() {
        return new InitHandler();
    }

    @Bean
    @ConditionalOnMissingBean(name = "thinkHandler")
    public StateHandler thinkHandler(LlmAdapter llmAdapter, ToolRegistry toolRegistry) {
        return new ThinkHandler(llmAdapter, toolRegistry);
    }

    @Bean
    @ConditionalOnMissingBean(name = "actHandler")
    public StateHandler actHandler(ToolRouter toolRouter, ToolRegistry toolRegistry,
            AgentProperties properties) {
        return new ActHandler(toolRouter, toolRegistry, properties.getContext());
    }

    @Bean
    @ConditionalOnMissingBean(name = "observeHandler")
    public StateHandler observeHandler() {
        return new ObserveHandler();
    }

    @Bean
    @ConditionalOnMissingBean
    public AgentEngine agentEngine(AgentEventBus eventBus,
            InterceptorPipeline pipeline,
            AgentProperties properties,
            StateHandler initHandler,
            StateHandler thinkHandler,
            StateHandler actHandler,
            StateHandler observeHandler,
            ObjectProvider<AgentUsageListener> usageListenerProvider) {
        Map<AgentState, StateHandler> handlers = new EnumMap<>(AgentState.class);
        handlers.put(AgentState.INIT, initHandler);
        handlers.put(AgentState.THINK, thinkHandler);
        handlers.put(AgentState.ACT, actHandler);
        handlers.put(AgentState.OBSERVE, observeHandler);

        return new AgentEngine(handlers, pipeline, eventBus, properties,
                usageListenerProvider.getIfAvailable());
    }

    // NOTE: the former OrchestratorV2 / DAGScheduler beans (Phase 3) were
    // removed — the DAG orchestrator was dead code with no handler wiring and
    // no result handoff. Multi-agent execution goes through DelegateTaskTool.
}
