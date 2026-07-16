package com.knowledge.agent.v2.orchestrator;

import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.eventbus.AgentEventBus;
import com.knowledge.agent.v2.llm.InferenceRequest;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.v2.llm.LlmAdapter;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Multi-agent orchestrator V2 — DAG-based execution engine.
 *
 * <p>This replaces V1's strategy enum (PARALLEL/SEQUENTIAL/HYBRID) with a
 * unified DAG (Directed Acyclic Graph) model that naturally supports all
 * execution patterns:
 * <ul>
 *   <li><b>Sequential</b>: linear chain of dependencies (A → B → C)</li>
 *   <li><b>Parallel</b>: no dependencies between tasks (A, B, C all root)</li>
 *   <li><b>Fan-out/fan-in</b>: root tasks fan out, then converge (A → C, B → C)</li>
 *   <li><b>Complex DAG</b>: arbitrary dependency structures</li>
 * </ul>
 *
 * <p>Execution flow:
 * <ol>
 *   <li>{@code plan()}: Use LLM to decompose a user request into an {@link ExecutionPlan}</li>
 *   <li>{@code execute()}: Drive the plan via {@link DAGScheduler}</li>
 *   <li>{@code synthesize()}: Merge sub-agent results into final response</li>
 * </ol>
 *
 * <p>The orchestrator is invoked by the DELEGATE state handler when the engine
 * determines that the current task should be split across multiple agents.
 */
@Slf4j
public class OrchestratorV2 {

    private final DAGScheduler scheduler;
    private final LlmAdapter llmAdapter;
    private final AgentEventBus eventBus;
    private final AgentProperties.OrchestratorConfig config;

    public OrchestratorV2(DAGScheduler scheduler, LlmAdapter llmAdapter,
                           AgentEventBus eventBus, AgentProperties.OrchestratorConfig config) {
        this.scheduler = scheduler;
        this.llmAdapter = llmAdapter;
        this.eventBus = eventBus;
        this.config = config;
    }

    /**
     * Full orchestration cycle: plan → execute → synthesize.
     *
     * @param userMessage   the user's request to decompose
     * @param parentSession the parent session context
     * @return Flux of all events (delegation + final synthesized result)
     */
    public Flux<AgentEvent> orchestrate(String userMessage, AgentSession parentSession) {
        if (!config.isEnabled()) {
            return Flux.error(new IllegalStateException("Orchestrator is not enabled"));
        }

        log.info("OrchestratorV2: starting orchestration for session {}",
                parentSession.getSessionId());

        return plan(userMessage, parentSession)
                .flatMapMany(plan -> execute(plan, parentSession));
    }

    /**
     * Use LLM to decompose the user request into an execution plan (DAG).
     *
     * <p>The LLM is prompted with a structured format to produce:
     * <ul>
     *   <li>A list of tasks with IDs, descriptions, and optional tool sets</li>
     *   <li>A dependency map between tasks</li>
     *   <li>A synthesis strategy recommendation</li>
     * </ul>
     *
     * @param userMessage   the user request to decompose
     * @param parentSession parent session for context
     * @return Mono of the generated execution plan
     */
    public Mono<ExecutionPlan> plan(String userMessage, AgentSession parentSession) {
        log.debug("OrchestratorV2: planning decomposition for: {}",
                truncate(userMessage, 100));

        // Fast path: short messages likely don't need multi-agent
        if (userMessage.length() < config.getFastPathMessageLength()) {
            return Mono.just(buildSingleTaskPlan(userMessage, parentSession));
        }

        // Build planning prompt
        List<ConversationMessage> messages = buildPlanningMessages(userMessage, parentSession);

        InferenceRequest request = InferenceRequest.builder()
                .model(parentSession.getModelName())
                .messages(messages)
                .temperature(0.0)  // Deterministic planning
                .stream(false)
                .build();

        return llmAdapter.infer(request)
                .map(response -> parsePlanFromResponse(response, userMessage))
                .onErrorResume(e -> {
                    log.warn("OrchestratorV2: planning failed, falling back to single task: {}",
                            e.getMessage());
                    return Mono.just(buildSingleTaskPlan(userMessage, parentSession));
                });
    }

    /**
     * Execute a pre-built plan via the DAG scheduler.
     *
     * @param plan          the execution plan
     * @param parentSession the parent session
     * @return Flux of events from plan execution + synthesis
     */
    public Flux<AgentEvent> execute(ExecutionPlan plan, AgentSession parentSession) {
        log.info("OrchestratorV2: executing plan {} ({} tasks, strategy={})",
                plan.getPlanId(), plan.getTasks().size(), plan.getSynthesisStrategy());

        return scheduler.execute(plan, parentSession)
                .concatWith(Flux.defer(() -> synthesize(plan, parentSession)));
    }

