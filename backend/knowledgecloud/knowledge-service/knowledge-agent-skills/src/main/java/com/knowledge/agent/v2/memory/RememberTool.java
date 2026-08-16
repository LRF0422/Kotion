package com.knowledge.agent.v2.memory;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Backend tool: persist a cross-session memory for the current user.
 *
 * <p>Memories are scoped to (user, tenant) and survive the current session —
 * they are injected back into future sessions at INIT and can be recalled via
 * {@link RecallMemoryTool}.
 */
@Slf4j
@Component
public class RememberTool implements Tool {

    public static final String ID = "remember";

    private final MemoryStore memoryStore;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public RememberTool(MemoryStore memoryStore) {
        this.memoryStore = memoryStore;
    }

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDescription() {
        return "把一条需要长期记住的事实、用户偏好或笔记写入跨会话记忆。记忆会在后续会话中自动提供给 agent，"
                + "也可用 recall_memory 检索。适用于：用户明确的偏好/习惯、重要事实、长期有效的约束或决策。"
                + "不要用来记当前任务的临时状态（那应该用 update_task_state）。";
    }

    @Override
    public String getJsonSchema() {
        return "{\"type\":\"object\",\"properties\":{"
                + "\"content\":{\"type\":\"string\",\"description\":\"要记住的内容，尽量具体、自包含\"},"
                + "\"type\":{\"type\":\"string\",\"enum\":[\"fact\",\"preference\",\"note\"],"
                + "\"description\":\"记忆类型：fact=事实、preference=用户偏好、note=一般笔记，默认 note\"},"
                + "\"importance\":{\"type\":\"integer\",\"minimum\":0,\"maximum\":100,"
                + "\"description\":\"重要程度 0-100，越高越优先被召回，默认 50\"},"
                + "\"tags\":{\"type\":\"array\",\"items\":{\"type\":\"string\"},"
                + "\"description\":\"便于检索的标签\"}"
                + "},\"required\":[\"content\"]}";
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        if (context.getUserId() == null) {
            return ToolResult.error("Memory is unavailable without a user identity.");
        }
        try {
            JsonNode node = objectMapper.readTree(args != null && !args.trim().isEmpty() ? args : "{}");
            String content = node.path("content").asText(null);
            if (content == null || content.trim().isEmpty()) {
                return ToolResult.error("Missing required argument: content");
            }

            MemoryEntry entry = new MemoryEntry();
            entry.setScope(MemoryStore.scope(context.getUserId(), context.getTenantId()));
            entry.setUserId(context.getUserId());
            entry.setTenantId(context.getTenantId());
            entry.setContent(content);
            entry.setType(node.path("type").asText("note"));
            entry.setImportance(node.path("importance").asInt(50));
            if (node.path("tags").isArray()) {
                List<String> tags = new ArrayList<>();
                node.path("tags").forEach(t -> tags.add(t.asText()));
                entry.setTags(tags);
            }

            memoryStore.remember(entry);
            return ToolResult.success("已记住（memoryId=" + entry.getMemoryId() + "）。");
        } catch (Exception e) {
            return ToolResult.error("remember failed: " + e.getMessage());
        }
    }
}
