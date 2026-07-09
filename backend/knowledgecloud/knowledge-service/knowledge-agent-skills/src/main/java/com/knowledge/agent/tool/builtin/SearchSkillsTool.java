package com.knowledge.agent.tool.builtin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatFunction;
import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.SkillPayload;
import com.knowledge.agent.tool.*;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONArray;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Meta-tool that lets the LLM discover and activate skills on demand.
 *
 * <p>
 * When the agent has many skills, loading all of them upfront would bloat
 * the LLM context and dilute tool-selection attention. Instead, this tool
 * lets the LLM search for relevant skills and activate them dynamically.
 * Activated skills' tool definitions are injected into the next loop
 * iteration's {@code toolsJson} so the LLM can call them.
 *
 * <h3>Usage pattern</h3>
 * <pre>
 * 1. LLM: "I need to translate text but don't have a translation tool."
 * 2. LLM calls: search_skills({query: "translation", activate: "translation"})
 * 3. Tool returns: "Activated skill 'translation'. New tools: translate_text, detect_language"
 * 4. Next iteration: translate_text is available in the LLM's tool list
 * 5. LLM calls: translate_text({text: "Hello", target: "fr"})
 * </pre>
 *
 * <h3>Architecture</h3>
 * <ul>
 * <li>{@link SkillCatalog} holds all available skills (seeded per-request)</li>
 * <li>{@link #execute(ToolContext, String)} searches and optionally activates</li>
 * <li>Activated skills' tools are stored in {@link DynamicSkillRegistry}
 *     which HarnessLoop reads before each iteration</li>
 * </ul>
 *
 * <p>
 * This tool remains a Spring {@code @Component} singleton — it is stateless.
 * The per-request {@link SkillCatalog} and {@link DynamicSkillRegistry}
 * instances are obtained from the {@link ToolContext} at execution time.
 */
@Slf4j
@Component
public class SearchSkillsTool implements Tool {

    private final ObjectMapper objectMapper;

    /** Maximum skills to return from a search. */
    private static final int MAX_SEARCH_RESULTS = 5;

    public SearchSkillsTool(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public String getId() {
        return "search_skills";
    }

    @Override
    public String getDescription() {
        return "Search for available skills by keyword/domain and optionally activate them. "
                + "Use this when you need capabilities not currently available. "
                + "Activated skills will add new tools you can use in subsequent turns.";
    }

    @Override
    public String getJsonSchema() {
        return "{\"type\":\"object\",\"properties\":{"
                + "\"query\":{\"type\":\"string\",\"description\":\"What you need, e.g. 'translation', 'page editing', 'data analysis'\"},"
                + "\"activate\":{\"type\":\"string\",\"description\":\"Name of a skill to activate immediately (from search results). Optional.\"}"
                + "},\"required\":[\"query\"]}";
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        try {
            JsonNode root = objectMapper.readTree(args);
            String query = root.has("query") ? root.get("query").asText() : "";
            String activate = root.has("activate") ? root.get("activate").asText() : null;

            if (query.isEmpty()) {
                return ToolResult.error("query is required");
            }

            // 1. Get per-request instances from context
            SkillCatalog skillCatalog = context.getSkillCatalog();
            DynamicSkillRegistry dynamicSkillRegistry = context.getDynamicSkillRegistry();

            if (skillCatalog == null || dynamicSkillRegistry == null) {
                return ToolResult.error("Skill catalog or dynamic registry not available in this context");
            }

            // 2. Search the catalog
            List<SkillPayload> matches = skillCatalog.search(query);

            if (matches.isEmpty()) {
                return ToolResult.success("No skills found matching '" + query + "'. "
                        + "Available domains: " + getAvailableDomains(skillCatalog));
            }

            // 3. Build search result summary
            StringBuilder result = new StringBuilder();
            result.append("Found ").append(matches.size()).append(" skill(s) matching '")
                    .append(query).append("':\n\n");

            List<String> skillNamesForActivation = new ArrayList<>();
            for (int i = 0; i < Math.min(matches.size(), MAX_SEARCH_RESULTS); i++) {
                SkillPayload skill = matches.get(i);
                result.append(i + 1).append(". **").append(skill.getName()).append("**");
                if (skill.getDomain() != null) {
                    result.append(" [").append(skill.getDomain()).append("]");
                }
                result.append("\n   ").append(skill.getDescription() != null ? skill.getDescription() : "");
                if (skill.getTools() != null && !skill.getTools().isEmpty()) {
                    result.append("\n   Tools:\n");
                    for (ChatTool t : skill.getTools()) {
                        if (t.getFunction() != null && t.getFunction().getName() != null) {
                            result.append("     - ").append(formatToolSummary(t));
                            result.append("\n");
                        }
                    }
                }
                result.append("\n\n");
                skillNamesForActivation.add(skill.getName());
            }

            // 4. Auto-activate if requested
            if (activate != null && !activate.isEmpty()) {
                SkillPayload activated = skillCatalog.activate(activate);
                if (activated != null) {
                    dynamicSkillRegistry.registerSkill(activated);
                    result.append("---\nActivated skill '").append(activate).append("'. ");
                    result.append(dynamicSkillRegistry.getActiveToolCount()).append(" total active tools now.\n");
                    result.append("The tool schemas (with full parameter definitions) are now loaded. ");
                    result.append("Call the tools in your NEXT response to ensure correct parameters.");
                } else {
                    result.append("---\nCould not activate '").append(activate).append("' — ");
                    if (!skillCatalog.getAllSkillNames().contains(activate)) {
                        result.append("skill not found in catalog.");
                    } else if (skillCatalog.isActivated(activate)) {
                        result.append("skill is already active.");
                    } else {
                        result.append("unknown error.");
                    }
                }
            } else {
                // Hint to the LLM
                result.append("To activate a skill, call search_skills again with {query: \"...\", activate: \"skill_name\"}.");
            }

            return ToolResult.success(result.toString());

        } catch (Exception e) {
            log.error("SearchSkillsTool error", e);
            return ToolResult.error("Error searching skills: " + e.getMessage());
        }
    }

    /**
     * Get a summary of available domains for the help message.
     */
    private String getAvailableDomains(SkillCatalog skillCatalog) {
        Set<String> domains = new LinkedHashSet<>();
        for (String name : skillCatalog.getAllSkillNames()) {
            SkillPayload skill = skillCatalog.get(name);
            if (skill != null && skill.getDomain() != null) {
                domains.add(skill.getDomain());
            }
        }
        if (domains.isEmpty()) {
            return "(none defined)";
        }
        return String.join(", ", domains);
    }

    /**
     * Format a tool definition as a compact one-liner with parameter
     * signatures so the LLM knows the correct parameter names and types
     * before the skill is activated.
     *
     * <p>Example output:
     * <pre>
     * addBitableRecord(bitableId: string, record: object): Add a record to a table
     * </pre>
     *
     * <p>Required parameters are listed first (marked with *), optional ones
     * follow. If the JSON Schema is missing or malformed, falls back to just
     * the tool name.
     */
    private String formatToolSummary(ChatTool tool) {
        if (tool.getFunction() == null) {
            return "";
        }
        ChatFunction fn = tool.getFunction();
        StringBuilder sb = new StringBuilder();
        sb.append(fn.getName()).append("(");

        JSONObject params = fn.getParameters();
        if (params != null) {
            JSONObject properties = params.getJSONObject("properties");
            JSONArray required = params.getJSONArray("required");
            Set<String> requiredSet = new LinkedHashSet<>();
            if (required != null) {
                for (Object r : required) {
                    if (r != null) requiredSet.add(r.toString());
                }
            }
            if (properties != null) {
                List<String> parts = new ArrayList<>();
                for (String paramName : properties.keySet()) {
                    JSONObject propSchema = properties.getJSONObject(paramName);
                    String type = "any";
                    if (propSchema != null && propSchema.getStr("type") != null) {
                        type = propSchema.getStr("type");
                    }
                    String marker = requiredSet.contains(paramName) ? "" : "?";
                    parts.add(paramName + marker + ": " + type);
                }
                sb.append(String.join(", ", parts));
            }
        }
        sb.append(")");

        String desc = fn.getDescription();
        if (desc != null && !desc.isEmpty()) {
            // Truncate long descriptions
            String shortDesc = desc.length() > 80 ? desc.substring(0, 77) + "..." : desc;
            sb.append(": ").append(shortDesc);
        }
        return sb.toString();
    }
}
