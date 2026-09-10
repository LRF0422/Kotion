package com.knowledge.agent.core.tool.builtin;

import com.knowledge.agent.core.savedskill.SavedSkillStore;
import com.knowledge.agent.core.savedskill.SavedSkillService;
import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/** Persists the current trusted conversation as a reusable personal skill. */
@Component
@ConditionalOnProperty(prefix = "agent.saved-skills", name = "enabled",
        havingValue = "true", matchIfMissing = true)
public class SaveConversationAsSkillTool implements BackendTool {

    private final ObjectProvider<SavedSkillService> savedSkillService;

    public SaveConversationAsSkillTool(ObjectProvider<SavedSkillService> savedSkillService) {
        this.savedSkillService = savedSkillService;
    }

    @Override
    public ToolSpec spec() {
        return ToolSpec.of("save_conversation_as_skill",
                "仅当用户在当前消息中明确要求把当前会话保存、提炼或创建为可复用个人 Skill 时调用。"
                        + "不得主动保存，也不得替用户推断授权。会话与身份由后端可信上下文读取，无需参数。",
                Schemas.object(new LinkedHashMap<>(), new String[0]),
                ToolKind.BACKEND, false, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        SavedSkillStore.SaveResult saved = savedSkillService.getObject().saveFromTool(context);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("skillId", saved.getSkill().getSkillId());
        result.put("name", saved.getSkill().getName());
        result.put("version", saved.getSkill().getVersion());
        result.put("created", saved.isCreated());
        return result;
    }
}
