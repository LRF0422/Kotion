package com.knowledge.agentcore.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AgentCore runtime configuration — the fresh, single source of truth for the
 * redesigned agent (prefix {@code agent}, replaces the deleted V2
 * {@code AgentProperties}; shares the prefix with {@code LlmClientFactory},
 * which owns {@code agent.providers / default-provider / default-model}).
 *
 * <pre>
 * agent:
 *   run:
 *     max-steps: 24
 *     max-delegate-depth: 2
 *     delegate-timeout-seconds: 600
 *     waiting-tools-timeout-seconds: 600
 *   llm:
 *     timeout-seconds: 120
 *     idle-timeout-seconds: 30
 *   tool:
 *     timeout-seconds: 180
 *     max-parallel: 5
 *   context:
 *     max-context-tokens: 60000
 *     compaction-threshold: 0.75
 *     keep-recent-messages: 8
 *     tool-result-max-chars: 8000
 *     evict-tool-results-after-steps: 3
 *   checkpoint:
 *     enabled: true
 *   event:
 *     ttl-hours: 24
 *     retention-days: 30
 *     max-events-per-run: 2000
 *   memory:
 *     enabled: true
 *     top-k: 5
 *     hot-ttl-days: 7
 *   quota:
 *     enabled: true
 *     create-per-minute: 30
 *     max-concurrent-per-tenant: 0
 *   lease:
 *     ttl-seconds: 30
 *   skill:
 *     web-search: {...}
 *     web-fetch: {...}
 * </pre>
 */
@Data
@ConfigurationProperties(prefix = "agent")
public class AgentCoreProperties {

    private Run run = new Run();
    private Llm llm = new Llm();
    private Tool tool = new Tool();
    private Context context = new Context();
    private Checkpoint checkpoint = new Checkpoint();
    private Event event = new Event();
    private Memory memory = new Memory();
    private Quota quota = new Quota();
    private Lease lease = new Lease();
    private Skill skill = new Skill();

    /** Run loop / task lifecycle settings. */
    @Data
    public static class Run {
        /** Maximum steps (LLM turns) per run before budget suspension. */
        private int maxSteps = 24;
        /** Maximum sub-agent delegation depth. */
        private int maxDelegateDepth = 2;
        /** Timeout for a delegated sub-agent run (seconds). */
        private int delegateTimeoutSeconds = 600;
        /** How long a run may wait for frontend tool results (seconds). */
        private int waitingToolsTimeoutSeconds = 600;
        /** Min interval between hot-state flushes carrying assistantText (ms). */
        private long assistantFlushIntervalMs = 1000;
    }

    /** LLM inference settings (provider endpoints live in LlmClientFactory). */
    @Data
    public static class Llm {
        /** Timeout for one LLM inference call (seconds). */
        private int timeoutSeconds = 120;
        /** Idle timeout — max silence before considering a stream dead (seconds). */
        private int idleTimeoutSeconds = 30;
        /** Temperature for planning/summarization calls (deterministic). */
        private double planningTemperature = 0.0;
    }

    /** Tool execution settings. */
    @Data
    public static class Tool {
        /** Per-tool execution timeout (seconds). */
        private int timeoutSeconds = 180;
        /** Maximum parallel backend-tool executions within one step. */
        private int maxParallel = 5;
    }

    /** Context window management. */
    @Data
    public static class Context {
        /** Hard budget for the model context window (prompt tokens). */
        private int maxContextTokens = 60000;
        /** Compaction triggers when estimated tokens exceed max * threshold. */
        private double compactionThreshold = 0.75;
        /** Number of most recent messages always kept verbatim. */
        private int keepRecentMessages = 8;
        /** Tool results longer than this (chars) are truncated. */
        private int toolResultMaxChars = 8000;
        /** Tool results older than this many steps are evicted first (L1). */
        private int evictToolResultsAfterSteps = 3;
        /** Model used for L2 summarization; empty = follow the run model. */
        private String compactionModel = "";
        /** Max output tokens for one L2 summarization call. */
        private int summaryMaxTokens = 1024;
        /** Max rendered middle-segment characters sent to the L2 summarizer. */
        private int summaryPromptMaxChars = 20000;
    }

    /** Checkpoint (断点) settings. */
    @Data
    public static class Checkpoint {
        /** Whether checkpoints are persisted (recovery requires this). */
        private boolean enabled = true;
    }

    /** Event log settings. */
    @Data
    public static class Event {
        /** Redis hot-tier event TTL (hours). */
        private long ttlHours = 24;
        /** MySQL cold-tier retention (days; 0 = keep forever). */
        private int retentionDays = 30;
        /** Safety cap on events per run (oldest hot events trimmed). */
        private int maxEventsPerRun = 2000;
    }

    /** Long-term memory settings. */
    @Data
    public static class Memory {
        /** Whether the memory subsystem is enabled. */
        private boolean enabled = true;
        /** Top-k long-term memories injected at run start. */
        private int topK = 5;
        /** Redis hot-tier memory TTL (days). */
        private long hotTtlDays = 7;
    }

    /** Tenant quota settings. */
    @Data
    public static class Quota {
        /** Whether quotas are enforced. */
        private boolean enabled = true;
        /** Max run creations per minute per tenant (sliding window). */
        private int createPerMinute = 30;
        /** Max concurrent active runs per tenant. 0 = unlimited. */
        private int maxConcurrentPerTenant = 0;
    }

    /** Distributed run lease (multi-instance fencing). */
    @Data
    public static class Lease {
        /** Lease TTL (seconds); renewed every step. */
        private int ttlSeconds = 30;
    }

    /** Builtin web tools configuration. */
    @Data
    public static class Skill {
        private WebSearch webSearch = new WebSearch();
        private WebFetch webFetch = new WebFetch();

        @Data
        public static class WebSearch {
            private boolean enabled = true;
            private String provider = "tavily";
            private String apiUrl = "https://api.tavily.com/search";
            private String apiKey = "";
            private int timeoutSeconds = 10;
            private int defaultMaxResults = 5;
            private int maxResultsLimit = 20;
        }

        @Data
        public static class WebFetch {
            private int timeoutSeconds = 15;
            private int maxContentLength = 50000;
        }
    }
}
