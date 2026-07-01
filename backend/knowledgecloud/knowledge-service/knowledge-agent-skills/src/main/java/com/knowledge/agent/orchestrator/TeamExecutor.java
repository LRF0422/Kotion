package com.knowledge.agent.orchestrator;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.channel.AgentChannel;
import com.knowledge.agent.channel.AgentMessage;
import com.knowledge.agent.channel.ChannelHub;
import com.knowledge.agent.core.engine.StreamEvent;
import com.knowledge.agent.core.engine.SubAgentEvent;
import com.knowledge.agent.harness.SubAgent;
import com.knowledge.agent.harness.SubAgentFactory;
import com.knowledge.agent.llm.LlmClient;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmRequest;
import com.knowledge.agent.llm.StreamChunk;
import com.knowledge.agent.tool.ProgressiveDiscovery;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import com.knowledge.agent.store.AgentStateSnapshot;
import com.knowledge.agent.store.AgentStateStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Executes an {@link AgentTeamPlan} by creating one {@link SubAgent} per
 * {@link AgentSpec} and running them according to the
 * {@link OrchestrationStrategy}.
 *
 * <p>
 * This class reuses the proven patterns from {@code DelegateTool}:
 * <ul>
 * <li>{@link SubAgentFactory#create} for sub-agent construction (with
 *     custom system prompts from the plan)</li>
 * <li>{@link AgentChannel} for inter-agent coordination</li>
 * <li>{@code Flux.flatMap} with bounded concurrency for PARALLEL execution</li>
 * <li>{@code Flux.concat} for SEQUENTIAL execution (respecting dependencies)</li>
 * <li>{@link SubAgentEvent} wrapper for preserving inner event types</li>
 * <li>{@link ConcurrentHashMap} for thread-safe result aggregation</li>
 * <li>Per-agent timeout via {@code Flux.timeout}</li>
 * </ul>
 *
 * <p>
 * After all agents complete, if the plan has a {@code synthesisPrompt}, a
 * final LLM call combines the sub-agent outputs into a single coherent
 * response, streamed as text-delta events.
 */
@Slf4j
@Component
public class TeamExecutor {

    private final SubAgentFactory subAgentFactory;
    private final ProgressiveDiscovery progressiveDiscovery;
    private final ChannelHub channelHub;
    private final ObjectMapper objectMapper;
    private final LlmClientFactory llmClientFactory;
    private final AgentStateStore stateStore;

    @Value("${agent.delegate.max-parallel:3}")
    private int maxParallel;

    @Value("${agent.delegate.timeout-per-subagent:120}")
    private int timeoutPerSubagentSeconds;

    public TeamExecutor(SubAgentFactory subAgentFactory,
            ProgressiveDiscovery progressiveDiscovery,
            ChannelHub channelHub,
            ObjectMapper objectMapper,
            LlmClientFactory llmClientFactory,
            @Autowired(required = false) AgentStateStore stateStore) {
        this.subAgentFactory = subAgentFactory;
        this.progressiveDiscovery = progressiveDiscovery;
        this.channelHub = channelHub;
        this.objectMapper = objectMapper;
        this.llmClientFactory = llmClientFactory;
        this.stateStore = stateStore;
    }

