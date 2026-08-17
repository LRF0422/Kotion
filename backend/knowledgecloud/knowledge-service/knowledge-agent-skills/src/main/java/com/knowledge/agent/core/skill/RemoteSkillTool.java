package com.knowledge.agent.core.skill;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import com.knowledge.core.launch.constant.TokenConstant;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Backend tool backed by a remote microservice skill — invokes the service's
 * {@code /api/v1/agent-sdk/invoke} callback with the caller's JWT forwarded.
 */
@Slf4j
public class RemoteSkillTool implements BackendTool {

    private static final int TIMEOUT_SECONDS = 30;

    private final RemoteSkillRecord record;
    private final ObjectMapper objectMapper;

    public RemoteSkillTool(RemoteSkillRecord record) {
        this(record, new ObjectMapper());
    }

    public RemoteSkillTool(RemoteSkillRecord record, ObjectMapper objectMapper) {
        this.record = record;
        this.objectMapper = objectMapper;
    }

    public RemoteSkillRecord getRecord() {
        return record;
    }

    @Override
    public ToolSpec spec() {
        Map<String, Object> schema = new LinkedHashMap<>();
        if (record.getParameterSchema() != null && !record.getParameterSchema().isEmpty()) {
            try {
                schema = objectMapper.readValue(record.getParameterSchema(), Map.class);
            } catch (Exception e) {
                log.warn("RemoteSkill schema parse failed for {}: {}", record.getToolName(), e.getMessage());
            }
        }
        return ToolSpec.of(record.getToolName(), record.getDescription(), schema,
                ToolKind.BACKEND, false, "skill");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("skillId", record.getSkillId());
        body.put("toolName", record.getToolName());
        body.put("params", args == null ? new LinkedHashMap<>() : args);

        try {
            WebClient client = WebClient.builder().build();
            String json = client.post()
                    .uri(record.effectiveCallbackUrl())
                    .contentType(MediaType.APPLICATION_JSON)
                    .header(TokenConstant.HEADER, context.getToken() == null ? "" : context.getToken())
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                    .block();
            if (json == null || json.isEmpty()) {
                return new LinkedHashMap<>();
            }
            return objectMapper.readValue(json, Object.class);
        } catch (Exception e) {
            throw new IllegalStateException("远程技能调用失败 (" + record.getToolName() + "): " + e.getMessage(), e);
        }
    }
}
