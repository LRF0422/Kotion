package com.knowledge.agentcore.tool.builtin;

import com.knowledge.agentcore.memory.MemoryEntry;
import com.knowledge.agentcore.memory.MemoryScope;
import com.knowledge.agentcore.memory.MemoryStore;
import com.knowledge.agentcore.tool.BackendTool;
import com.knowledge.agentcore.tool.ToolContext;
import com.knowledge.agentcore.tool.ToolKind;
import com.knowledge.agentcore.tool.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Long-term memory tool: keyword recall across page → space → user scopes.
 */
@Component
public class RecallMemoryTool implements BackendTool {

    private final MemoryStore memoryStore;

    public RecallMemoryTool(MemoryStore memoryStore) {
        this.memoryStore = memoryStore;
    }

    @Override
    public ToolSpec spec() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("query", Schemas.str("检索关键词/问题（可选，为空则按重要性+时间返回）。"));
        props.put("type", Schemas.str("按类型过滤：fact|preference|note|episode（可选）。"));
        props.put("limit", Schemas.integer("返回条数，默认 5。"));
        return ToolSpec.of("recall_memory",
                "检索长期记忆（按 页面>空间>用户 作用域 + 关键词/标签匹配 + 重要性/时间排序）。",
                Schemas.object(props), ToolKind.BACKEND, true, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        String query = args.get("query") == null ? null : String.valueOf(args.get("query"));
        String type = args.get("type") == null ? null : String.valueOf(args.get("type"));
        int limit = args.get("limit") == null ? 5 : ((Number) args.get("limit")).intValue();
        limit = Math.max(1, Math.min(20, limit));

        List<String> scopes = MemoryScope.scopesFor(context.getUserId(), context.getSpaceId(), context.getPageId());
        List<MemoryEntry> entries = memoryStore.recall(scopes, query, type, limit);

        List<Map<String, Object>> items = new ArrayList<>();
        for (MemoryEntry entry : entries) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("memoryId", entry.getMemoryId());
            item.put("type", entry.getType());
            item.put("content", entry.getContent());
            item.put("importance", entry.getImportance());
            item.put("scope", entry.getScope());
            items.add(item);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("count", items.size());
        result.put("memories", items);
        return result;
    }
}
