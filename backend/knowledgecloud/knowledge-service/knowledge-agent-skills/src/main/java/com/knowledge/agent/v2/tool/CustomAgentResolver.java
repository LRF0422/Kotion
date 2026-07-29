package com.knowledge.agent.v2.tool;

import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Resolves tenant-scoped custom agent definitions for {@code delegate_task}
 * (and the chat entry point). Implemented by the agent-definition service;
 * an {@code ObjectProvider} keeps the delegate tool functional when the
 * custom-agent feature is not present.
 */
public interface CustomAgentResolver {

    /**
     * Look up an enabled custom agent by name within a tenant.
     *
     * @param agentName the agent name (unique per tenant)
     * @param tenantId  the tenant scope
     * @return the spec, or empty when no enabled agent matches
     */
    Optional<CustomAgentSpec> resolve(String agentName, Long tenantId);

    /**
     * List the enabled custom agents available in a tenant (name + description),
     * used for delegation-target discovery in error messages.
     */
    List<CustomAgentSpec> listAvailable(Long tenantId);

    /**
     * Immutable view of a custom agent definition, decoupled from the
     * persistence entity.
     */
    class CustomAgentSpec {
        private final String name;
        private final String description;
        private final String systemPrompt;
        private final String modelName;
        /** Backend tool ids this agent may use; empty = all backend tools. */
        private final Set<String> toolIds;
        /** Max iterations; {@code null} = engine default. */
        private final Integer maxIterations;

        public CustomAgentSpec(String name, String description, String systemPrompt,
                String modelName, Set<String> toolIds, Integer maxIterations) {
            this.name = name;
            this.description = description;
            this.systemPrompt = systemPrompt;
            this.modelName = modelName;
            this.toolIds = toolIds;
            this.maxIterations = maxIterations;
        }

        public String getName() {
            return name;
        }

        public String getDescription() {
            return description;
        }

        public String getSystemPrompt() {
            return systemPrompt;
        }

        public String getModelName() {
            return modelName;
        }

        public Set<String> getToolIds() {
            return toolIds;
        }

        public Integer getMaxIterations() {
            return maxIterations;
        }
    }
}
