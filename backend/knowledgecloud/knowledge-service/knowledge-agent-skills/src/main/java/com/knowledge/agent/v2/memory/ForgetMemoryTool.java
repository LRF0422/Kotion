package com.knowledge.agent.v2.memory;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Backend tool: delete a previously stored memory by id (e.g. from
 * {@link RecallMemoryTool}).
 */
@Slf4j
@Component
public class ForgetMemoryTool implements Tool {

    public static final String ID = "forget_memory";

    private final MemoryStore memoryStore;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ForgetMemoryTool(MemoryStore memoryStore) {
        this.memoryStore = memoryStore;
    }

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDescription() {
        return "删除一条已存储的长期记忆（按 memory_id）。仅当用户明确要求忘记某条信息、或某条记忆已过时/错误时调用。";
    }

    @Override
    public String getJsonSchema() {
        return "{\"type\":\"object\",\"properties\":{"
                + "\"memory_id\":{\"type\":\"string\",\"description\":\"要删除的记忆 ID（来自 recall_memory 的结果）\"}"
                + "},\"required\":[\"memory_id\"]}";
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        if (context.getUserId() == null) {
            return ToolResult.error("Memory is unavailable without a user identity.");
        }
        try {
            JsonNode node = objectMapper.readTree(args != null && !args.isBlank() ? args : "{}");
            String memoryId = node.path("memory_id").asText(null);
            if (memoryId == null || memoryId.isBlank()) {
                return ToolResult.error("Missing required argument: memory_id");
            }
            boolean removed = memoryStore.forget(
                    MemoryStore.scope(context.getUserId(), context.getTenantId()), memoryId);
            return ToolResult.success(removed ? "已删除记忆 " + memoryId : "未找到该记忆 " + memoryId);
        } catch (Exception e) {
            return ToolResult.error("forget_memory failed: " + e.getMessage());
        }
    }
}
