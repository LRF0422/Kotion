package com.knowledge.agentcore.tool.builtin;

import com.knowledge.agentcore.memory.MemoryEntry;
import com.knowledge.agentcore.memory.MemoryScope;
import com.knowledge.agentcore.memory.MemoryStore;
import com.knowledge.agentcore.tool.BackendTool;
import com.knowledge.agentcore.tool.ToolContext;
import com.knowledge.agentcore.tool.ToolKind;
import com.knowledge.agentcore.tool.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Long-term memory tool: persist a fact/preference/note for the user, scoped
 * automatically to page → space → user.
 */
@Component
public class RememberTool implements BackendTool {

    private final MemoryStore memoryStore;

    public RememberTool(MemoryStore memoryStore) {
        this.memoryStore = memoryStore;
    }

    @Override
    public ToolSpec spec() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("content", Schemas.str("要记住的内容（一句话描述）。"));
        props.put("type", Schemas.str("记忆类型：fact(事实) | preference(偏好) | note(备注) | episode(经历)，默认 note。"));
        props.put("importance", Schemas.integer("重要性 0-100，默认 50。"));
        props.put("tags", Schemas.str("逗号分隔的标签，便于检索（可选）。"));
        props.put("scope", Schemas.str("作用域：auto(默认，按 页面>空间>用户 自动选择) | user | space | page。"));
        return ToolSpec.of("remember",
                "保存一条长期记忆（用户偏好、事实、备注），跨会话可用；下次对话会自动注入相关记忆。",
                Schemas.object(props, "content"), ToolKind.BACKEND, false, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        String content = args.get("content") == null ? "" : String.valueOf(args.get("content"));
        if (content.trim().isEmpty()) {
            throw new IllegalArgumentException("content 不能为空");
        }
        String type = args.get("type") == null ? "note" : String.valueOf(args.get("type"));
        if (!"fact".equals(type) && !"preference".equals(type) && !"note".equals(type) && !"episode".equals(type)) {
            type = "note";
        }
        int importance = args.get("importance") == null ? 50
                : ((Number) args.get("importance")).intValue();
        importance = Math.max(0, Math.min(100, importance));

        MemoryEntry entry = new MemoryEntry();
        entry.setUserId(context.getUserId());
        entry.setTenantId(context.getTenantId());
        entry.setSpaceId(context.getSpaceId());
        entry.setPageId(context.getPageId());
        entry.setType(type);
        entry.setContent(content.trim());
        entry.setImportance(importance);
        if (args.get("tags") != null) {
            for (String tag : String.valueOf(args.get("tags")).split("[,，]")) {
                if (tag != null && !tag.trim().isEmpty()) {
                    entry.getTags().add(tag.trim());
                }
            }
        }
        String scopeMode = args.get("scope") == null ? "auto" : String.valueOf(args.get("scope"));
        if ("user".equalsIgnoreCase(scopeMode)) {
            entry.setScope(MemoryScope.userScope(context.getUserId()));
        } else if ("space".equalsIgnoreCase(scopeMode)) {
            entry.setScope(MemoryScope.spaceScope(context.getUserId(), context.getSpaceId()));
        } else if ("page".equalsIgnoreCase(scopeMode)) {
            entry.setScope(MemoryScope.pageScope(context.getUserId(), context.getSpaceId(), context.getPageId()));
        } else {
            entry.setScope(MemoryScope.mostSpecific(context.getUserId(), context.getSpaceId(), context.getPageId()));
        }

        MemoryEntry saved = memoryStore.remember(entry);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("memoryId", saved.getMemoryId());
        result.put("scope", saved.getScope());
        result.put("type", saved.getType());
        return result;
    }
}
