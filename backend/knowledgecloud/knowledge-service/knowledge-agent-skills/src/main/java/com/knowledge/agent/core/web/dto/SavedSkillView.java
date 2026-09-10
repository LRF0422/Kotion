package com.knowledge.agent.core.web.dto;

import com.knowledge.agent.core.savedskill.SavedSkill;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** Sanitized API view of an owner-scoped saved skill. */
@Data
public class SavedSkillView {

    private String skillId;
    private String name;
    private String description;
    private String triggerText;
    private List<String> exampleIntents = new ArrayList<>();
    private List<String> tags = new ArrayList<>();
    private String systemPromptFragment;
    private List<String> requiredToolNames = new ArrayList<>();
    private List<String> optionalToolNames = new ArrayList<>();
    private String sourceConversationId;
    private String sourceRunId;
    private boolean enabled;
    private int version;
    private long useCount;
    private Long lastUsedTime;
    private long createTime;
    private long updateTime;

    public static SavedSkillView of(SavedSkill skill) {
        if (skill == null) {
            return null;
        }
        SavedSkillView view = new SavedSkillView();
        view.setSkillId(skill.getSkillId());
        view.setName(skill.getName());
        view.setDescription(skill.getDescription());
        view.setTriggerText(skill.getTriggerText());
        view.setExampleIntents(new ArrayList<>(skill.getExampleIntents()));
        view.setTags(new ArrayList<>(skill.getTags()));
        view.setSystemPromptFragment(skill.getSystemPromptFragment());
        view.setRequiredToolNames(new ArrayList<>(skill.getRequiredToolNames()));
        view.setOptionalToolNames(new ArrayList<>(skill.getOptionalToolNames()));
        view.setSourceConversationId(skill.getSourceConversationId());
        view.setSourceRunId(skill.getSourceRunId());
        view.setEnabled(skill.isEnabled());
        view.setVersion(skill.getVersion());
        view.setUseCount(skill.getUseCount());
        view.setLastUsedTime(skill.getLastUsedTime());
        view.setCreateTime(skill.getCreateTime());
        view.setUpdateTime(skill.getUpdateTime());
        return view;
    }
}
