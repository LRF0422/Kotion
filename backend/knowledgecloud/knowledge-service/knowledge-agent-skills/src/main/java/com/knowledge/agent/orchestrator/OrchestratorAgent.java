package com.knowledge.agent.orchestrator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.api.dto.SkillPayload;
import com.knowledge.agent.llm.LlmClient;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmRequest;
import com.knowledge.agent.llm.LlmResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Pre-loop orchestrator that decomposes a user task into a team of
 * specialized agents.
 *
 * <p>
 * Called by {@code AgentHarness} <b>before</b> the main HarnessLoop starts.
 * If the plan is multi-agent, {@code TeamExecutor} runs the team; otherwise
 * the normal single-agent path is used.
 *
 * <p>
 * <b>Fast-path logic</b> — avoids the LLM planning call when the task is
 * clearly simple:
 * <ol>
 * <li>If orchestration is disabled ({@code agent.orchestrator.enabled=false})
 *     → {@code singleAgent()}</li>
 * <li>If the latest user message is shorter than
 *     {@code agent.orchestrator.fast-path-message-length} → {@code singleAgent()}</li>
 * <li>If keyword matching finds exactly 1 relevant skill → {@code singleAgent()}</li>
 * </ol>
 *
 * <p>
 * <b>Safe fallback</b>: on any error (LLM failure, JSON parse failure,
 * timeout), the orchestrator returns {@code singleAgent()} so the agent
 * still works — just without multi-agent decomposition.
 */
@Slf4j
@Component
public class OrchestratorAgent {

    private static final String ORCHESTRATOR_SYSTEM_PROMPT =
            "You are a task orchestrator. Given the user's task and available skills, "
                    + "decompose it into specialized agents. Each agent should focus on one domain. "
                    + "Output JSON: {\"strategy\": \"PARALLEL|SEQUENTIAL\", \"agents\": [{"
                    + "\"agentId\": \"reader\", \"name\": \"Document Reader\", "
                    + "\"description\": \"...\", \"systemPrompt\": \"You are a document reader...\", "
                    + "\"requiredSkillNames\": [\"content-analysis\"], \"dependencies\": [], "
                    + "\"estimatedSteps\": 3}], \"synthesisPrompt\": \"Combine the results...\"}. "
                    + "For simple tasks, return {\"strategy\": \"SINGLE\"}. "
                    + "Respond with raw JSON only.";

    private final LlmClientFactory llmClientFactory;
    private final ObjectMapper objectMapper;
    private final AgentDefinitionStore definitionStore;

    @Value("${agent.orchestrator.enabled:false}")
    private boolean enabled;

    @Value("${agent.orchestrator.fast-path-message-length:200}")
    private int fastPathMessageLength;

    public OrchestratorAgent(LlmClientFactory llmClientFactory,
            ObjectMapper objectMapper,
            AgentDefinitionStore definitionStore) {
        this.llmClientFactory = llmClientFactory;
        this.objectMapper = objectMapper;
        this.definitionStore = definitionStore;
    }

    /**
     * Plan the agent team for the given conversation.
     *
     * @param messages        the full conversation messages
     * @param availableSkills skills selected by SkillSelector (may be null/empty)
     * @param model           model name for the planning LLM call (null = default)
     * @return a {@link Mono} of {@link AgentTeamPlan}; never null
     */
    public Mono<AgentTeamPlan> plan(List<ChatMessage> messages,
            List<SkillPayload> availableSkills,
            String model) {
        return Mono.fromCallable(() -> doPlan(messages, availableSkills, model))
                .onErrorResume(e -> {
                    log.warn("OrchestratorAgent planning failed, falling back to single-agent: {}",
                            e.getMessage());
                    return Mono.just(AgentTeamPlan.singleAgent());
                });
    }

