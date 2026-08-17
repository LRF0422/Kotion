package com.knowledge.agent.core.tool;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.skill.RemoteSkillRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Unified tool gateway — routes every LLM tool call to a backend executor or
 * marks it as a frontend (client) call that pauses the run.
 *
 * <p>Stateless: the run's client tool names are supplied per call so a single
 * gateway serves every run. Backend tools are Spring beans injected as a list.
 */
@Slf4j
@Component
public class ToolGateway {

    private final Map<String, BackendTool> backendTools = new LinkedHashMap<>();
    private final ObjectMapper objectMapper;
    /** Dynamically registered remote skills (heartbeat-fresh). */
    private final RemoteSkillRegistry remoteSkillRegistry;

    public ToolGateway(List<BackendTool> backendTools, ObjectMapper objectMapper,
                       RemoteSkillRegistry remoteSkillRegistry) {
        for (BackendTool tool : backendTools) {
            if (tool != null && tool.spec() != null && tool.spec().getName() != null) {
                this.backendTools.put(tool.spec().getName(), tool);
            }
        }
        this.objectMapper = objectMapper;
        this.remoteSkillRegistry = remoteSkillRegistry;
    }

    /** Backend specs registered server-side (builtins + remote skills). */
    public List<ToolSpec> backendSpecs() {
        List<ToolSpec> specs = new ArrayList<>();
        for (BackendTool tool : backendTools.values()) {
            specs.add(tool.spec());
        }
        if (remoteSkillRegistry != null) {
            for (BackendTool tool : remoteSkillRegistry.liveTools()) {
                specs.add(tool.spec());
            }
        }
        return specs;
    }

    public BackendTool backendTool(String name) {
        BackendTool tool = backendTools.get(name);
        if (tool != null) {
            return tool;
        }
        return remoteSkillRegistry != null ? remoteSkillRegistry.find(name) : null;
    }

    /**
     * Build the OpenAI-compatible {@code tools} JSON array for one inference:
     * client-declared (editor) tools + backend specs.
     */
    public String buildToolsJson(List<ToolSpec> clientTools) {
        List<Map<String, Object>> tools = new ArrayList<>();
        if (clientTools != null) {
            for (ToolSpec spec : clientTools) {
                tools.add(toOpenAiTool(spec));
            }
        }
        for (ToolSpec spec : backendSpecs()) {
            tools.add(toOpenAiTool(spec));
        }
        if (tools.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(tools);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize tools JSON", e);
        }
    }

    /** Execute a backend tool, measuring duration and converting errors. */
    public ToolOutcome executeBackend(String callId, String toolName, String argsJson,
                                      ToolContext context) {
        BackendTool tool = backendTools.get(toolName);
        if (tool == null) {
            return ToolOutcome.failure(callId, toolName, "Backend tool not found: " + toolName, 0);
        }
        long started = System.currentTimeMillis();
        try {
            Map<String, Object> args = parseArgs(argsJson);
            Object result = tool.execute(args, context);
            return ToolOutcome.success(callId, toolName, result, System.currentTimeMillis() - started);
        } catch (Exception e) {
            log.warn("Backend tool {} failed: {}", toolName, e.getMessage());
            return ToolOutcome.failure(callId, toolName, e.getMessage(), System.currentTimeMillis() - started);
        }
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> parseArgs(String argsJson) {
        if (argsJson == null || argsJson.isEmpty()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(argsJson, Map.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid tool arguments JSON: " + e.getMessage(), e);
        }
    }

    private Map<String, Object> toOpenAiTool(ToolSpec spec) {
        Map<String, Object> function = new LinkedHashMap<>();
        function.put("name", spec.getName());
        function.put("description", spec.getDescription());
        function.put("parameters", spec.getInputSchema() != null ? spec.getInputSchema() : new LinkedHashMap<>());

        Map<String, Object> tool = new LinkedHashMap<>();
        tool.put("type", "function");
        tool.put("function", function);
        return tool;
    }
}
