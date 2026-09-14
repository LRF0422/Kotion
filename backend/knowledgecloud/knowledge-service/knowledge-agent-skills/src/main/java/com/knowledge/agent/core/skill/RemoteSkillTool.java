package com.knowledge.agent.core.skill;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import lombok.extern.slf4j.Slf4j;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Backend tool backed by a remote microservice skill. Specification building
 * lives here; the actual HTTP transport is delegated to
 * {@link RemoteSkillInvoker} so it can be tested/swapped independently.
 */
@Slf4j
public class RemoteSkillTool implements BackendTool {

    private final RemoteSkillRecord record;
    private final ObjectMapper objectMapper;
    private final RemoteSkillInvoker invoker;

    public RemoteSkillTool(RemoteSkillRecord record, ObjectMapper objectMapper,
                           RemoteSkillInvoker invoker) {
        this.record = record;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
        this.invoker = invoker;
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
                log.warn("RemoteSkill schema parse failed for {}: {}",
                        record.getToolName(), e.getMessage());
            }
        }
        return ToolSpec.of(record.getToolName(), record.getDescription(), schema,
                ToolKind.BACKEND, false, "skill");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        if (invoker == null) {
            throw new IllegalStateException(
                    "远程技能调用器未初始化 (" + record.getToolName() + ")");
        }
        return invoker.invoke(record, args, context);
    }
}
