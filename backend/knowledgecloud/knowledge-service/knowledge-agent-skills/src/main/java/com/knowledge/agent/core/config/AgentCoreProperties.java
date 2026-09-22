package com.knowledge.agent.core.config;

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
 *     max-steps: 100
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
 *     keep-recent-messages: 16
 *     tool-result-max-chars: 12000
 *     evict-tool-results-after-steps: 10
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
 *   saved-skills:
 *     enabled: true
 *     top-k: 3
 *     min-score: 0.30
 *     merge-score: 0.55
 *   remote-skill:
 *     enabled: true
 *     stale-ms: 90000
 *     call-timeout-seconds: 30
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
    private SavedSkills savedSkills = new SavedSkills();
    private RemoteSkill remoteSkill = new RemoteSkill();
    private Quota quota = new Quota();
    private Lease lease = new Lease();
    private Skill skill = new Skill();

    /** Run loop / task lifecycle settings. */
    @Data
    public static class Run {
        /** Maximum steps (LLM turns) per run before budget suspension. */
        private int maxSteps = 100;
        /** Maximum sub-agent delegation depth. */
        private int maxDelegateDepth = 2;
        /** Maximum child runs a single parent may create (0 = unlimited). */
        private int maxChildrenPerRun = 16;
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
        private int keepRecentMessages = 16;
        /** Tool results longer than this (chars) are truncated. */
        private int toolResultMaxChars = 12000;
        /**
         * Tool results older than this many steps are evicted first (L1).
         * Must stay comfortably above the number of read steps a single task
         * needs, or the model loses earlier reads and re-reads in a loop.
         */
        private int evictToolResultsAfterSteps = 10;
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
        /**
         * Rows per cold-tier mirror INSERT. A streaming run emits one event per
         * token, so batching turns one round trip per token into one per batch.
         * Kept modest because a tool.completed payload can be large.
         */
        private int mirrorBatchSize = 100;
        /** Max time an event may sit in the mirror queue before a flush (ms). */
        private long mirrorFlushIntervalMs = 200;
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

    /** Conversation-derived personal skill settings. */
    @Data
    public static class SavedSkills {
        /** Whether saved-skill creation and automatic retrieval are enabled. */
        private boolean enabled = true;
        /** Maximum saved skills injected into one root run. */
        private int topK = 3;
        /** Minimum deterministic relevance score (0-1). */
        private double minScore = 0.30;
        /**
         * Continuous update: a trusted save request whose best-matching
         * enabled skill scores at least this value merges into that skill
         * (version + 1) instead of creating a duplicate. 1.0 disables merging.
         */
        private double mergeScore = 0.55;
        /** Maximum enabled rows scored for one run. */
        private int candidateLimit = 100;
        /** Maximum saved skills owned by one tenant/user pair. */
        private int maxSkillsPerUser = 100;
        /** Maximum canonical transcript characters sent to the compiler. */
        private int maxTranscriptChars = 24000;
        /** Maximum visible characters retained from one conversation message. */
        private int maxMessageChars = 4000;
        /** Maximum characters retained from one tool result. */
        private int maxToolOutputChars = 1500;
        /** Maximum characters in one generated skill prompt fragment. */
        private int maxFragmentChars = 4000;
        /** Maximum total saved-skill prompt characters injected into a run. */
        private int maxPromptChars = 6000;
        /** Maximum required and optional tool names stored in one skill. */
        private int maxToolNamesPerSkill = 16;
        /** Maximum compiler response tokens. */
        private int compileMaxTokens = 1200;
        /** Optional compiler model override; empty follows the source run model. */
        private String compileModel = "";
    }

    /** Remote (microservice-registered) skill settings. */
    @Data
    public static class RemoteSkill {
        /** Whether remote skills are registered/exposed to the model at all. */
        private boolean enabled = true;
        /**
         * A registering microservice is considered dead after this many
         * milliseconds without a heartbeat and its tools are pruned.
         */
        private long staleMs = 90_000;
        /** Timeout for one remote skill HTTP invocation (seconds). */
        private int callTimeoutSeconds = 30;
        /** Periodic “registered N remote skill(s)” debug log interval (minutes). */
        private int statsLogMinutes = 10;
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
