package com.knowledge.agent.core.savedskill;

import java.util.List;
import java.util.Set;

/** Replaceable retrieval strategy for owner-scoped saved skills. */
public interface SavedSkillRetriever {

    List<SavedSkillMatch> retrieve(List<SavedSkill> candidates, String query,
                                   Set<String> availableToolNames,
                                   double minScore, int limit);
}
