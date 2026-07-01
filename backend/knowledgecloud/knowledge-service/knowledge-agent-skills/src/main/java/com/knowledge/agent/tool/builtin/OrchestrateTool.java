package com.knowledge.agent.tool.builtin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.api.dto.SkillPayload;
import com.knowledge.agent.core.engine.StreamEvent;
import com.knowledge.agent.orchestrator.AgentTeamPlan;
import com.knowledge.agent.orchestrator.OrchestratorAgent;
import com.knowledge.agent.orchestrator.TeamExecutor;
import com.knowledge.agent.tool.AsyncTool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.List;

/**
 * Tool that allows the LLM to re-orchestrate a task into multiple
 * specialized agents mid-conversation.
 *
 * <p>
 * Unlike {@link OrchestratorAgent} which runs automatically before the
 * main loop (in {@code AgentHarness}), this tool is invoked explicitly
 * by the LLM when it discovers the task is more complex than initially
 * planned. The LLM provides an updated task description, and the tool:
 * <ol>
 * <li>Calls {@link OrchestratorAgent#plan} to decompose the task</li>
 * <li>If multi-agent, delegates to {@link TeamExecutor#execute}</li>
 * <li>If single-agent, returns a result telling the LLM to handle it
 *     itself</li>
 * </ol>
 *
 * <p>
 * Implements {@link AsyncTool} because multi-agent execution returns a
 * Flux of StreamEvents (sub-agent lifecycle + synthesis + ToolResult).
 */
@Slf4j
@Component
public class OrchestrateTool implements AsyncTool {

    @Value("${agent.delegate.max-depth:2}")
    private int maxDepth;

    private final OrchestratorAgent orchestratorAgent;
    private final TeamExecutor teamExecutor;
    private final ObjectMapper objectMapper;

    public OrchestrateTool(OrchestratorAgent orchestratorAgent,
            TeamExecutor teamExecutor,
            ObjectMapper objectMapper) {
        this.orchestratorAgent = orchestratorAgent;
        this.teamExecutor = teamExecutor;
        this.objectMapper = objectMapper;
    }

    @Override
    public String getId() {
        return "orchestrate";
    }

    @Override
    public String getDescription() {
        return "Re-plan the task into multiple specialized agents. "
                + "Use this when you discover the task is more complex than initially planned "
                + "and would benefit from parallel or sequential decomposition into specialized agents.";
    }

    @Override
    public String getJsonSchema() {
        return "{\"type\":\"object\",\"properties\":{"
                + "\"reason\":{\"type\":\"string\",\"description\":\"Why re-orchestration is needed\"},"
                + "\"task_description\":{\"type\":\"string\",\"description\":\"Updated task description for planning\"}"
                + "},\"required\":[\"task_description\"]}";
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        throw new UnsupportedOperationException(
                "OrchestrateTool only supports async execution via executeAsync()");
    }

    @Override
    public Flux<StreamEvent> executeAsync(ToolContext context, String args) {
        return Flux.defer(() -> {
            try {
                // 1. Recursion guard — prevent infinite re-orchestration
                if (context.getDelegateDepth() >= maxDepth) {
                    return Flux.just(StreamEvent.ToolResultEvent.builder()
                            .toolCallId("orchestrate-depth-exceeded")
                            .result(ToolResult.error(
                                    "Orchestration depth limit reached (" + maxDepth + ")"))
                            .build());
                }

                // 2. Parse arguments
                JsonNode root = objectMapper.readTree(args);
                String taskDescription = root.has("task_description")
                        ? root.get("task_description").asText() : null;
                if (taskDescription == null || taskDescription.isEmpty()) {
                    return Flux.just(StreamEvent.ToolResultEvent.builder()
                            .toolCallId("orchestrate-no-task")
                            .result(ToolResult.error("No task_description provided"))
                            .build());
                }

                String reason = root.has("reason")
                        ? root.get("reason").asText() : null;
                log.info("OrchestrateTool: re-orchestration requested, reason={}, task={}",
                        reason, taskDescription.substring(0,
                                Math.min(100, taskDescription.length())));

                // 3. Build messages for the planning call
                List<ChatMessage> messages = new ArrayList<>();
                messages.add(ChatMessage.builder()
                        .role("user")
                        .content(taskDescription)
                        .build());

                // 4. Collect available skills from the context's SkillCatalog
                List<SkillPayload> availableSkills = collectSkills(context);

                // 5. Plan the team — reactive composition to avoid .block() on Netty threads
                return orchestratorAgent
                        .plan(messages, availableSkills, null)
                        .flatMapMany(plan -> {
                            if (plan == null || plan.isSingleAgent()) {
                                // Single-agent: tell the LLM to handle it itself
                                return Flux.just(StreamEvent.ToolResultEvent.builder()
                                        .toolCallId("orchestrate")
                                        .result(ToolResult.success(
                                                "Task does not require multi-agent orchestration. "
                                                        + "Please handle it directly using the available tools."))
                                        .build());
                            }

                            // 6. Execute the multi-agent team
                            log.info("OrchestrateTool: executing {} agents with {} strategy",
                                    plan.getAgents().size(), plan.getStrategy());
                            return teamExecutor.execute(plan, messages, context);
                        })
                        .onErrorResume(e -> {
                            log.error("OrchestrateTool error", e);
                            return Flux.just(
                                    StreamEvent.ErrorEvent.builder().error(e.getMessage()).build(),
                                    StreamEvent.ToolResultEvent.builder()
                                            .toolCallId("orchestrate-error")
                                            .result(ToolResult.error(e.getMessage()))
                                            .build());
                        });

            } catch (Exception e) {
                log.error("OrchestrateTool error", e);
                return Flux.just(
                        StreamEvent.ErrorEvent.builder().error(e.getMessage()).build(),
                        StreamEvent.ToolResultEvent.builder()
                                .toolCallId("orchestrate-error")
                                .result(ToolResult.error(e.getMessage()))
                                .build());
            }
        });
    }

    /**
     * Collect all available skills from the context's SkillCatalog.
     */
    private List<SkillPayload> collectSkills(ToolContext context) {
        List<SkillPayload> skills = new ArrayList<>();
        if (context != null && context.getSkillCatalog() != null) {
            for (String name : context.getSkillCatalog().getAllSkillNames()) {
                SkillPayload skill = context.getSkillCatalog().get(name);
                if (skill != null) {
                    skills.add(skill);
                }
            }
        }
        return skills;
    }
}
