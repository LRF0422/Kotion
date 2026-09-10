package com.knowledge.agent.core.savedskill;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/** Authoritative owner-scoped persistence access for personal saved skills. */
public interface SavedSkillStore {

    SavedSkill findBySkillId(Long tenantId, Long userId, String skillId);

    SavedSkill findByFingerprint(Long tenantId, Long userId, String sourceFingerprint);

    List<SavedSkill> list(Long tenantId, Long userId, Boolean enabled, int offset, int limit);

    List<SavedSkill> listEnabledCandidates(Long tenantId, Long userId, int limit);

    SaveResult saveIfAbsent(SavedSkill skill, int maxSkillsPerUser);

    boolean setEnabled(Long tenantId, Long userId, String skillId, boolean enabled);

    boolean delete(Long tenantId, Long userId, String skillId);

    boolean markUsed(Long tenantId, Long userId, String skillId, long usedAt);

    @Data
    @AllArgsConstructor
    class SaveResult {
        private SavedSkill skill;
        private boolean created;
    }
}
