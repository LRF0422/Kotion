package com.knowledge.agent.v2.memory;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Backend tool: retrieve the user's long-term memories relevant to a query.
 */
@Slf4j
@Component
public class RecallMemoryTool implements Tool {

    public static final String ID = "recall_memory";

    private final MemoryStore memoryStore;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public RecallMemoryTool(MemoryStore memoryStore) {
        this.memoryStore = memoryStore;
    }

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDescription() {
        return "检索当前用户的历史长期记忆（事实、偏好、笔记）。在需要了解用户过往偏好或已有约定时调用。"
                + "返回带 memory_id 的记忆条目列表。";
    }

    @Override
    public String getJsonSchema() {
        return "{\"type\":\"object\",\"properties\":{"
                + "\"query\":{\"type\":\"string\",\"description\":\"检索关键词；留空返回最近的记忆\"},"
                + "\"limit\":{\"type\":\"integer\",\"description\":\"最多返回条数，默认 5\"}"
                + "},\"required\":[]}";
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        if (context.getUserId() == null) {
            return ToolResult.error("Memory is unavailable without a user identity.");
        }
        try {
            JsonNode node = objectMapper.readTree(args != null && !args.isBlank() ? args : "{}");
            String query = node.path("query").asText("");
            int limit = node.path("limit").asInt(5);
            if (limit <= 0) {
                limit = 5;
            }

            List<MemoryEntry> entries = memoryStore.recall(
                    MemoryStore.scope(context.getUserId(), context.getTenantId()), query, limit);

            if (entries.isEmpty()) {
                return ToolResult.success("（没有检索到相关记忆）");
            }
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < entries.size(); i++) {
                MemoryEntry e = entries.get(i);
                sb.append(i + 1).append(". [").append(e.getMemoryId()).append("] ")
                        .append("(").append(e.getType()).append(", 重要度 ").append(e.getImportance()).append(") ")
                        .append(e.getContent()).append('\n');
            }
            return ToolResult.success(sb.toString().trim());
        } catch (Exception e) {
            return ToolResult.error("recall_memory failed: " + e.getMessage());
        }
    }
}
