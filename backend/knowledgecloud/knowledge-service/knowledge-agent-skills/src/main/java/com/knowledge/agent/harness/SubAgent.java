package com.knowledge.agent.harness;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.channel.AgentChannel;
import com.knowledge.agent.channel.AgentMessage;
import com.knowledge.agent.core.engine.StreamEvent;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmResilience;
import com.knowledge.agent.tool.*;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.*;

/**
 * A lightweight HarnessLoop with its own system prompt and tool set.
 * Used by DelegateTool to run sub-tasks in parallel.
 *
 * <p>
 * Dependencies ({@link LlmClientFactory}, {@link LlmResilience}) are
 * injected via the constructor by {@link SubAgentFactory} — no static
 * holders needed. Per-request mutable objects ({@link ContextManager},
 * {@link SkillCatalog}, {@link DynamicSkillRegistry}) are created by the
 * factory and attached to the {@link ToolContext} before the SubAgent is
 * constructed.
 *
 * <p>
 * The {@link #run()} method returns a Flux that emits a
 * {@link SubAgentResult} as its terminal element (via
 * {@code doOnComplete}), allowing the caller (DelegateTool) to aggregate
 * each sub-agent's final output into a combined ToolResult.
 */
@Slf4j
public class SubAgent {

    private final String agentId;
    private final String description;
    private final ToolRegistry toolRegistry;
    private final Set<String> toolIds;
    private final AgentChannel channel;
    private final ToolContext context;
    private final LlmClientFactory llmClientFactory;
    private final LlmResilience llmResilience;

    /**
     * Optional custom system prompt. When non-null, this is used instead
     * of the default sub-agent prompt, allowing the orchestrator to give
     * each agent a distinct persona.
     */
    private final String customSystemPrompt;

    // Collects the final text output produced by this sub-agent
    private final StringBuilder finalOutput = new StringBuilder();

    /**
     * Full constructor — called by {@link SubAgentFactory}.
     *
     * <p>
     * The {@code context} must already have per-request instances of
     * {@link ContextManager}, {@link SkillCatalog}, and
     * {@link DynamicSkillRegistry} attached to it (done by the factory).
     */
    public SubAgent(String agentId,
            String description,
            ToolRegistry toolRegistry,
            Set<String> toolIds,
            AgentChannel channel,
            ToolContext context,
            LlmClientFactory llmClientFactory,
            LlmResilience llmResilience) {
        this(agentId, description, toolRegistry, toolIds, channel, context,
                llmClientFactory, llmResilience, null);
    }

    /**
     * Full constructor with custom system prompt — called by
     * {@link SubAgentFactory#create} when the orchestrator provides a
     * per-agent system prompt.
     *
     * @param customSystemPrompt when non-null, replaces the default
     *                           sub-agent system prompt in {@link #run()}
     */
    public SubAgent(String agentId,
            String description,
            ToolRegistry toolRegistry,
            Set<String> toolIds,
            AgentChannel channel,
            ToolContext context,
            LlmClientFactory llmClientFactory,
            LlmResilience llmResilience,
            String customSystemPrompt) {
        this.agentId = agentId;
        this.description = description;
        this.toolRegistry = toolRegistry;
        this.toolIds = toolIds;
        this.channel = channel;
        this.context = context;
        this.llmClientFactory = llmClientFactory;
        this.llmResilience = llmResilience;
        this.customSystemPrompt = customSystemPrompt;
    }

    /**
     * Run this sub-agent's task, returning a Flux of StreamEvents.
     *
     * <p>
     * Text events produced by the sub-agent are captured into
     * {@link #finalOutput} so that {@link #getFinalOutput()} can be
     * called after the Flux completes to retrieve the aggregated result.
     */
    public Flux<StreamEvent> run() {
        // Build a simple conversation with the sub-task as the user message
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.builder()
                .role("user")
                .content(description)
                .build());

        // Build system prompt for the sub-agent.
        // If a custom system prompt was provided (by the orchestrator),
        // use it as the base and append time/user context. Otherwise,
        // use the default sub-agent prompt.
        StringBuilder subPrompt = new StringBuilder();
        if (customSystemPrompt != null && !customSystemPrompt.isEmpty()) {
            subPrompt.append(customSystemPrompt).append("\n\n");
        } else {
            subPrompt.append("You are a specialized sub-agent working on a specific task. ");
        }
        // Add current time
        java.time.ZonedDateTime now = java.time.ZonedDateTime.now(java.time.ZoneId.systemDefault());
        java.time.format.DateTimeFormatter fmt = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z");
        int year = now.getYear();
        subPrompt.append("=== IMPORTANT: CURRENT TIME CONTEXT ===\n");
        subPrompt.append("Current date/time: ").append(fmt.format(now)).append("\n");
        subPrompt.append("The current year is ").append(year).append(". ");
        subPrompt.append("You MUST use ").append(year).append(" as the current year in all responses. ");
        subPrompt.append("Do NOT use any earlier year such as 2024 or 2023 unless explicitly referring to historical events.\n");
        subPrompt.append("=== END TIME CONTEXT ===\n");
        // Add user context if available
        if (context != null) {
            boolean hasUser = context.getUserId() != null && context.getUserId() > 0;
            boolean hasName = context.getUserName() != null && !context.getUserName().isEmpty();
            if (hasUser || hasName) {
                subPrompt.append("Current user: ");
                if (hasName) {
                    subPrompt.append(context.getUserName());
                }
                if (context.getAccount() != null && !context.getAccount().isEmpty()) {
                    subPrompt.append(" (").append(context.getAccount()).append(")");
                }
                subPrompt.append(", ID: ").append(hasUser ? context.getUserId() : "unknown");
                if (context.getRoleName() != null && !context.getRoleName().isEmpty()) {
                    subPrompt.append(", role: ").append(context.getRoleName());
                }
                subPrompt.append("\n");
            }
        }
        if (customSystemPrompt == null || customSystemPrompt.isEmpty()) {
            subPrompt.append("Focus on completing the task described by the user. ");
            subPrompt.append("If you need help or encounter a blocker, use the available tools to resolve it. ");
            subPrompt.append("Report your progress through the tools available to you.");
        }

        // Create a harness loop — per-request ContextManager, SkillCatalog,
        // and DynamicSkillRegistry are already on the context (set by the factory)
        HarnessLoop loop = new HarnessLoop(
                llmClientFactory,
                toolRegistry,
                llmResilience,
                null); // no state persistence for sub-agents

        return loop.run(messages, null, toolIds, subPrompt.toString(), context, 10)
                .doOnSubscribe(s -> {
                    log.info("SubAgent {} started", agentId);
                    if (channel != null) {
                        channel.post(AgentMessage.progress(agentId, "Sub-agent started"));
                    }
                })
                .doOnNext(event -> {
                    // Capture text output for result aggregation
                    if (event instanceof StreamEvent.TextEvent) {
                        String content = ((StreamEvent.TextEvent) event).getContent();
                        if (content != null && !content.isEmpty()) {
                            finalOutput.append(content);
                        }
                    }
                })
                .doOnComplete(() -> {
                    log.info("SubAgent {} completed", agentId);
                })
                .doOnError(e -> {
                    log.error("SubAgent {} error: {}", agentId, e.getMessage());
                });
    }

    public String getAgentId() {
        return agentId;
    }

    /**
     * Returns the aggregated text output produced by this sub-agent.
     * Should be called after the Flux completes.
     */
    public String getFinalOutput() {
        return finalOutput.toString();
    }
}