    /**
     * Execute the team plan, returning a Flux of StreamEvents.
     *
     * <p>
     * The Flux emits:
     * <ol>
     * <li>{@code delegate_start} — plan summary</li>
     * <li>{@code subagent_spawned} — one per agent</li>
     * <li>Sub-agent events (wrapped in {@link SubAgentEvent}) — text,
     *     tool calls, status, finish</li>
     * <li>Synthesis text-delta events (if {@code synthesisPrompt} present)</li>
     * <li>{@code ToolResultEvent} — aggregated result</li>
     * </ol>
     *
     * @param plan     the team plan (must not be single-agent)
     * @param messages the original conversation messages
     * @param context  the tool execution context
     * @return Flux of StreamEvents ending with a ToolResultEvent
     */
    public Flux<StreamEvent> execute(AgentTeamPlan plan,
            List<ChatMessage> messages,
            ToolContext context) {
        return Flux.defer(() -> {
            try {
                List<AgentSpec> agents = plan.getAgents();
                if (agents == null || agents.isEmpty()) {
                    return Flux.just(StreamEvent.ToolResultEvent.builder()
                            .toolCallId("orchestrate-empty")
                            .result(ToolResult.error("Empty agent team"))
                            .build());
                }

                final String parentAgentId = context.getAgentId();
                final int childDepth = context.getDelegateDepth() + 1;

                // 1. Create coordination channel
                String channelId = context.getSessionId()
                        + "-orchestrate-" + System.currentTimeMillis();
                AgentChannel channel = channelHub.create(channelId);

                // 2. Build sub-agent descriptors
                List<TeamAgentDescriptor> descriptors = new ArrayList<>();
                for (AgentSpec spec : agents) {
                    // Resolve requiredSkillNames to tool IDs
                    Set<String> resolvedToolIds = new LinkedHashSet<>();
                    if (spec.getRequiredSkillNames() != null) {
                        resolvedToolIds.addAll(
                                progressiveDiscovery.resolve(spec.getRequiredSkillNames()));
                    }
                    // Always include delegate tool so sub-agents can further delegate
                    resolvedToolIds.add("delegate");

                    // Create child context
                    ToolContext childContext = context.incrementDepth();
                    childContext.setAgentId(spec.getAgentId());

                    SubAgent subAgent = subAgentFactory.create(
                            spec.getAgentId(),
                            spec.getDescription(),
                            resolvedToolIds,
                            channel,
                            childContext,
                            spec.getSystemPrompt());

                    descriptors.add(new TeamAgentDescriptor(
                            spec, new ArrayList<>(resolvedToolIds), subAgent, childContext));
                }

                // 3. Emit init events (delegate_start + subagent_spawned)
                List<StreamEvent> initEvents = new ArrayList<>();

                // delegate_start
                Map<String, Object> startData = new LinkedHashMap<>();
                startData.put("type", "delegate_start");
                startData.put("subTaskCount", String.valueOf(descriptors.size()));
                startData.put("parentAgentId", parentAgentId);
                startData.put("depth", childDepth);
                startData.put("strategy", plan.getStrategy().name());
                List<Map<String, String>> agentInfo = new ArrayList<>();
                for (TeamAgentDescriptor desc : descriptors) {
                    Map<String, String> info = new LinkedHashMap<>();
                    info.put("id", desc.spec.getAgentId());
                    info.put("name", desc.spec.getName());
                    info.put("description", desc.spec.getDescription());
                    agentInfo.add(info);
                }
                startData.put("subTasks", agentInfo.toString());
                initEvents.add(StreamEvent.DataEvent.builder()
                        .data(Collections.singletonList(startData))
                        .build());

                // subagent_spawned
                for (TeamAgentDescriptor desc : descriptors) {
                    initEvents.add(dataEvent("subagent_spawned",
                            "agentId", desc.spec.getAgentId(),
                            "agentName", desc.spec.getName(),
                            "parentAgentId", parentAgentId,
                            "depth", childDepth,
                            "task", desc.spec.getDescription(),
                            "capabilities", desc.resolvedToolIds));
                }

                // 4. Run agents according to strategy
                ConcurrentHashMap<String, AgentResultEntry> resultEntries =
                        new ConcurrentHashMap<>();
                Duration timeout = Duration.ofSeconds(timeoutPerSubagentSeconds);

                // Fix 1: Save initial snapshot before executing the plan
                saveTeamSnapshot(context, messages, plan, 0);

                Flux<StreamEvent> agentEventsFlux;
                switch (plan.getStrategy()) {
                    case SEQUENTIAL:
                        agentEventsFlux = runSequential(descriptors, resultEntries,
                                timeout, parentAgentId, childDepth, channel,
                                context, messages, plan);
                        break;
                    case HYBRID:
                        agentEventsFlux = runHybrid(descriptors, resultEntries,
                                timeout, parentAgentId, childDepth, channel,
                                context, messages, plan);
                        break;
                    case PARALLEL:
                    default:
                        agentEventsFlux = runParallel(descriptors, resultEntries,
                                timeout, parentAgentId, childDepth, channel,
                                context, messages, plan);
                        break;
                }

                // 5. After agents: synthesis (if prompt present) + aggregated result
                Flux<StreamEvent> resultFlux = agentEventsFlux
                        .concatWith(Flux.defer(() -> {
                            // Synthesis LLM call if prompt is present
                            if (plan.getSynthesisPrompt() != null
                                    && !plan.getSynthesisPrompt().isEmpty()) {
                                return runSynthesis(plan, descriptors, resultEntries,
                                        messages, parentAgentId, childDepth);
                            }
                            return Flux.empty();
                        }))
                        .concatWith(Mono.fromCallable(() ->
                                buildAggregatedResult(descriptors, resultEntries)))
                        .doFinally(signal -> channelHub.remove(channelId));

                return Flux.concat(
                        Flux.fromIterable(initEvents),
                        resultFlux);

            } catch (Exception e) {
                log.error("TeamExecutor error", e);
                return Flux.just(
                        StreamEvent.ErrorEvent.builder().error(e.getMessage()).build(),
                        StreamEvent.ToolResultEvent.builder()
                                .toolCallId("orchestrate-error")
                                .result(ToolResult.error(e.getMessage()))
                                .build());
            }
        });
    }

