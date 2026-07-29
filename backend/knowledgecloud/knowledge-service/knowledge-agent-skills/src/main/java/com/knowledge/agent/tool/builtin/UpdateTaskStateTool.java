package com.knowledge.agent.tool.builtin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import com.knowledge.agent.v2.context.ContextCompactor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Scratchpad tool: the agent calls {@code update_task_state} to persist its
 * structured task notes (goal / plan / progress / notes) OUTSIDE the
 * conversation window.
 *
 * <p>
 * The state is stored in the v2 session's metadata under
 * {@link ContextCompactor#TASK_STATE_METADATA_KEY}, so it:
 * <ul>
 * <li>survives context compaction (the compactor merges it into the
 * anchored summary as the authoritative source), and</li>
 * <li>is persisted with session checkpoints (metadata is included in the
 * snapshot codec), surviving suspend/resume and process restarts.</li>
 * </ul>
 *
 * <p>
 * Updates are <b>partial merges</b>: only the fields provided in a call
 * overwrite the stored values; omitted fields keep their previous content.
 */
@Slf4j
@Component
public class UpdateTaskStateTool implements Tool {

    public static final String ID = "update_task_state";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDescription() {
        return "记录/更新你的长任务状态笔记（目标、计划、进度、注意事项）。这些笔记独立于对话历史保存，"
                + "不会因上下文压缩而丢失，并随会话检查点持久化。在长任务中应定期调用：完成一个阶段、"
                + "做出关键决策、或发现重要事实（ID、路径、约束等）时立即记录。"
                + "本次调用只需提供发生变化的字段，未提供的字段保持原值。";
    }

    @Override
    public String getJsonSchema() {
        return "{\"type\":\"object\",\"properties\":{"
                + "\"goal\":{\"type\":\"string\",\"description\":\"任务总体目标（一般只需设置一次）\"},"
                + "\"plan\":{\"type\":\"string\",\"description\":\"分步计划，建议带序号与完成标记\"},"
                + "\"progress\":{\"type\":\"string\",\"description\":\"当前进度：已完成的步骤与产出、正在进行的步骤\"},"
                + "\"notes\":{\"type\":\"string\",\"description\":\"关键事实与注意事项：ID、路径、决策理由、踩过的坑等\"}"
                + "},\"additionalProperties\":false}";
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        Map<String, Object> metadata = context.getSessionMetadata();
        if (metadata == null) {
            return ToolResult.error("Task state is not available in this execution context.");
        }

        try {
            JsonNode incoming = (args == null || args.isBlank())
                    ? objectMapper.createObjectNode()
                    : objectMapper.readTree(args);

            // Load existing state (stored as a JSON string) for partial merge
            ObjectNode state;
            Object existing = metadata.get(ContextCompactor.TASK_STATE_METADATA_KEY);
            if (existing instanceof String && !((String) existing).isBlank()) {
                JsonNode parsed = objectMapper.readTree((String) existing);
                state = parsed.isObject() ? (ObjectNode) parsed : objectMapper.createObjectNode();
            } else {
                state = objectMapper.createObjectNode();
            }

            boolean changed = false;
            for (String field : new String[] { "goal", "plan", "progress", "notes" }) {
                JsonNode value = incoming.get(field);
                if (value != null && value.isTextual() && !value.asText().isBlank()) {
                    state.put(field, value.asText());
                    changed = true;
                }
            }

            if (!changed) {
                return ToolResult.error(
                        "No fields provided. Supply at least one of: goal, plan, progress, notes.");
            }

            String serialized = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(state);
            metadata.put(ContextCompactor.TASK_STATE_METADATA_KEY, serialized);

            log.debug("update_task_state: session {} state now {} chars",
                    context.getSessionId(), serialized.length());
            return ToolResult.success("任务状态已更新。当前状态：\n" + serialized);
        } catch (Exception e) {
            log.warn("update_task_state failed for session {}: {}",
                    context.getSessionId(), e.getMessage());
            return ToolResult.error("Failed to update task state: " + e.getMessage());
        }
    }
}
