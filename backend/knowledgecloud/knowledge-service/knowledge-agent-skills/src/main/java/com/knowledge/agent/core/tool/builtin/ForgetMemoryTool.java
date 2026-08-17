package com.knowledge.agent.core.tool.builtin;

import com.knowledge.agent.core.memory.MemoryStore;
import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Long-term memory tool: delete an entry (ownership-checked).
 */
@Component
public class ForgetMemoryTool implements BackendTool {

    private final MemoryStore memoryStore;

    public ForgetMemoryTool(MemoryStore memoryStore) {
        this.memoryStore = memoryStore;
    }

    @Override
    public ToolSpec spec() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("memoryId", Schemas.str("要删除的记忆 id（来自 recall_memory 的返回）。"));
        return ToolSpec.of("forget_memory",
                "删除一条长期记忆（仅限当前用户自己的记忆）。",
                Schemas.object(props, "memoryId"), ToolKind.BACKEND, false, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        String memoryId = args.get("memoryId") == null ? "" : String.valueOf(args.get("memoryId"));
        boolean removed = memoryStore.forget(memoryId, context.getUserId(), context.getTenantId());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", removed);
        result.put("removed", removed);
        return result;
    }
}