    private AgentTeamPlan doPlan(List<ChatMessage> messages,
            List<SkillPayload> availableSkills,
            String model) {

        // --- Fast-path 1: orchestrator disabled ---
        if (!enabled) {
            log.debug("OrchestratorAgent: disabled, using single-agent path");
            return AgentTeamPlan.singleAgent();
        }

        // --- Fast-path 2: message too short ---
        String latestUserMessage = getLatestUserMessage(messages);
        if (latestUserMessage == null || latestUserMessage.isEmpty()) {
            log.debug("OrchestratorAgent: no user message, using single-agent path");
            return AgentTeamPlan.singleAgent();
        }
        if (latestUserMessage.length() < fastPathMessageLength) {
            log.debug("OrchestratorAgent: message too short ({} < {}), using single-agent path",
                    latestUserMessage.length(), fastPathMessageLength);
            return AgentTeamPlan.singleAgent();
        }

        // --- Fast-path 3: exactly 1 relevant skill via keyword matching ---
        List<SkillPayload> relevantSkills = keywordMatchSkills(latestUserMessage, availableSkills);
        if (relevantSkills.size() == 1) {
            log.debug("OrchestratorAgent: exactly 1 relevant skill ({}), using single-agent path",
                    relevantSkills.get(0).getName());
            return AgentTeamPlan.singleAgent();
        }

        // --- LLM planning call ---
        log.info("OrchestratorAgent: planning for message (length={}), skills={}",
                latestUserMessage.length(), relevantSkills.size());
        return planWithLlm(latestUserMessage, relevantSkills, model);
    }

    /**
     * Make the LLM planning call and parse the JSON response.
     */
    private AgentTeamPlan planWithLlm(String userMessage,
            List<SkillPayload> skills,
            String model) {
        try {
            // Build the skill catalog description for the prompt
            StringBuilder skillCatalog = new StringBuilder();
            if (skills != null && !skills.isEmpty()) {
                skillCatalog.append("\n\nAvailable skills:\n");
                for (SkillPayload skill : skills) {
                    skillCatalog.append("- ").append(skill.getName());
                    if (skill.getDescription() != null && !skill.getDescription().isEmpty()) {
                        skillCatalog.append(": ").append(skill.getDescription());
                    }
                    skillCatalog.append("\n");
                }
            }

            // Build the user message for the planning call
            String planningUserMessage = "User task: " + userMessage + skillCatalog;

            List<ChatMessage> planningMessages = new ArrayList<>();
            planningMessages.add(ChatMessage.builder()
                    .role("system")
                    .content(ORCHESTRATOR_SYSTEM_PROMPT)
                    .build());
            planningMessages.add(ChatMessage.builder()
                    .role("user")
                    .content(planningUserMessage)
                    .build());

            LlmRequest request = LlmRequest.builder()
                    .model(model)
                    .temperature(0.0)
                    .maxTokens(1000)
                    .messages(planningMessages)
                    .toolChoice("none")
                    .stream(false)
                    .build();

            LlmClient client = llmClientFactory.getClientForModel(model);
            LlmResponse response = client.chat(request);

            if (response == null || response.getContent() == null || response.getContent().isEmpty()) {
                log.warn("OrchestratorAgent: empty LLM response, falling back to single-agent");
                return AgentTeamPlan.singleAgent();
            }

            AgentTeamPlan parsedPlan = parsePlanResponse(response.getContent());

            // Fix 2: Persist generated agent definitions for future reuse (best-effort)
            if (parsedPlan.getAgents() != null) {
                for (AgentSpec spec : parsedPlan.getAgents()) {
                    try {
                        definitionStore.save(spec);
                    } catch (Exception e) {
                        log.warn("Failed to persist agent definition '{}': {}",
                                spec.getName(), e.getMessage());
                    }
                }
            }

            return parsedPlan;

        } catch (Exception e) {
            log.warn("OrchestratorAgent: LLM planning call failed: {}", e.getMessage());
            return AgentTeamPlan.singleAgent();
        }
    }

