package com.knowledge.agent.core.savedskill;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** One relevant saved skill and its run-time tool compatibility result. */
@Data
@AllArgsConstructor
public class SavedSkillMatch {
    private SavedSkill skill;
    private double score;
    private List<String> compatibleToolNames = new ArrayList<>();
}