    // ---- Execution strategies ----

    /**
     * Run all agents in parallel with bounded concurrency.
     * Mirrors {@code DelegateTool}'s {@code Flux.flatMap(flux, maxParallel)}.
     */
    private Flux<StreamEvent> runParallel(List<TeamAgentDescriptor> descriptors,
            ConcurrentHashMap<String, AgentResultEntry> resultEntries,
            Duration timeout, String parentAgentId, int childDepth,
            AgentChannel channel,
            ToolContext context, List<ChatMessage> messages, AgentTeamPlan plan) {

        List<Flux<StreamEvent>> fluxes = new ArrayList<>();
        for (TeamAgentDescriptor desc : descriptors) {
            fluxes.add(buildAgentFlux(desc, resultEntries, timeout,
                    parentAgentId, childDepth, channel,
                    context, messages, plan, null));
        }

        return Flux.fromIterable(fluxes)
                .flatMap(flux -> flux, maxParallel);
    }

    /**
     * Run agents sequentially in dependency order.
     * Uses {@code Flux.concat} so each agent starts only after the
     * previous one completes.
     */
    private Flux<StreamEvent> runSequential(List<TeamAgentDescriptor> descriptors,
            ConcurrentHashMap<String, AgentResultEntry> resultEntries,
            Duration timeout, String parentAgentId, int childDepth,
            AgentChannel channel,
            ToolContext context, List<ChatMessage> messages, AgentTeamPlan plan) {

        // Sort by dependencies (topological order)
        List<TeamAgentDescriptor> ordered = topologicalSort(descriptors);

        // Fix 4: Track completed outputs for dependent agents
        ConcurrentHashMap<String, String> completedOutputs = new ConcurrentHashMap<>();

        return Flux.fromIterable(ordered)
                .concatMap(desc -> buildAgentFlux(desc, resultEntries, timeout,
                        parentAgentId, childDepth, channel,
                        context, messages, plan, completedOutputs));
    }

