package com.knowledge.agent.tool.builtin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.channel.AgentChannel;
import com.knowledge.agent.channel.AgentMessage;
import com.knowledge.agent.channel.ChannelHub;
import com.knowledge.agent.core.engine.StreamEvent;
import com.knowledge.agent.core.engine.SubAgentEvent;
import com.knowledge.agent.harness.SubAgent;
import com.knowledge.agent.harness.SubAgentFactory;
import com.knowledge.agent.tool.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * DelegateTool: an AsyncTool that spawns sub-agents for complex tasks.
 * The LLM autonomously decides when to call this tool based on task complexity.
 *
 * <p>
 * Implements AsyncTool because it returns a Flux of StreamEvents
 * (sub-agent lifecycle events + final ToolResultEvent).
 *
 * <p>
 * <b>Improvements over the original implementation:</b>
 * <ul>
 * <li>{@link SubAgentEvent} preserves inner event types instead of
 *     flattening to generic {@link DataEvent}s</li>
 * <li>Result aggregation: each sub-agent's final output is collected
 *     and included in the ToolResult for the parent LLM</li>
 * <li>Per-sub-agent timeout via {@code agent.delegate.timeout-per-subagent}</li>
 * <li>{@code maxParallel} enforced via {@code Flux.flatMap} concurrency</li>
 * <li>Cancellation propagation: disposing the parent Flux cancels
 *     all running sub-agents</li>
 * </ul>
 */
@Slf4j
@Component
public class DelegateTool implements AsyncTool {

    @Value("${agent.delegate.max-depth:2}")
    private int maxDepth;

    @Value("${agent.delegate.max-sub-agents:5}")
    private int maxSubAgents;

    @Value("${agent.delegate.max-parallel:3}")
    private int maxParallel;

    @Value("${agent.delegate.timeout-per-subagent:120}")
    private int timeoutPerSubagentSeconds;

    private final ToolRegistry toolRegistry;
    private final ProgressiveDiscovery progressiveDiscovery;
    private final ChannelHub channelHub;
    private final SubAgentFactory subAgentFactory;
    private final ObjectMapper objectMapper;

    public DelegateTool(ToolRegistry toolRegistry,
            ProgressiveDiscovery progressiveDiscovery,
            ChannelHub channelHub,
            SubAgentFactory subAgentFactory,
            ObjectMapper objectMapper) {
        this.toolRegistry = toolRegistry;
        this.progressiveDiscovery = progressiveDiscovery;
        this.channelHub = channelHub;
        this.subAgentFactory = subAgentFactory;
        this.objectMapper = objectMapper;
    }

    @Override
    public String getId() {
        return "delegate";
    }

    @Override
    public String getDescription() {
        return "Spawn parallel sub-agents for complex tasks. Each sub-agent gets tools matching its requiredCapabilities. "
                + "Use this when a task is complex enough to require parallel sub-task execution.";
    }

    @Override
    public String getJsonSchema() {
        return "{\"type\":\"object\",\"properties\":{"
                + "\"subtasks\":{\"type\":\"array\",\"items\":{\"type\":\"object\",\"properties\":{"
                + "\"id\":{\"type\":\"string\",\"description\":\"Unique sub-task identifier\"},"
                + "\"description\":{\"type\":\"string\",\"description\":\"Description of what the sub-agent should do\"},"
                + "\"requiredCapabilities\":{\"type\":\"array\",\"items\":{\"type\":\"string\"},"
                + "\"description\":\"Capabilities needed, e.g. [\\\"search\\\",\\\"read\\\"]\"}"
                + "},\"required\":[\"id\",\"description\"]},"
                + "\"description\":\"List of sub-tasks to delegate to parallel sub-agents\"}"
                + "},\"required\":[\"subtasks\"]}";
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        // Sync execution not supported for DelegateTool — use executeAsync
        throw new UnsupportedOperationException("DelegateTool only supports async execution via executeAsync()");
    }

