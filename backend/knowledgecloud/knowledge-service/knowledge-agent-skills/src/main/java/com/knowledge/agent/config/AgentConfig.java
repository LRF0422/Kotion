package com.knowledge.agent.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.knowledge.agent.harness.ContextManager;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.tool.ProgressiveDiscovery;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.core.cloud.http.LbRestTemplate;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.client.RestTemplate;

import java.util.List;

/**
 * Agent module configuration.
 * Wires the new harness, LLM, and tool system together.
 */
@Configuration
@EnableScheduling
@Slf4j
public class AgentConfig {

    /**
     * Jackson ObjectMapper with Java 8 time support.
     */
    @Bean
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return mapper;
    }

    /**
     * General-purpose RestTemplate for remote skill callback invocations.
     * Uses the load-balanced LbRestTemplate so that Nacos service IDs
     * (e.g., "knowledge-file-center") can be resolved automatically.
     */
    @Bean
    public RestTemplate restTemplate(LbRestTemplate lbRestTemplate) {
        // Delegate to the load-balanced RestTemplate so that
        // RemoteToolInvoker can resolve service-name-based URLs
        return lbRestTemplate;
    }

    /**
     * Register all builtin tools into the ToolRegistry.
     * Also register capability mappings for progressive discovery.
     */
    @Bean
    public ToolInitializer toolInitializer(ToolRegistry toolRegistry,
            ProgressiveDiscovery progressiveDiscovery,
            ContextManager contextManager,
            LlmClientFactory llmClientFactory,
            List<Tool> tools) {
        // Wire ContextManager with LlmClientFactory for summarize strategy
        contextManager.setLlmClientFactory(llmClientFactory);
        // SubAgent dependencies are now injected via SubAgentFactory —
        // no more static SpringContextHelper needed.
        return new ToolInitializer(toolRegistry, progressiveDiscovery, tools);
    }

    /**
     * Helper bean that registers tools on startup.
     */
    public static class ToolInitializer {

        public ToolInitializer(ToolRegistry toolRegistry,
                ProgressiveDiscovery progressiveDiscovery,
                List<Tool> tools) {
            for (Tool tool : tools) {
                toolRegistry.register(tool);
                log.info("Registered tool: {}", tool.getId());
            }

            // Register capability mappings for built-in tools
            // Note: Page-related tools (list_pages, read_page, etc.) are now remote skills
            // registered dynamically via SkillController when knowledge-wiki starts up.
            // Their capability mappings are registered automatically by SkillController.
            progressiveDiscovery.registerCapability("search", "web_search");
            progressiveDiscovery.registerCapability("web", "web_search");
            progressiveDiscovery.registerCapability("web", "web_fetch");
            progressiveDiscovery.registerCapability("dataset", "dataset_search");
            progressiveDiscovery.registerCapability("data", "dataset_search");
            progressiveDiscovery.registerCapability("data", "data_process");
            progressiveDiscovery.registerCapability("delegate", "delegate");

            log.info("Initialized {} tools with capability mappings", tools.size());
        }
    }
}