    /**
     * Run agents in a hybrid mode: topologically sort agents into dependency
     * levels, run each level in parallel, and levels sequentially.
     */
    private Flux<StreamEvent> runHybrid(List<TeamAgentDescriptor> descriptors,
            ConcurrentHashMap<String, AgentResultEntry> resultEntries,
            Duration timeout, String parentAgentId, int childDepth,
            AgentChannel channel,
            ToolContext context, List<ChatMessage> messages, AgentTeamPlan plan) {

        // Compute dependency levels
        List<List<TeamAgentDescriptor>> levels = computeDependencyLevels(descriptors);

        // Fix 4: Track completed outputs for dependent agents
        ConcurrentHashMap<String, String> completedOutputs = new ConcurrentHashMap<>();

        // Build a Flux that runs each level in parallel, levels sequentially
        Flux<StreamEvent> result = Flux.empty();
        for (List<TeamAgentDescriptor> level : levels) {
            List<Flux<StreamEvent>> levelFluxes = new ArrayList<>();
            for (TeamAgentDescriptor desc : level) {
                levelFluxes.add(buildAgentFlux(desc, resultEntries, timeout,
                        parentAgentId, childDepth, channel,
                        context, messages, plan, completedOutputs));
            }
            // Run this level in parallel
            Flux<StreamEvent> levelFlux = Flux.fromIterable(levelFluxes)
                    .flatMap(flux -> flux, maxParallel);
            result = result.concatWith(levelFlux);
        }
        return result;
    }

    // ---- Per-agent Flux builder ----

    /**
     * Build the Flux for a single sub-agent, wrapping events with
     * {@link SubAgentEvent}, applying timeout, capturing final output,
     * and emitting lifecycle events.
     *
     * This mirrors the pattern in {@code DelegateTool.executeAsync()}.
     */
    private Flux<StreamEvent> buildAgentFlux(TeamAgentDescriptor desc,
            ConcurrentHashMap<String, AgentResultEntry> resultEntries,
            Duration timeout, String parentAgentId, int childDepth,
            AgentChannel channel,
            ToolContext context, List<ChatMessage> messages, AgentTeamPlan plan,
            Map<String, String> completedOutputs) {

        final AgentSpec spec = desc.spec;
        final String agentId = spec.getAgentId();
        final String agentName = spec.getName();

        // Use Flux.defer so that SubAgent (re)creation happens at subscription
        // time, not at buildAgentFlux call time. This ensures completedOutputs
        // is populated with predecessor results before dependent agents read it.
        return Flux.defer(() -> {
            // Fix 4: If in sequential/hybrid mode and this agent has dependencies
            // with completed outputs, create a new SubAgent with an enriched
            // description that includes the predecessors' results.
            SubAgent subAgent = desc.subAgent;
            if (completedOutputs != null && spec.getDependencies() != null
                    && !spec.getDependencies().isEmpty()) {
                StringBuilder enrichedDesc = new StringBuilder(spec.getDescription());
                boolean hasDepOutput = false;
                for (String depId : spec.getDependencies()) {
                    String depOutput = completedOutputs.get(depId);
                    if (depOutput != null && !depOutput.isEmpty()) {
                        if (!hasDepOutput) {
                            enrichedDesc.append("\n\n=== Context from predecessor agents ===");
                            hasDepOutput = true;
                        }
                        enrichedDesc.append("\n\nOutput from agent '")
                                .append(depId).append("':\n").append(depOutput);
                    }
                }
                if (hasDepOutput) {
                    subAgent = subAgentFactory.create(
                            spec.getAgentId(),
                            enrichedDesc.toString(),
                            new LinkedHashSet<>(desc.resolvedToolIds),
                            channel,
                            desc.childContext,
                            spec.getSystemPrompt());
                }
            }

            final SubAgent finalSubAgent = subAgent;

            return finalSubAgent.run()
                    .timeout(timeout)
                    .map(event -> (StreamEvent) SubAgentEvent.of(
                            agentId, parentAgentId, childDepth, event))
                    .startWith(dataEvent("subagent_status",
                            "agentId", agentId,
                            "agentName", agentName,
                            "parentAgentId", parentAgentId,
                            "depth", childDepth,
                            "status", "running"))
                    .doOnComplete(() -> {
                        String output = finalSubAgent.getFinalOutput();
                        resultEntries.put(agentId, new AgentResultEntry(
                                agentId, true, output));
                        if (completedOutputs != null) {
                            completedOutputs.put(agentId, output);
                        }
                        channel.post(AgentMessage.result(agentId, "Sub-agent completed"));
                        // Fix 1: Save snapshot after sub-agent completes
                        saveTeamSnapshot(context, messages, plan, resultEntries.size());
                    })
                    .doOnError(e -> {
                        log.error("TeamExecutor: agent {} errored: {}", agentId, e.getMessage());
                        String errorMsg = "Error: " + e.getMessage();
                        resultEntries.put(agentId, new AgentResultEntry(
                                agentId, false, errorMsg));
                        if (completedOutputs != null) {
                            completedOutputs.put(agentId, errorMsg);
                        }
                        channel.post(AgentMessage.result(agentId, errorMsg));
                        // Fix 1: Save snapshot after sub-agent errors
                        saveTeamSnapshot(context, messages, plan, resultEntries.size());
                    })
                    .onErrorResume(e -> Flux.just(
                            dataEvent("subagent_status",
                                    "agentId", agentId,
                                    "agentName", agentName,
                                    "parentAgentId", parentAgentId,
                                    "depth", childDepth,
                                    "status", "error",
                                    "detail", e.getMessage()),
                            SubAgentEvent.of(agentId, parentAgentId, childDepth,
                                    StreamEvent.ErrorEvent.builder()
                                            .error("Sub-agent " + agentId
                                                    + " error: " + e.getMessage())
                                            .build())))
                    .concatWith(Flux.defer(() -> {
                        AgentResultEntry entry = resultEntries.get(agentId);
                        boolean ok = entry == null || entry.success;
                        return Flux.just(dataEvent("subagent_finish",
                                "agentId", agentId,
                                "agentName", agentName,
                                "parentAgentId", parentAgentId,
                                "depth", childDepth,
                                "status", ok ? "completed" : "error"));
                    }))
                    .subscribeOn(Schedulers.boundedElastic());
        });
    }