    /**
     * Parse the LLM's JSON response into an {@link AgentTeamPlan}.
     * Falls back to {@code singleAgent()} on any parse error.
     */
    AgentTeamPlan parsePlanResponse(String json) {
        try {
            // Strip markdown code fences if present
            String cleaned = json.trim();
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.replaceAll("^```(?:json)?\\s*", "")
                        .replaceAll("\\s*```$", "");
            }

            JsonNode root = objectMapper.readTree(cleaned);

            // Check for SINGLE strategy
            String strategyStr = root.has("strategy") ? root.get("strategy").asText() : "SINGLE";
            OrchestrationStrategy strategy;
            try {
                strategy = OrchestrationStrategy.valueOf(strategyStr.toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                strategy = OrchestrationStrategy.SINGLE;
            }

            if (strategy == OrchestrationStrategy.SINGLE) {
                log.info("OrchestratorAgent: LLM returned SINGLE strategy");
                return AgentTeamPlan.singleAgent();
            }

            JsonNode agentsNode = root.get("agents");
            if (agentsNode == null || !agentsNode.isArray() || agentsNode.size() == 0) {
                log.info("OrchestratorAgent: no agents in plan, falling back to single-agent");
                return AgentTeamPlan.singleAgent();
            }

            List<AgentSpec> agents = new ArrayList<>();
            for (JsonNode agentNode : agentsNode) {
                // requiredSkillNames
                List<String> skillNames = new ArrayList<>();
                JsonNode skillsNode = agentNode.get("requiredSkillNames");
                if (skillsNode != null && skillsNode.isArray()) {
                    for (JsonNode s : skillsNode) {
                        skillNames.add(s.asText());
                    }
                }

                // dependencies
                List<String> deps = new ArrayList<>();
                JsonNode depsNode = agentNode.get("dependencies");
                if (depsNode != null && depsNode.isArray()) {
                    for (JsonNode d : depsNode) {
                        deps.add(d.asText());
                    }
                }

                AgentSpec spec = AgentSpec.builder()
                        .agentId(getTextOrNull(agentNode, "agentId"))
                        .name(getTextOrNull(agentNode, "name"))
                        .description(getTextOrNull(agentNode, "description"))
                        .systemPrompt(getTextOrNull(agentNode, "systemPrompt"))
                        .requiredSkillNames(skillNames)
                        .dependencies(deps)
                        .estimatedSteps(getIntOr(agentNode, "estimatedSteps", 3))
                        .build();

                // Ensure agentId and name are non-null
                if (spec.getAgentId() == null || spec.getAgentId().isEmpty()) {
                    spec.setAgentId("agent-" + agents.size());
                }
                if (spec.getName() == null || spec.getName().isEmpty()) {
                    spec.setName(spec.getAgentId());
                }
                if (spec.getDescription() == null) {
                    spec.setDescription("");
                }

                agents.add(spec);
            }

            String synthesisPrompt = getTextOrNull(root, "synthesisPrompt");

            AgentTeamPlan plan = AgentTeamPlan.builder()
                    .agents(agents)
                    .strategy(strategy)
                    .synthesisPrompt(synthesisPrompt)
                    .build();

            log.info("OrchestratorAgent: planned {} agents with {} strategy",
                    agents.size(), strategy);
            return plan;

        } catch (Exception e) {
            log.warn("OrchestratorAgent: failed to parse plan response: {}", e.getMessage());
            return AgentTeamPlan.singleAgent();
        }
    }

    // ---- Fast-path helpers ----

    /**
     * Find skills whose name or description contains keywords from the user
     * message. Returns the subset of {@code skills} that match.
     */
    private List<SkillPayload> keywordMatchSkills(String userMessage, List<SkillPayload> skills) {
        if (skills == null || skills.isEmpty()) {
            return Collections.emptyList();
        }
        String msgLower = userMessage.toLowerCase(Locale.ROOT);
        List<SkillPayload> matched = new ArrayList<>();
        for (SkillPayload skill : skills) {
            if (matchesSkill(userMessage, msgLower, skill)) {
                matched.add(skill);
            }
        }
        return matched;
    }

    private boolean matchesSkill(String originalMessage, String lowerMessage, SkillPayload skill) {
        // Match on skill name
        if (skill.getName() != null) {
            String nameLower = skill.getName().toLowerCase(Locale.ROOT);
            if (nameLower.length() > 2 && lowerMessage.contains(nameLower)) {
                return true;
            }
        }
        // Match on skill description keywords
        if (skill.getDescription() != null) {
            String descLower = skill.getDescription().toLowerCase(Locale.ROOT);
            // Extract significant words from description (length > 3)
            String[] words = descLower.split("[\\s,.;:!?/()-]+");
            for (String word : words) {
                if (word.length() > 4 && lowerMessage.contains(word)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Extract the latest user message from the conversation.
     */
    private String getLatestUserMessage(List<ChatMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return null;
        }
        for (int i = messages.size() - 1; i >= 0; i--) {
            ChatMessage msg = messages.get(i);
            if ("user".equals(msg.getRole()) && msg.getContent() != null) {
                return msg.getContent();
            }
        }
        return null;
    }

    // ---- JSON helpers ----

    private String getTextOrNull(JsonNode node, String field) {
        if (node.has(field) && !node.get(field).isNull()) {
            return node.get(field).asText();
        }
        return null;
    }

    private int getIntOr(JsonNode node, String field, int defaultValue) {
        if (node.has(field) && node.get(field).isInt()) {
            return node.get(field).asInt();
        }
        return defaultValue;
    }
}