    @Override
    public Flux<StreamEvent> executeAsync(ToolContext context, String args) {
        return Flux.defer(() -> {
            try {
                // 1. Check recursion guard
                if (context.getDelegateDepth() >= maxDepth) {
                    return Flux.just(
                            StreamEvent.ToolResultEvent.builder()
                                    .toolCallId("delegate-depth-exceeded")
                                    .result(ToolResult.error("Delegate depth limit reached (" + maxDepth + ")"))
                                    .build());
                }

                // 2. Parse arguments
                JsonNode root = objectMapper.readTree(args);
                JsonNode subtasksNode = root.get("subtasks");
                if (subtasksNode == null || !subtasksNode.isArray() || subtasksNode.size() == 0) {
                    return Flux.just(
                            StreamEvent.ToolResultEvent.builder()
                                    .toolCallId("delegate-no-subtasks")
                                    .result(ToolResult.error("No subtasks provided"))
                                    .build());
                }

                // Limit sub-agents
                int subtaskCount = Math.min(subtasksNode.size(), maxSubAgents);

                // Identity for the sub-agent tree: the spawner is this context's
                // agent (null at the root); children sit one level deeper.
                final String parentAgentId = context.getAgentId();
                final int childDepth = context.getDelegateDepth() + 1;

                // 3. Emit delegate_start event
                List<Map<String, String>> subtaskInfo = new ArrayList<>();
                for (int i = 0; i < subtaskCount; i++) {
                    JsonNode st = subtasksNode.get(i);
                    Map<String, String> info = new LinkedHashMap<>();
                    info.put("id", st.has("id") ? st.get("id").asText() : "sub-" + i);
                    info.put("description", st.has("description") ? st.get("description").asText() : "");
                    subtaskInfo.add(info);
                }
                Map<String, Object> startData = new LinkedHashMap<>();
                startData.put("type", "delegate_start");
                startData.put("subTaskCount", String.valueOf(subtaskCount));
                startData.put("subTasks", subtaskInfo.toString());

                // 4. Create AgentChannel for coordination
                String channelId = context.getSessionId() + "-delegate-" + System.currentTimeMillis();
                AgentChannel channel = channelHub.create(channelId);

                // 5. Build sub-agent descriptors
                List<SubAgentDescriptor> descriptors = new ArrayList<>();
                for (int i = 0; i < subtaskCount; i++) {
                    JsonNode st = subtasksNode.get(i);
                    String subtaskId = st.has("id") ? st.get("id").asText() : "sub-" + i;
                    String description = st.has("description") ? st.get("description").asText() : "";

                    // Resolve requiredCapabilities to tool IDs
                    Set<String> resolvedToolIds = new LinkedHashSet<>();
                    JsonNode capsNode = st.get("requiredCapabilities");
                    if (capsNode != null && capsNode.isArray()) {
                        List<String> caps = new ArrayList<>();
                        for (JsonNode cap : capsNode) {
                            caps.add(cap.asText());
                        }
                        resolvedToolIds.addAll(progressiveDiscovery.resolve(caps));
                    }

                    // Always include delegate tool so sub-agents can further delegate
                    resolvedToolIds.add("delegate");

                    // Create child context with incremented depth; tag it with
                    // the sub-agent's own id so nested delegations know their parent.
                    ToolContext childContext = context.incrementDepth();
                    childContext.setAgentId(subtaskId);

                    SubAgent subAgent = subAgentFactory.create(
                            subtaskId, description, resolvedToolIds, channel, childContext);

                    descriptors.add(new SubAgentDescriptor(
                            subtaskId, description, new ArrayList<>(resolvedToolIds), subAgent));
                }

                // 6. Emit initial status events (delegate_start + spawned).
                // delegate_start carries the spawner's identity so the frontend
                // can hang the sub-agent subtree under the right node.
                startData.put("parentAgentId", parentAgentId);
                startData.put("depth", childDepth);
                List<StreamEvent> initEvents = new ArrayList<>();
                initEvents.add(StreamEvent.DataEvent.builder()
                        .data(Collections.singletonList(startData))
                        .build());
                for (SubAgentDescriptor desc : descriptors) {
                    initEvents.add(dataEvent("subagent_spawned",
                            "agentId", desc.subtaskId,
                            "parentAgentId", parentAgentId,
                            "depth", childDepth,
                            "task", desc.description,
                            "capabilities", desc.capabilities));
                }

                // 7. Run sub-agents with maxParallel concurrency.
                // We use a shared ConcurrentHashMap to collect final outputs from
                // each sub-agent so we can build an aggregated ToolResult.
                ConcurrentHashMap<String, SubAgentResultEntry> resultEntries = new ConcurrentHashMap<>();
                Duration timeout = Duration.ofSeconds(timeoutPerSubagentSeconds);

                // Each sub-agent's Flux is wrapped:
                //  - Events are tagged as SubAgentEvent.of(agentId, event) to preserve type
                //  - Final output is captured after completion
                //  - Timeout is applied per-sub-agent
                List<Flux<StreamEvent>> subAgentFluxes = new ArrayList<>();
                for (SubAgentDescriptor desc : descriptors) {
                    final String subtaskId = desc.subtaskId;
                    final SubAgent subAgent = desc.subAgent;

                    Flux<StreamEvent> agentFlux = subAgent.run()
                            .timeout(timeout)
                            .map(event -> (StreamEvent) SubAgentEvent.of(
                                    subtaskId, parentAgentId, childDepth, event))
                            .startWith(dataEvent("subagent_status",
                                    "agentId", subtaskId,
                                    "parentAgentId", parentAgentId,
                                    "depth", childDepth,
                                    "status", "running"))
                            .doOnComplete(() -> {
                                resultEntries.put(subtaskId, new SubAgentResultEntry(
                                        subtaskId, true, subAgent.getFinalOutput()));
                                channel.post(AgentMessage.result(subtaskId, "Sub-agent completed"));
                            })
                            .doOnError(e -> {
                                log.error("SubAgent {} timed out or errored: {}", subtaskId, e.getMessage());
                                resultEntries.put(subtaskId, new SubAgentResultEntry(
                                        subtaskId, false, "Error: " + e.getMessage()));
                                channel.post(AgentMessage.result(subtaskId, "Error: " + e.getMessage()));
                            })
                            .onErrorResume(e -> Flux.just(
                                    dataEvent("subagent_status",
                                            "agentId", subtaskId,
                                            "parentAgentId", parentAgentId,
                                            "depth", childDepth,
                                            "status", "error",
                                            "detail", e.getMessage()),
                                    SubAgentEvent.of(subtaskId, parentAgentId, childDepth,
                                            StreamEvent.ErrorEvent.builder()
                                                    .error("Sub-agent " + subtaskId
                                                            + " error: " + e.getMessage())
                                                    .build())))
                            // Emit a terminal subagent_finish carrying status +
                            // captured output so the UI can close the node.
                            .concatWith(Flux.defer(() -> {
                                SubAgentResultEntry entry = resultEntries.get(subtaskId);
                                boolean ok = entry == null || entry.success;
                                return Flux.just(dataEvent("subagent_finish",
                                        "agentId", subtaskId,
                                        "parentAgentId", parentAgentId,
                                        "depth", childDepth,
                                        "status", ok ? "completed" : "error"));
                            }))
                            .subscribeOn(Schedulers.boundedElastic());

                    subAgentFluxes.add(agentFlux);
                }

                // Merge all sub-agent fluxes with maxParallel concurrency.
                // Flux.merge() subscribes to all at once, so we use a
                // semaphore-based approach: wrap in flatMap to enforce concurrency.
                Flux<StreamEvent> mergedAgentEvents = Flux.fromIterable(subAgentFluxes)
                        .flatMap(flux -> flux, maxParallel);

                // After all sub-agents complete, emit the aggregated result
                Flux<StreamEvent> resultFlux = mergedAgentEvents
                        .thenMany(Mono.fromCallable(() -> buildAggregatedResult(resultEntries, descriptors)))
                        .doFinally(signal -> channelHub.remove(channelId));

                return Flux.concat(
                        Flux.fromIterable(initEvents),
                        resultFlux);

            } catch (Exception e) {
                log.error("DelegateTool error", e);
                return Flux.just(
                        StreamEvent.ErrorEvent.builder().error(e.getMessage()).build(),
                        StreamEvent.ToolResultEvent.builder()
                                .toolCallId("delegate-error")
                                .result(ToolResult.error(e.getMessage()))
                                .build());
            }
        });
    }