    // ---- Synthesis ----

    /**
     * Make a final synthesis LLM call that combines the sub-agent outputs
     * into a single coherent response, streamed as text-delta events.
     */
    private Flux<StreamEvent> runSynthesis(AgentTeamPlan plan,
            List<TeamAgentDescriptor> descriptors,
            ConcurrentHashMap<String, AgentResultEntry> resultEntries,
            List<ChatMessage> messages,
            String parentAgentId,
            int childDepth) {

        try {
            // Build the synthesis context from sub-agent outputs
            StringBuilder context = new StringBuilder();
            for (TeamAgentDescriptor desc : descriptors) {
                AgentResultEntry entry = resultEntries.get(desc.spec.getAgentId());
                String output = entry != null ? entry.finalOutput : "(no output)";
                context.append("## ").append(desc.spec.getName())
                        .append(" (").append(desc.spec.getAgentId()).append(")\n")
                        .append(output);
                if (!output.endsWith("\n")) {
                    context.append("\n");
                }
                context.append("\n");
            }

            // Fix 3: Extract the actual user task from the conversation messages
            String userTask = "Original user task (see conversation history).";
            if (messages != null) {
                for (int i = messages.size() - 1; i >= 0; i--) {
                    ChatMessage msg = messages.get(i);
                    if ("user".equals(msg.getRole())
                            && msg.getContent() != null
                            && !msg.getContent().isEmpty()) {
                        userTask = msg.getContent();
                        break;
                    }
                }
            }

            // Build synthesis messages
            List<ChatMessage> synthesisMessages = new ArrayList<>();
            synthesisMessages.add(ChatMessage.builder()
                    .role("system")
                    .content(plan.getSynthesisPrompt())
                    .build());
            synthesisMessages.add(ChatMessage.builder()
                    .role("user")
                    .content("User task: " + userTask + "\n\n"
                            + "Sub-agent results:\n\n" + context)
                    .build());

            // Determine model from the original messages context
            // Use streaming for text-delta events
            LlmRequest request = LlmRequest.builder()
                    .model(null) // use default model
                    .temperature(0.3)
                    .maxTokens(2048)
                    .messages(synthesisMessages)
                    .toolChoice("none")
                    .stream(true)
                    .build();

            LlmClient client = llmClientFactory.getClient();

            // Emit a synthesis start marker, then stream content
            Flux<StreamEvent> startMarker = Flux.just(dataEvent("synthesis_start",
                    "parentAgentId", parentAgentId,
                    "depth", childDepth));

            Flux<StreamEvent> synthesisStream = client.streamChat(request)
                    .filter(chunk -> "content".equals(chunk.getType())
                            && chunk.getContent() != null
                            && !chunk.getContent().isEmpty())
                    .map(chunk -> (StreamEvent) StreamEvent.TextEvent.builder()
                            .content(chunk.getContent())
                            .build())
                    .onErrorResume(e -> {
                        log.warn("TeamExecutor: synthesis stream error: {}", e.getMessage());
                        return Flux.just(StreamEvent.TextEvent.builder()
                                .content("\n\n[Synthesis error: " + e.getMessage() + "]")
                                .build());
                    });

            Flux<StreamEvent> endMarker = Flux.just(dataEvent("synthesis_finish",
                    "parentAgentId", parentAgentId,
                    "depth", childDepth));

            return startMarker.concatWith(synthesisStream).concatWith(endMarker);

        } catch (Exception e) {
            log.warn("TeamExecutor: synthesis failed: {}", e.getMessage());
            return Flux.empty();
        }
    }