    /**
     * Synthesize results from completed sub-agents based on the plan's strategy.
     */
    private Flux<AgentEvent> synthesize(ExecutionPlan plan, AgentSession parentSession) {
        Map<String, DAGScheduler.TaskResult> results = scheduler.getResults(plan, parentSession);

        if (results.isEmpty()) {
            return Flux.empty();
        }

        switch (plan.getSynthesisStrategy()) {
            case LLM_MERGE:
                return synthesizeWithLlm(results, parentSession);
            case CONCATENATE:
                return synthesizeConcatenate(results, parentSession);
            case LAST_RESULT:
                return synthesizeLastResult(results, plan, parentSession);
            default:
                return synthesizeConcatenate(results, parentSession);
        }
    }

    /**
     * LLM-based synthesis: ask the LLM to merge results intelligently.
     */
    private Flux<AgentEvent> synthesizeWithLlm(Map<String, DAGScheduler.TaskResult> results,
                                                AgentSession parentSession) {
        StringBuilder contextBuilder = new StringBuilder();
        contextBuilder.append("Please synthesize the following sub-agent results into a coherent response:\n\n");

        for (Map.Entry<String, DAGScheduler.TaskResult> entry : results.entrySet()) {
            DAGScheduler.TaskResult result = entry.getValue();
            if (result.isSuccess()) {
                contextBuilder.append("## Task: ").append(entry.getKey()).append("\n");
                contextBuilder.append(result.getContent()).append("\n\n");
            }
        }

        List<ConversationMessage> messages = Collections.singletonList(
                ConversationMessage.user(contextBuilder.toString())
        );

        InferenceRequest request = InferenceRequest.builder()
                .model(parentSession.getModelName())
                .messages(messages)
                .temperature(0.3)
                .stream(false)
                .build();

        return llmAdapter.infer(request)
                .flatMapMany(response -> {
                    // Store synthesized result in parent session
                    if (response.getContent() != null) {
                        parentSession.getExecution().addMessage(
                                ConversationMessage.assistant(response.getContent()));
                    }
                    return Flux.empty();
                });
    }

    /**
     * Simple concatenation of all successful results.
     */
    private Flux<AgentEvent> synthesizeConcatenate(Map<String, DAGScheduler.TaskResult> results,
                                                    AgentSession parentSession) {
        String merged = results.values().stream()
                .filter(DAGScheduler.TaskResult::isSuccess)
                .map(DAGScheduler.TaskResult::getContent)
                .collect(Collectors.joining("\n\n"));

        parentSession.getExecution().addMessage(
                ConversationMessage.assistant(merged));
        return Flux.empty();
    }

    /**
     * Use only the last completed task's result.
     */
    private Flux<AgentEvent> synthesizeLastResult(Map<String, DAGScheduler.TaskResult> results,
                                                   ExecutionPlan plan,
                                                   AgentSession parentSession) {
        // Find the terminal task (one that no other task depends on)
        Set<String> allDependedOn = plan.getDependencies().values().stream()
                .filter(Objects::nonNull)
                .flatMap(Set::stream)
                .collect(Collectors.toSet());

        Optional<DAGScheduler.TaskResult> lastResult = plan.getTasks().stream()
                .map(AgentTask::getTaskId)
                .filter(id -> !allDependedOn.contains(id))
                .map(results::get)
                .filter(Objects::nonNull)
                .filter(DAGScheduler.TaskResult::isSuccess)
                .findFirst();

        lastResult.ifPresent(result ->
                parentSession.getExecution().addMessage(
                        ConversationMessage.assistant(result.getContent())));

        return Flux.empty();
    }

    // ---- Planning helpers ----

    private List<ConversationMessage> buildPlanningMessages(String userMessage,
                                                            AgentSession parentSession) {
        String systemPrompt = "You are a task decomposition planner. Given a user request, "
                + "break it into independent sub-tasks that can be executed by specialist agents.\n\n"
                + "Output format (JSON):\n"
                + "{\n"
                + "  \"tasks\": [\n"
                + "    {\"id\": \"task_1\", \"name\": \"Agent Name\", \"description\": \"What to do\"},\n"
                + "    {\"id\": \"task_2\", \"name\": \"Agent Name\", \"description\": \"What to do\"}\n"
                + "  ],\n"
                + "  \"dependencies\": {\"task_2\": [\"task_1\"]},\n"
                + "  \"strategy\": \"LLM_MERGE\"\n"
                + "}\n\n"
                + "Rules:\n"
                + "- Maximum " + config.getMaxAgents() + " tasks\n"
                + "- Each task should be self-contained\n"
                + "- Only add dependencies when strictly necessary\n"
                + "- Strategy options: LLM_MERGE, CONCATENATE, LAST_RESULT";

        List<ConversationMessage> messages = new ArrayList<>();
        messages.add(ConversationMessage.system(systemPrompt));
        messages.add(ConversationMessage.user(userMessage));
        return messages;
    }

