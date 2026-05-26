package com.knowledge.agent.harness;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.SkillPayload;
import com.knowledge.agent.core.engine.StreamEvent;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.tool.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.*;

/**
 * Main entry point for the agent harness.
 * Replaces LeaderAgent + AgentEngine with a simpler, unified design.
 *
 * The agent autonomously decides whether to work solo or spawn sub-agents
 * via the `delegate` tool — no upfront mode decision needed.
 */
@Slf4j
@Component
public class AgentHarness {

    private final HarnessLoop harnessLoop;
    private final LlmClientFactory llmClientFactory;
    private final ToolRegistry toolRegistry;
    private final SystemPromptBuilder promptBuilder;
    private final ProgressiveDiscovery progressiveDiscovery;
    private final SkillSelector skillSelector;
    private final SkillCatalog skillCatalog;
    private final DynamicSkillRegistry dynamicSkillRegistry;

    public AgentHarness(HarnessLoop harnessLoop,
            LlmClientFactory llmClientFactory,
            ToolRegistry toolRegistry,
            SystemPromptBuilder promptBuilder,
            ProgressiveDiscovery progressiveDiscovery,
            SkillSelector skillSelector,
            SkillCatalog skillCatalog,
            DynamicSkillRegistry dynamicSkillRegistry) {
        this.harnessLoop = harnessLoop;
        this.llmClientFactory = llmClientFactory;
        this.toolRegistry = toolRegistry;
        this.promptBuilder = promptBuilder;
        this.progressiveDiscovery = progressiveDiscovery;
        this.skillSelector = skillSelector;
        this.skillCatalog = skillCatalog;
        this.dynamicSkillRegistry = dynamicSkillRegistry;
    }

    /**
     * Run the agent harness for a chat request.
     *
     * @param messages      conversation messages
     * @param model         model name (can be null for default)
     * @param userId        user ID
     * @param frontendTools tools from the frontend (for bidirectional pattern)
     * @param context       tool execution context
     * @return Flux of StreamEvent
     */
    public Flux<StreamEvent> run(List<ChatMessage> messages,
            String model,
            Long userId,
            List<ChatTool> frontendTools,
            ToolContext context) {
        return run(messages, model, userId, frontendTools, context, null);
    }

    /**
     * Run the agent harness for a chat request with frontend skills.
     *
     * <p>
     * Performs progressive skill discovery: resolves each skill's
     * {@code requiredTools} and {@code optionalTools} against the backend
     * {@link ToolRegistry}, merges the resolved tool IDs into the active
     * tool set, and splices each skill's {@code systemPromptFragment} into
     * the system prompt.
     *
     * @param skills skills sent from the frontend for progressive discovery
     */
    public Flux<StreamEvent> run(List<ChatMessage> messages,
            String model,
            Long userId,
            List<ChatTool> frontendTools,
            ToolContext context,
            List<SkillPayload> skills) {
        log.info("AgentHarness.run: model={}, messages={}, userId={}, frontendTools={}, skills={}",
                model, messages != null ? messages.size() : 0, userId,
                frontendTools != null ? frontendTools.size() : 0,
                skills != null ? skills.size() : 0);

        // --- Reset per-request state ---
        // Clear dynamic skill registry from previous requests
        dynamicSkillRegistry.clear();
        // Seed the skill catalog with ALL frontend skills (not just selected ones)
        // so that search_skills can discover them on demand
        skillCatalog.seed(skills);

        // --- Progressive skill discovery ---
        // 1. LLM-based skill pre-filter: keep only skills relevant to the
        // user's latest request. Falls back to the full list on failure.
        //
        // When search_skills is available, we can be more aggressive with
        // filtering: only pre-activate clearly relevant skills, and let the
        // LLM discover the rest via search_skills.
        List<SkillPayload> selectedSkills = skillSelector.select(messages, skills, model);

        // 2. Collect ChatTool definitions carried by each activated skill and
        // merge the skill prompt fragments.
        ProgressiveDiscovery.SkillResolution resolution = progressiveDiscovery.resolveSkills(
                selectedSkills, toolRegistry);

        // 3. Merge skill-provided tools into frontendTools (deduped by function
        // name) so the LLM receives them through the bidirectional frontend
        // tool channel instead of as backend tool IDs.
        List<ChatTool> mergedFrontendTools = mergeFrontendTools(frontendTools, resolution.getTools());

        // Build system prompt — include ToolContext for time/user info and
        // skill prompt fragments so the LLM follows skill-specific instructions
        String systemPrompt = promptBuilder.build(
                toolRegistry.getAll(), mergedFrontendTools, context, resolution.getPromptFragment());

        // All registered backend tools remain available to the LLM; skill tools
        // are injected via mergedFrontendTools rather than toolIds.
        Set<String> allToolIds = new LinkedHashSet<>(toolRegistry.getToolIds());

        log.info("AgentHarness.run: active backend tools={}, skill-resolved frontend tools={}",
                allToolIds.size(), resolution.getTools().size());

        return harnessLoop.run(messages, model, allToolIds, systemPrompt, context, 20, mergedFrontendTools);
    }

    /**
     * Merge skill-resolved {@link ChatTool}s into the request's frontendTools,
     * deduplicating by function name. Request-supplied tools take precedence.
     */
    private List<ChatTool> mergeFrontendTools(List<ChatTool> frontendTools, List<ChatTool> skillTools) {
        Map<String, ChatTool> merged = new LinkedHashMap<>();
        if (frontendTools != null) {
            for (ChatTool ft : frontendTools) {
                if (ft != null && ft.getFunction() != null && ft.getFunction().getName() != null) {
                    merged.put(ft.getFunction().getName(), ft);
                }
            }
        }
        if (skillTools != null) {
            for (ChatTool st : skillTools) {
                if (st != null && st.getFunction() != null && st.getFunction().getName() != null) {
                    merged.putIfAbsent(st.getFunction().getName(), st);
                }
            }
        }
        return new ArrayList<>(merged.values());
    }
}