    // ---- Result aggregation ----

    private StreamEvent buildAggregatedResult(List<TeamAgentDescriptor> descriptors,
            ConcurrentHashMap<String, AgentResultEntry> resultEntries) {

        StringBuilder summary = new StringBuilder();
        boolean hasErrors = false;

        for (TeamAgentDescriptor desc : descriptors) {
            AgentResultEntry entry = resultEntries.get(desc.spec.getAgentId());
            if (entry == null) {
                summary.append("[").append(desc.spec.getName()).append("] (no result)\n");
                hasErrors = true;
                continue;
            }
            if (!entry.success) {
                hasErrors = true;
            }
            String output = entry.finalOutput;
            if (output != null && !output.isEmpty()) {
                summary.append("[").append(desc.spec.getName()).append("] ").append(output);
                if (!output.endsWith("\n")) {
                    summary.append("\n");
                }
            } else {
                summary.append("[").append(desc.spec.getName()).append("] (no output)\n");
            }
        }

        String resultMessage = hasErrors
                ? "Team execution completed with errors\n\n" + summary
                : "All team agents completed successfully\n\n" + summary;

        return StreamEvent.ToolResultEvent.builder()
                .toolCallId("orchestrate")
                .result(ToolResult.success(resultMessage))
                .build();
    }

    // ---- Dependency resolution ----

    /**
     * Topologically sort agents by their dependencies.
     * Agents with no dependencies come first; an agent only appears after
     * all its dependencies.
     */
    private List<TeamAgentDescriptor> topologicalSort(List<TeamAgentDescriptor> descriptors) {
        Map<String, TeamAgentDescriptor> byId = descriptors.stream()
                .collect(Collectors.toMap(d -> d.spec.getAgentId(), d -> d,
                        (a, b) -> a, LinkedHashMap::new));

        Set<String> visited = new LinkedHashSet<>();
        List<TeamAgentDescriptor> result = new ArrayList<>();

        for (TeamAgentDescriptor desc : descriptors) {
            topoVisit(desc, byId, visited, result);
        }
        return result;
    }

    private void topoVisit(TeamAgentDescriptor desc,
            Map<String, TeamAgentDescriptor> byId,
            Set<String> visited,
            List<TeamAgentDescriptor> result) {
        if (visited.contains(desc.spec.getAgentId())) {
            return;
        }
        visited.add(desc.spec.getAgentId());

        if (desc.spec.getDependencies() != null) {
            for (String depId : desc.spec.getDependencies()) {
                TeamAgentDescriptor dep = byId.get(depId);
                if (dep != null) {
                    topoVisit(dep, byId, visited, result);
                }
            }
        }
        result.add(desc);
    }

