package com.knowledge.agent.core.savedskill;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** Frozen audit metadata for a saved skill injected into one run. */
@Data
public class SavedSkillProvenance {
    private String skillId;
    private String name;
    private int version;
    private String sourceFingerprint;
    private double score;
    private int promptChars;
    private List<String> compatibleToolNames = new ArrayList<>();
}