    /**
     * Parse the LLM's JSON response into an ExecutionPlan.
     * Falls back to single-task plan on parse failure.
     */
    private ExecutionPlan parsePlanFromResponse(InferenceResponse response, String userMessage) {
        String content = response.getContent();
        if (content == null || content.isEmpty()) {
            return buildSingleTaskPlan(userMessage, null);
        }

        try {
            // Simple JSON parsing (avoid Jackson dependency in engine core)
            // Extract tasks array and dependencies map from the response
            return parsePlanJson(content, userMessage);
        } catch (Exception e) {
            log.warn("OrchestratorV2: failed to parse plan JSON, falling back to single task: {}",
                    e.getMessage());
            return buildSingleTaskPlan(userMessage, null);
        }
    }

    /**
     * Lightweight JSON parsing for the plan format.
     * In production, this would use a proper JSON parser.
     */
    private ExecutionPlan parsePlanJson(String json, String fallbackMessage) {
        // Extract JSON block if wrapped in markdown code fence
        String cleaned = json;
        if (cleaned.contains("```json")) {
            int start = cleaned.indexOf("```json") + 7;
            int end = cleaned.indexOf("```", start);
            if (end > start) {
                cleaned = cleaned.substring(start, end).trim();
            }
        } else if (cleaned.contains("```")) {
            int start = cleaned.indexOf("```") + 3;
            int end = cleaned.indexOf("```", start);
            if (end > start) {
                cleaned = cleaned.substring(start, end).trim();
            }
        }

        // Minimal parsing: extract task ids, names, and descriptions
        List<AgentTask> tasks = new ArrayList<>();
        Map<String, Set<String>> dependencies = new HashMap<>();

        // Parse tasks: look for "id", "name", "description" patterns
        String[] taskBlocks = cleaned.split("\\{");
        for (String block : taskBlocks) {
            String id = extractJsonValue(block, "id");
            String name = extractJsonValue(block, "name");
            String description = extractJsonValue(block, "description");

            if (id != null && description != null) {
                tasks.add(AgentTask.builder()
                        .taskId(id)
                        .agentName(name != null ? name : id)
                        .description(description)
                        .build());
            }
        }

        // Parse dependencies
        int depsStart = cleaned.indexOf("\"dependencies\"");
        if (depsStart >= 0) {
            String depsSection = cleaned.substring(depsStart);
            // Simple pattern: "task_id": ["dep1", "dep2"]
            for (AgentTask task : tasks) {
                String pattern = "\"" + task.getTaskId() + "\"";
                int patternIdx = depsSection.indexOf(pattern);
                if (patternIdx >= 0) {
                    int arrayStart = depsSection.indexOf("[", patternIdx);
                    int arrayEnd = depsSection.indexOf("]", arrayStart);
                    if (arrayStart >= 0 && arrayEnd > arrayStart) {
                        String arrayContent = depsSection.substring(arrayStart + 1, arrayEnd);
                        Set<String> deps = new HashSet<>();
                        for (String dep : arrayContent.split(",")) {
                            String trimmed = dep.trim().replace("\"", "");
                            if (!trimmed.isEmpty()) {
                                deps.add(trimmed);
                            }
                        }
                        if (!deps.isEmpty()) {
                            dependencies.put(task.getTaskId(), deps);
                        }
                    }
                }
            }
        }

        // Parse strategy
        ExecutionPlan.SynthesisStrategy strategy = ExecutionPlan.SynthesisStrategy.LLM_MERGE;
        String strategyStr = extractJsonValue(cleaned, "strategy");
        if (strategyStr != null) {
            try {
                strategy = ExecutionPlan.SynthesisStrategy.valueOf(strategyStr);
            } catch (IllegalArgumentException ignored) {
                // Keep default
            }
        }

        if (tasks.isEmpty()) {
            return buildSingleTaskPlan(fallbackMessage, null);
        }

        return new ExecutionPlan(
                UUID.randomUUID().toString(),
                tasks,
                dependencies,
                strategy
        );
    }

    /**
     * Extract a simple string value from a JSON-like string.
     */
    private String extractJsonValue(String text, String key) {
        String pattern = "\"" + key + "\"";
        int idx = text.indexOf(pattern);
        if (idx < 0) return null;

        int colonIdx = text.indexOf(":", idx + pattern.length());
        if (colonIdx < 0) return null;

        // Find the value (quoted string)
        int quoteStart = text.indexOf("\"", colonIdx + 1);
        if (quoteStart < 0) return null;

        int quoteEnd = text.indexOf("\"", quoteStart + 1);
        if (quoteEnd < 0) return null;

        return text.substring(quoteStart + 1, quoteEnd);
    }

    /**
     * Build a single-task plan (fallback / fast-path).
     */
    private ExecutionPlan buildSingleTaskPlan(String userMessage, AgentSession session) {
        AgentTask task = AgentTask.builder()
                .taskId("single")
                .agentName("default")
                .description(userMessage)
                .build();

        return new ExecutionPlan(
                UUID.randomUUID().toString(),
                Collections.singletonList(task),
                Collections.emptyMap(),
                ExecutionPlan.SynthesisStrategy.LAST_RESULT
        );
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() <= maxLen ? text : text.substring(0, maxLen) + "...";
    }
}
