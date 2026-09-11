package com.knowledge.agent.core.savedskill;

import lombok.Getter;

import java.util.List;

/** Authoritative owner-scoped persistence access for personal saved skills. */
public interface SavedSkillStore {

    SavedSkill findBySkillId(Long tenantId, Long userId, String skillId);

    SavedSkill findByFingerprint(Long tenantId, Long userId, String sourceFingerprint);

    List<SavedSkill> list(Long tenantId, Long userId, Boolean enabled, int offset, int limit);

    List<SavedSkill> listEnabledCandidates(Long tenantId, Long userId, int limit);

    SaveResult saveIfAbsent(SavedSkill skill, int maxSkillsPerUser);

    /**
     * Persist a new version of an existing owner-scoped skill (continuous
     * update path). Replaces the definition fields, bumps {@code version},
     * updates the source trace, and preserves usage/enable state.
     *
     * @return true when the owner-owned skill was updated
     */
    boolean updateOwned(SavedSkill skill);

    boolean setEnabled(Long tenantId, Long userId, String skillId, boolean enabled);

    boolean delete(Long tenantId, Long userId, String skillId);

    boolean markUsed(Long tenantId, Long userId, String skillId, long usedAt);

    /** Outcome of a save: created, no-op dedup, or versioned update. */
    @Getter
    class SaveResult {
        private final SavedSkill skill;
        private final boolean created;
        private final boolean updated;

        public SaveResult(SavedSkill skill, boolean created) {
            this(skill, created, false);
        }

        public SaveResult(SavedSkill skill, boolean created, boolean updated) {
            this.skill = skill;
            this.created = created;
            this.updated = updated;
        }
    }
}
