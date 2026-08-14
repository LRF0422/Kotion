package com.knowledge.agent.v2.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Unified configuration properties for the Agent V2 engine.
 *
 * <p>
 * Replaces the scattered {@code @Value} annotations found throughout the V1
 * codebase. All agent-related configuration is centralized here under the
 * {@code agent} prefix.
 *
 * <p>
 * Example {@code application.yml}:
 * 
 * <pre>
 * agent:
 *   engine:
 *     max-iterations: 20
 *     streaming-enabled: true
 *   llm:
 *     default-model: gpt-4
 *     timeout-seconds: 120
 *     max-retries: 3
 *   tool:
 *     timeout-seconds: 180
 *     max-parallel: 5
 *   orchestrator:
 *     enabled: false
 *     fast-path-message-length: 200
 *   context:
 *     max-context-tokens: 60000
 *     compaction-threshold: 0.75
 *     keep-recent-messages: 8
 *     tool-result-max-chars: 8000
 *     evict-tool-results-after-iterations: 3
 *   state:
 *     backend: jdbc
 *     snapshot-interval: 5
 *   rate-limit:
 *     enabled: true
 *     requests-per-minute: 60
 *   event-store:
 *     enabled: true
 *     max-events: 2000
 *     ttl-hours: 24
 * </pre>
 */
@Data
@ConfigurationProperties(prefix = "agent")
public class AgentProperties {

    private EngineConfig engine = new EngineConfig();
    private LlmConfig llm = new LlmConfig();
    private ToolConfig tool = new ToolConfig();
    private OrchestratorConfig orchestrator = new OrchestratorConfig();
    private ContextConfig context = new ContextConfig();
    private StateConfig state = new StateConfig();
    private RateLimitConfig rateLimit = new RateLimitConfig();
    private EventStoreConfig eventStore = new EventStoreConfig();

    @Data
    public static class EngineConfig {
        /** Maximum iterations per agent run (safety limit). */
        private int maxIterations = 20;
        /** Whether to use token-level streaming (vs buffered). */
        private boolean streamingEnabled = true;
        /** Maximum delegate depth for sub-agents. */
        private int maxDelegateDepth = 3;
        /** Timeout for a delegated sub-agent run (seconds). */
        private int delegateTimeoutSeconds = 600;
    }

    @Data
    public static class LlmConfig {
        /** Default model name when not specified in request. */
        private String defaultModel;
        /** Timeout for LLM inference calls (seconds). */
        private int timeoutSeconds = 120;
        /** Maximum retry attempts for transient LLM failures. */
        private int maxRetries = 3;
        /** Idle timeout — max silence before considering the stream dead (seconds). */
        private int idleTimeoutSeconds = 30;
        /** Temperature for planning calls (lower = more deterministic). */
        private double planningTemperature = 0.0;
    }

    @Data
    public static class ToolConfig {
        /** Per-tool execution timeout (seconds). */
        private int timeoutSeconds = 180;
        /** Maximum number of parallel tool executions within one iteration. */
        private int maxParallel = 5;
        /** Comma-separated tool names always treated as read-only in PLAN mode. */
        private String planReadOnlyTools = "";
    }

    @Data
    public static class OrchestratorConfig {
        /** Whether multi-agent orchestration is enabled. */
        private boolean enabled = false;
        /** Messages shorter than this bypass LLM planning (fast-path). */
        private int fastPathMessageLength = 200;
        /** Maximum agents in a team plan. */
        private int maxAgents = 5;
    }

    @Data
    public static class ContextConfig {
        /** Hard budget for the model context window (prompt tokens). */
        private int maxContextTokens = 60000;
        /**
         * Compaction triggers when lastPromptTokens exceeds maxContextTokens *
         * threshold.
         */
        private double compactionThreshold = 0.75;
        /** Number of most recent messages always kept verbatim during compaction. */
        private int keepRecentMessages = 8;
        /**
         * Tool results longer than this (chars) are truncated when appended to context.
         */
        private int toolResultMaxChars = 8000;
        /** Tool results older than this many iterations are evicted first (L1). */
        private int evictToolResultsAfterIterations = 3;
    }

    @Data
    public static class StateConfig {
        /** Persistence backend: "jdbc" or "none". */
        private String backend = "none";
        /** Snapshot every N iterations (in addition to tool-call boundaries). */
        private int snapshotInterval = 5;
    }

    @Data
    public static class RateLimitConfig {
        /** Whether rate limiting is enabled. */
        private boolean enabled = true;
        /** Maximum requests per minute per tenant. */
        private int requestsPerMinute = 60;
        /** Maximum concurrent sessions per tenant. */
        private int maxConcurrentSessions = 10;
        /** Maximum task creations per minute per tenant. */
        private int taskCreatePerMinute = 30;
    }

    @Data
    public static class EventStoreConfig {
        /** Whether event persistence is enabled. */
        private boolean enabled = true;
        /** Maximum events per conversation (ring buffer). */
        private int maxEvents = 2000;
        /** Event TTL in hours. */
        private long ttlHours = 24;
        /** Cold-tier (agent_task_event) retention in days. */
        private int eventRetentionDays = 30;
    }
}
