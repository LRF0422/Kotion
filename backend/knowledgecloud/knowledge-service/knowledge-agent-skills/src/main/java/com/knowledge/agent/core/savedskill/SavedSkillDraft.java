package com.knowledge.agent.core.savedskill;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** Structured output produced by the conversation-to-skill compiler. */
@Data
public class SavedSkillDraft {

    private String name;
    private String description;
    private String triggerText;
    private List<String> exampleIntents = new ArrayList<>();
    private List<String> tags = new ArrayList<>();
    private String systemPromptFragment;
    private List<String> requiredToolNames = new ArrayList<>();
    private List<String> optionalToolNames = new ArrayList<>();
}
