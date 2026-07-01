package com.knowledge.agent.tool;

import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.SkillPayload;
import lombok.extern.slf4j.Slf4j;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Request-scoped registry that holds tools from dynamically activated skills.
 *
 * <p>
 * When the LLM calls {@link SearchSkillsTool} with {@code activate: "skill_name"},
 * the skill's {@link ChatTool} definitions and {@code systemPromptFragment} are
 * registered here. Before each loop iteration, {@link HarnessLoop} reads the
 * accumulated tools and prompt fragments and merges them into the LLM request.
 *
 * <p>
 * This is the bridge between the skill-discovery layer (SearchSkillsTool +
 * SkillCatalog) and the execution layer (HarnessLoop).
 *
 * <p>
 * <b>Per-request lifecycle:</b> This class is NOT a Spring bean. A fresh
 * instance is created at the start of each request by {@code AgentHarness.run()}
 * and passed through {@code ToolContext} to all components that need it.
 * This eliminates the race condition where concurrent requests would corrupt
 * each other's state on a shared singleton.
 *
 * <h3>Lifecycle</h3>
 * <ol>
 * <li>A new instance is created at the start of each request</li>
 * <li>{@link #registerSkill(SkillPayload)} is called by SearchSkillsTool</li>
 * <li>{@link #getActiveTools()} / {@link #getPromptFragment()} are called by
 *     HarnessLoop before each iteration</li>
 * </ol>
 */
@Slf4j
public class DynamicSkillRegistry {

    /** Tools from dynamically activated skills, keyed by function name. */
    private final Map<String, ChatTool> activeTools = new ConcurrentHashMap<>();

    /** Accumulated system prompt fragments from activated skills. */
    private StringJoiner promptFragment = new StringJoiner("\n\n");

    /** Names of skills that have been activated. */
    private final Set<String> activatedSkillNames = ConcurrentHashMap.newKeySet();

    // ---- Lifecycle ----

    /**
     * Clear all dynamic registrations (start of request).
     */
    public void clear() {
        activeTools.clear();
        promptFragment = new StringJoiner("\n\n");
        activatedSkillNames.clear();
    }

    // ---- Registration ----

    /**
     * Register a skill's tools and prompt fragment.
     * Called by {@link SearchSkillsTool} when a skill is activated.
     *
     * @param skill the activated skill payload
     */
    public void registerSkill(SkillPayload skill) {
        if (skill == null || skill.getName() == null) {
            return;
        }

        if (activatedSkillNames.contains(skill.getName())) {
            log.debug("DynamicSkillRegistry: skill '{}' already registered, skipping", skill.getName());
            return;
        }

        // Register tool definitions
        if (skill.getTools() != null) {
            for (ChatTool tool : skill.getTools()) {
                if (tool != null && tool.getFunction() != null
                        && tool.getFunction().getName() != null
                        && !tool.getFunction().getName().isEmpty()) {
                    activeTools.putIfAbsent(tool.getFunction().getName(), tool);
                    log.debug("DynamicSkillRegistry: registered tool '{}'", tool.getFunction().getName());
                }
            }
        }

        // Accumulate prompt fragment
        if (skill.getSystemPromptFragment() != null && !skill.getSystemPromptFragment().isEmpty()) {
            promptFragment.add(skill.getSystemPromptFragment());
        }

        activatedSkillNames.add(skill.getName());
        log.info("DynamicSkillRegistry: registered skill '{}' → {} tool(s)",
                skill.getName(), skill.getTools() != null ? skill.getTools().size() : 0);
    }

    // ---- Read ----

    /**
     * Get all dynamically activated tool definitions.
     */
    public List<ChatTool> getActiveTools() {
        return new ArrayList<>(activeTools.values());
    }

    /**
     * Get the number of active tools.
     */
    public int getActiveToolCount() {
        return activeTools.size();
    }

    /**
     * Get the accumulated system prompt fragment from activated skills.
     */
    public String getPromptFragment() {
        return promptFragment.toString().trim();
    }

    /**
     * Get the set of activated skill names.
     */
    public Set<String> getActivatedSkillNames() {
        return Collections.unmodifiableSet(activatedSkillNames);
    }

    /**
     * Check if there are any dynamically activated tools.
     */
    public boolean hasActiveTools() {
        return !activeTools.isEmpty();
    }
}
