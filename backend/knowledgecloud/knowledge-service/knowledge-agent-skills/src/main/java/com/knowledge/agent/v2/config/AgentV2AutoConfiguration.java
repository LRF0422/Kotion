package com.knowledge.agent.v2.config;

import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.agent.v2.controller.AgentV2Controller;
import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.StateHandler;
import com.knowledge.agent.v2.eventbus.AgentEventBus;
import com.knowledge.agent.v2.eventbus.ReactorEventBus;
import com.knowledge.agent.v2.handler.ActHandler;
import com.knowledge.agent.v2.handler.InitHandler;
import com.knowledge.agent.v2.handler.ObserveHandler;
import com.knowledge.agent.v2.handler.ThinkHandler;
import com.knowledge.agent.v2.llm.DefaultLlmAdapter;
import com.knowledge.agent.v2.llm.LlmAdapter;
import com.knowledge.agent.v2.llm.ResilientLlmAdapter;
import com.knowledge.agent.v2.pipeline.AgentInterceptor;
import com.knowledge.agent.v2.pipeline.InterceptorPipeline;
import com.knowledge.agent.v2.orchestrator.DAGScheduler;
import com.knowledge.agent.v2.orchestrator.OrchestratorV2;
import com.knowledge.agent.v2.tool.BackendExecutor;
import com.knowledge.agent.v2.tool.RegistryRoutingStrategy;
import com.knowledge.agent.v2.tool.RoutingStrategy;
import com.knowledge.agent.v2.tool.SessionFrontendRoutingStrategy;
import com.knowledge.agent.v2.tool.ToolRouter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.*;

/**
 * Spring auto-configuration for the V2 Agent engine.
 *
 * <p>Wires together all V2 components: engine, handlers, pipeline,
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

    @Bean
    @ConditionalOnMissingBean
    public BackendExecutor backendExecutor(ToolRegistry toolRegistry, AgentProperties properties) {
        return new BackendExecutor(toolRegistry, properties.getTool());
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
    public StateHandler actHandler(ToolRouter toolRouter) {
        return new ActHandler(toolRouter);
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
                                   StateHandler observeHandler) {
        Map<AgentState, StateHandler> handlers = new EnumMap<>(AgentState.class);
        handlers.put(AgentState.INIT, initHandler);
        handlers.put(AgentState.THINK, thinkHandler);
        handlers.put(AgentState.ACT, actHandler);
        handlers.put(AgentState.OBSERVE, observeHandler);

        return new AgentEngine(handlers, pipeline, eventBus, properties);
    }

    @Bean
    @ConditionalOnMissingBean
    public AgentV2Controller agentV2Controller(AgentEngine agentEngine,
                                               AgentProperties properties) {
        return new AgentV2Controller(agentEngine, properties);
    }

    // ---- Orchestrator V2 (Phase 3) ----

    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(prefix = "agent.orchestrator", name = "enabled", havingValue = "true")
    public DAGScheduler dagScheduler(AgentEngine agentEngine) {
        return new DAGScheduler(agentEngine);
    }

    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(prefix = "agent.orchestrator", name = "enabled", havingValue = "true")
    public OrchestratorV2 orchestratorV2(DAGScheduler dagScheduler,
                                          LlmAdapter llmAdapter,
                                          AgentEventBus eventBus,
                                          AgentProperties properties) {
        return new OrchestratorV2(dagScheduler, llmAdapter, eventBus, properties.getOrchestrator());
    }
}
