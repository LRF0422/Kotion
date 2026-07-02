package com.knowledge.agent.harness;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.SkillPayload;
import com.knowledge.agent.core.engine.StreamEvent;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.orchestrator.AgentTeamPlan;
import com.knowledge.agent.orchestrator.OrchestratorAgent;
import com.knowledge.agent.orchestrator.TeamExecutor;
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
 *
 * <p>
 * Per-request mutable objects ({@link SkillCatalog}, {@link DynamicSkillRegistry},
 * {@link ContextManager}) are created fresh inside {@link #run} on every call
 * and placed onto the {@link ToolContext}. This ensures concurrent requests
 * never share mutable state.
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
    private final ContextManagerConfig contextManagerConfig;
    private final OrchestratorAgent orchestratorAgent;
    private final TeamExecutor teamExecutor;
    private final ObjectMapper objectMapper;

    public AgentHarness(HarnessLoop harnessLoop,
            LlmClientFactory llmClientFactory,
            ToolRegistry toolRegistry,
            SystemPromptBuilder promptBuilder,
            ProgressiveDiscovery progressiveDiscovery,
            SkillSelector skillSelector,
            ContextManagerConfig contextManagerConfig,
            OrchestratorAgent orchestratorAgent,
            TeamExecutor teamExecutor,
            ObjectMapper objectMapper) {
        this.harnessLoop = harnessLoop;
        this.llmClientFactory = llmClientFactory;
        this.toolRegistry = toolRegistry;
        this.promptBuilder = promptBuilder;
        this.progressiveDiscovery = progressiveDiscovery;
        this.skillSelector = skillSelector;
        this.contextManagerConfig = contextManagerConfig;
        this.orchestratorAgent = orchestratorAgent;
        this.teamExecutor = teamExecutor;
        this.objectMapper = objectMapper;
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

        // --- Create per-request state (fresh instances, no shared mutation) ---
        DynamicSkillRegistry dynamicSkillRegistry = new DynamicSkillRegistry();
        SkillCatalog skillCatalog = new SkillCatalog();
        ContextManager contextManager = new ContextManager(contextManagerConfig);

        // Seed the skill catalog with ALL frontend skills (not just selected ones)
        // so that search_skills can discover them on demand
        skillCatalog.seed(skills);

        // Attach per-request instances to the ToolContext so they flow through
        // the entire call chain (HarnessLoop, tools, sub-agents, etc.)
        context.setSkillCatalog(skillCatalog);
        context.setDynamicSkillRegistry(dynamicSkillRegistry);
        context.setContextManager(contextManager);

        // --- Progressive skill discovery ---
        // 1. LLM-based skill pre-filter: keep only skills relevant to the
        // user's latest request. Falls back to always-on + keyword-matched skills on failure.
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

        // Filter backend tool IDs to only those required by selected skills,
        // plus essential tools that should always be available. This prevents
        // tool bloat where every agent task receives all registered backend
        // tools regardless of skill selection.
        Set<String> filteredToolIds = resolveToolIdsFromSkills(selectedSkills);
        // Essential backend tools always available — these are general-purpose
        // tools not owned by any single skill, so they must be explicitly listed
        // to survive the skill-based filtering.
        filteredToolIds.add("delegate");
        filteredToolIds.add("search_skills");
        filteredToolIds.add("present_plan");
        // Web research tools (web_search, web_fetch, dataset_search) are standalone
        // backend tools not referenced by any skill's requiredTools/optionalTools.
        // Without this they are silently dropped from the LLM tool list.
        filteredToolIds.add("web_search");
        filteredToolIds.add("web_fetch");
        filteredToolIds.add("dataset_search");
        // Note: "undo" is a frontend-executed tool delivered via the document-read
        // skill's requiredTools → mergedFrontendTools, not a backend ToolRegistry entry.

        // Intersect with registered tool IDs so we only keep tools that exist
        Set<String> allToolIds = new LinkedHashSet<>();
        for (String id : toolRegistry.getToolIds()) {
            if (filteredToolIds.contains(id)) {
                allToolIds.add(id);
            }
        }

        // Safety net: if nothing matched (e.g., no skills selected, all lookups
        // failed), fall back to the full tool set so the agent is never left
        // with zero backend tools.
        if (allToolIds.isEmpty()) {
            log.info("AgentHarness.run: no tools matched skill requirements, falling back to all backend tools");
            allToolIds = new LinkedHashSet<>(toolRegistry.getToolIds());
        }

        log.info("AgentHarness.run: active backend tools={}, skill-resolved frontend tools={}",
                allToolIds.size(), resolution.getTools().size());

        // --- Auto-orchestration: plan multi-agent team if enabled ---
        // The orchestrator decides whether to decompose the task into
        // specialized agents. When disabled or fast-pathed, it returns a
        // single-agent plan and the normal HarnessLoop path is used.
        AgentTeamPlan plan = orchestratorAgent.plan(messages, selectedSkills, model).block();
        if (plan != null && !plan.isSingleAgent()) {
            log.info("AgentHarness.run: orchestrator planned {} agents with {} strategy",
                    plan.getAgents().size(), plan.getStrategy());
            try {
                context.setOrchestrationPlan(objectMapper.writeValueAsString(plan));
            } catch (Exception e) {
                log.warn("AgentHarness.run: failed to serialize orchestration plan: {}",
                        e.getMessage());
            }
            return teamExecutor.execute(plan, messages, context);
        }

        // Single-agent path (existing behavior)
        return harnessLoop.run(messages, model, allToolIds, systemPrompt, context, 20, mergedFrontendTools);
    }

    /**
     * Collect all tool names declared by the given skills via
     * {@code requiredTools} and {@code optionalTools}.
     *
     * <p>
     * Tool names in {@link SkillPayload} correspond directly to tool IDs in
     * the {@link ToolRegistry} (the tool ID is used as the function name sent
     * to the LLM).
     *
     * @param skills selected skills (may be null or empty)
     * @return set of tool name strings (never null)
     */
    private Set<String> resolveToolIdsFromSkills(List<SkillPayload> skills) {
        Set<String> names = new HashSet<>();
        if (skills == null) {
            return names;
        }
        for (SkillPayload skill : skills) {
            if (skill.getRequiredTools() != null) {
                names.addAll(skill.getRequiredTools());
            }
            if (skill.getOptionalTools() != null) {
                names.addAll(skill.getOptionalTools());
            }
        }
        return names;
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
