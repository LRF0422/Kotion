package com.knowledge.agent.tool;

import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.SkillPayload;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Progressive tool discovery.
 * Resolves requiredCapabilities strings (e.g., "search", "read") to concrete
 * tool sets.
 *
 * This maps capability keywords to tool IDs, allowing SubAgents to receive
 * minimal tool sets based on their requiredCapabilities from the delegate call.
 *
 * Also resolves frontend-provided {@link SkillPayload}s: validates their
 * requiredTools/optionalTools against the backend {@link ToolRegistry} and
 * collects systemPromptFragments for injection into the system prompt.
 */
@Slf4j
@Component
public class ProgressiveDiscovery {

    /**
     * Maps capability keywords to tool IDs.
     * Populated during tool registration and configurable via YAML.
     */
    private final Map<String, Set<String>> capabilityMap = new LinkedHashMap<>();

    public ProgressiveDiscovery() {
        // Default capability mappings (tools will add themselves during registration)
        capabilityMap.put("search", new LinkedHashSet<>());
        capabilityMap.put("read", new LinkedHashSet<>());
        capabilityMap.put("write", new LinkedHashSet<>());
        capabilityMap.put("web", new LinkedHashSet<>());
        capabilityMap.put("data", new LinkedHashSet<>());
    }

    /**
     * Register a tool ID under a capability.
     */
    public void registerCapability(String capability, String toolId) {
        capabilityMap.computeIfAbsent(capability, k -> new LinkedHashSet<>()).add(toolId);
    }

    /**
     * Resolve a list of required capabilities to a set of tool IDs.
     *
     * @param capabilities e.g., ["search", "read"]
     * @return set of tool IDs matching those capabilities
     */
    public Set<String> resolve(Collection<String> capabilities) {
        Set<String> result = new LinkedHashSet<>();
        if (capabilities == null) {
            return result;
        }
        for (String cap : capabilities) {
            Set<String> toolIds = capabilityMap.get(cap);
            if (toolIds != null) {
                result.addAll(toolIds);
            } else {
                log.warn("Unknown capability: {}", cap);
            }
        }
        return result;
    }

    /**
     * Get all known capabilities.
     */
    public Set<String> getCapabilities() {
        return Collections.unmodifiableSet(capabilityMap.keySet());
    }

    // -------------------------------------------------------------------------
    // Frontend skill resolution
    // -------------------------------------------------------------------------

    /**
     * Result of resolving frontend {@link SkillPayload}s.
     *
     * <p>
     * Contains the full {@link ChatTool} definitions contributed by the
     * activated skills (to be merged into the request's {@code frontendTools})
     * and the concatenated prompt fragment from all skills that define a
     * {@code systemPromptFragment}.
     */
    public static class SkillResolution {
        private final List<ChatTool> tools;
        private final String promptFragment;

        public SkillResolution(List<ChatTool> tools, String promptFragment) {
            this.tools = tools;
            this.promptFragment = promptFragment;
        }

        public List<ChatTool> getTools() {
            return tools;
        }

        public String getPromptFragment() {
            return promptFragment;
        }
    }

    /**
     * Resolve a list of frontend {@link SkillPayload}s into a combined set of
     * {@link ChatTool} definitions plus a merged system prompt fragment.
     *
     * <p>
     * For each skill:
     * <ul>
     * <li>{@code tools} — every provided {@link ChatTool} is collected and
     * deduplicated by function name. These are later merged into the
     * caller's {@code frontendTools} list so the LLM receives the skill's
     * tools as frontend (bidirectional) tools rather than backend tool IDs.</li>
     * <li>If the skill defines a {@code systemPromptFragment}, it is appended
     * to the combined prompt fragment.</li>
     * </ul>
     *
     * @param skills   skills sent from the frontend (may be null or empty)
     * @param registry retained for signature compatibility; no longer used
     *                 for lookup since skills now carry their own tool specs
     * @return a {@link SkillResolution} with resolved tools and prompt
     */
    public SkillResolution resolveSkills(List<SkillPayload> skills, ToolRegistry registry) {
        // Deduplicate by function name; preserves insertion order
        Map<String, ChatTool> resolvedTools = new LinkedHashMap<>();
        StringBuilder promptBuilder = new StringBuilder();

        if (skills == null || skills.isEmpty()) {
            return new SkillResolution(new ArrayList<>(resolvedTools.values()), promptBuilder.toString());
        }

        for (SkillPayload skill : skills) {
            log.debug("Resolving frontend skill: name={}, source={}, tools={}",
                    skill.getName(), skill.getSource(),
                    skill.getTools() != null ? skill.getTools().size() : 0);

            // Collect full ChatTool definitions supplied by the frontend.
            if (skill.getTools() != null) {
                for (ChatTool tool : skill.getTools()) {
                    if (tool == null || tool.getFunction() == null
                            || tool.getFunction().getName() == null
                            || tool.getFunction().getName().isEmpty()) {
                        log.warn("Skill '{}' contains an invalid tool entry (missing function name); skipping",
                                skill.getName());
                        continue;
                    }
                    resolvedTools.putIfAbsent(tool.getFunction().getName(), tool);
                }
            }

            // Collect systemPromptFragment
            if (skill.getSystemPromptFragment() != null && !skill.getSystemPromptFragment().isEmpty()) {
                promptBuilder.append(skill.getSystemPromptFragment()).append("\n\n");
            }
        }

        List<ChatTool> toolList = new ArrayList<>(resolvedTools.values());
        log.info("Resolved {} frontend skill(s) → {} tool(s), promptFragment length={}",
                skills.size(), toolList.size(), promptBuilder.length());

        return new SkillResolution(toolList, promptBuilder.toString().trim());
    }
}