    /**
     * Compute dependency levels for HYBRID execution.
     * Level 0 = agents with no dependencies. Level N = agents whose
     * dependencies are all in levels 0..N-1.
     */
    private List<List<TeamAgentDescriptor>> computeDependencyLevels(
            List<TeamAgentDescriptor> descriptors) {
        Map<String, TeamAgentDescriptor> byId = descriptors.stream()
                .collect(Collectors.toMap(d -> d.spec.getAgentId(), d -> d,
                        (a, b) -> a, LinkedHashMap::new));

        Set<String> completed = new HashSet<>();
        List<List<TeamAgentDescriptor>> levels = new ArrayList<>();
        Set<String> remaining = new LinkedHashSet<>();
        for (TeamAgentDescriptor d : descriptors) {
            remaining.add(d.spec.getAgentId());
        }

        while (!remaining.isEmpty()) {
            List<TeamAgentDescriptor> currentLevel = new ArrayList<>();
            for (String id : new ArrayList<>(remaining)) {
                TeamAgentDescriptor desc = byId.get(id);
                boolean depsMet = true;
                if (desc.spec.getDependencies() != null) {
                    for (String dep : desc.spec.getDependencies()) {
                        if (!completed.contains(dep)) {
                            depsMet = false;
                            break;
                        }
                    }
                }
                if (depsMet) {
                    currentLevel.add(desc);
                }
            }
            if (currentLevel.isEmpty()) {
                // Circular dependency — just add remaining in order
                log.warn("TeamExecutor: circular dependency detected, running remaining agents");
                for (String id : remaining) {
                    currentLevel.add(byId.get(id));
                }
            }
            for (TeamAgentDescriptor d : currentLevel) {
                completed.add(d.spec.getAgentId());
                remaining.remove(d.spec.getAgentId());
            }
            levels.add(currentLevel);
        }
        return levels;
    }

    // ---- Inner classes ----

    private static class TeamAgentDescriptor {
        final AgentSpec spec;
        final List<String> resolvedToolIds;
        final SubAgent subAgent;
        final ToolContext childContext;

        TeamAgentDescriptor(AgentSpec spec, List<String> resolvedToolIds,
                SubAgent subAgent, ToolContext childContext) {
            this.spec = spec;
            this.resolvedToolIds = resolvedToolIds;
            this.subAgent = subAgent;
            this.childContext = childContext;
        }
    }

    private static class AgentResultEntry {
        final String agentId;
        final boolean success;
        final String finalOutput;

        AgentResultEntry(String agentId, boolean success, String finalOutput) {
            this.agentId = agentId;
            this.success = success;
            this.finalOutput = finalOutput;
        }
    }

    // ---- Helpers ----

    private StreamEvent.DataEvent dataEvent(String type, Object... keyValuePairs) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("type", type);
        for (int i = 0; i < keyValuePairs.length - 1; i += 2) {
            data.put((String) keyValuePairs[i], keyValuePairs[i + 1]);
        }
        return StreamEvent.DataEvent.builder()
                .data(Collections.singletonList(data))
                .build();
    }

    /**
     * Persist a team execution snapshot for crash recovery.
     *
     * <p>
     * Best-effort: failures are logged and never propagated to the reactive
     * stream. Skipped silently when {@code stateStore} is null (feature flag
     * off) or when the session ID is unavailable.
     *
     * @param context       tool context (for sessionId, conversationId, agentId)
     * @param messages      working messages to persist
     * @param plan          the orchestration plan (serialized as JSON)
     * @param completedCount number of sub-agents that have completed so far
     */
    private void saveTeamSnapshot(ToolContext context, List<ChatMessage> messages,
            AgentTeamPlan plan, int completedCount) {
        if (stateStore == null || context == null || context.getSessionId() == null) {
            return;
        }
        try {
            AgentStateSnapshot snapshot = AgentStateSnapshot.builder()
                    .sessionId(context.getSessionId())
                    .conversationId(context.getConversationId())
                    .agentId(context.getAgentId())
                    .orchestrationPlan(objectMapper.writeValueAsString(plan))
                    .workingMessages(messages)
                    .iteration(completedCount)
                    .timestamp(System.currentTimeMillis())
                    .build();
            stateStore.save(context.getSessionId(), snapshot);
        } catch (Exception e) {
            log.warn("TeamExecutor: failed to save team snapshot: {}", e.getMessage());
        }
    }
}
