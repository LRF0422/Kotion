package com.knowledge.agent.tool.builtin;

import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import com.knowledge.agent.v2.context.ContextCompactor;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Scratchpad tool: reads back the task state previously written by
 * {@link UpdateTaskStateTool}. Useful after context compaction or a resume,
 * when the agent wants the full, authoritative task notes rather than the
 * (possibly summarized) conversation history.
 */
@Component
public class GetTaskStateTool implements Tool {

    public static final String ID = "get_task_state";

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public boolean isReadOnly() {
        return true;
    }

    @Override
    public String getDescription() {
        return "读取你之前通过 update_task_state 记录的任务状态笔记（目标、计划、进度、注意事项）。"
                + "在上下文被压缩或任务恢复后，用它找回权威的任务状态。";
    }

    @Override
    public String getJsonSchema() {
        return "{\"type\":\"object\",\"properties\":{},\"additionalProperties\":false}";
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        Map<String, Object> metadata = context.getSessionMetadata();
        if (metadata == null) {
            return ToolResult.error("Task state is not available in this execution context.");
        }

        Object state = metadata.get(ContextCompactor.TASK_STATE_METADATA_KEY);
        if (state == null || state.toString().trim().isEmpty()) {
            return ToolResult.success("尚未记录任何任务状态。可调用 update_task_state 记录。");
        }
        return ToolResult.success(state.toString());
    }
}