    /**
     * Build the aggregated ToolResult from all sub-agent outputs.
     */
    private StreamEvent buildAggregatedResult(
            ConcurrentHashMap<String, SubAgentResultEntry> resultEntries,
            List<SubAgentDescriptor> descriptors) {

        StringBuilder summary = new StringBuilder();
        boolean hasErrors = false;

        // Build summary in the order the sub-agents were declared
        for (SubAgentDescriptor desc : descriptors) {
            SubAgentResultEntry entry = resultEntries.get(desc.subtaskId);
            if (entry == null) {
                summary.append("[").append(desc.subtaskId).append("] (no result)\n");
                hasErrors = true;
                continue;
            }
            if (!entry.success) {
                hasErrors = true;
            }
            String output = entry.finalOutput;
            if (output != null && !output.isEmpty()) {
                summary.append("[").append(desc.subtaskId).append("] ").append(output);
                if (!output.endsWith("\n")) {
                    summary.append("\n");
                }
            } else {
                summary.append("[").append(desc.subtaskId).append("] (no output)\n");
            }
        }

        String resultMessage = hasErrors
                ? "Delegation completed with errors\n\n" + summary
                : "All sub-agents completed successfully\n\n" + summary;

        return StreamEvent.ToolResultEvent.builder()
                .toolCallId("delegate")
                .result(ToolResult.success(resultMessage))
                .build();
    }

    // ---- Inner classes ----

    /**
     * Descriptor for a sub-agent to be spawned.
     */
    private static class SubAgentDescriptor {
        final String subtaskId;
        final String description;
        final List<String> capabilities;
        final SubAgent subAgent;

        SubAgentDescriptor(String subtaskId, String description, List<String> capabilities, SubAgent subAgent) {
            this.subtaskId = subtaskId;
            this.description = description;
            this.capabilities = capabilities;
            this.subAgent = subAgent;
        }
    }

    /**
     * Collected result from a completed sub-agent.
     */
    private static class SubAgentResultEntry {
        final String agentId;
        final boolean success;
        final String finalOutput;

        SubAgentResultEntry(String agentId, boolean success, String finalOutput) {
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
}
