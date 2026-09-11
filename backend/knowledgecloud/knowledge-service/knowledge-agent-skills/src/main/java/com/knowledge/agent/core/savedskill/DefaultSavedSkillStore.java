package com.knowledge.agent.core.savedskill;

import com.knowledge.agent.core.entity.AgentSavedSkillEntity;
import com.knowledge.agent.core.mapper.AgentSavedSkillMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** MySQL-authoritative implementation of {@link SavedSkillStore}. */
@Component
public class DefaultSavedSkillStore implements SavedSkillStore {

    private final AgentSavedSkillMapper mapper;
    private final SavedSkillJsonCodec jsonCodec;

    public DefaultSavedSkillStore(AgentSavedSkillMapper mapper, SavedSkillJsonCodec jsonCodec) {
        this.mapper = mapper;
        this.jsonCodec = jsonCodec;
    }

    @Override
    public SavedSkill findBySkillId(Long tenantId, Long userId, String skillId) {
        requireOwner(tenantId, userId);
        if (skillId == null || skillId.trim().isEmpty()) {
            return null;
        }
        return fromEntity(mapper.selectOwnedBySkillId(tenantId, userId, skillId));
    }

    @Override
    public SavedSkill findByFingerprint(Long tenantId, Long userId, String sourceFingerprint) {
        requireOwner(tenantId, userId);
        if (sourceFingerprint == null || sourceFingerprint.trim().isEmpty()) {
            return null;
        }
        return fromEntity(mapper.selectOwnedByFingerprint(tenantId, userId, sourceFingerprint));
    }

    @Override
    public List<SavedSkill> list(Long tenantId, Long userId, Boolean enabled, int offset, int limit) {
        requireOwner(tenantId, userId);
        List<AgentSavedSkillEntity> entities = mapper.selectOwnedPage(
                tenantId, userId, enabled, Math.max(0, offset), Math.max(1, limit));
        return fromEntities(entities);
    }

    @Override
    public List<SavedSkill> listEnabledCandidates(Long tenantId, Long userId, int limit) {
        requireOwner(tenantId, userId);
        return fromEntities(mapper.selectEnabledCandidates(tenantId, userId, Math.max(1, limit)));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SaveResult saveIfAbsent(SavedSkill skill, int maxSkillsPerUser) {
        requireSavable(skill);
        long now = System.currentTimeMillis();
        mapper.ensureOwnerLock(skill.getTenantId(), skill.getUserId(), now);
        mapper.lockOwner(skill.getTenantId(), skill.getUserId());

        SavedSkill existing = findByFingerprint(
                skill.getTenantId(), skill.getUserId(), skill.getSourceFingerprint());
        if (existing != null) {
            return new SaveResult(existing, false);
        }
        if (maxSkillsPerUser > 0
                && mapper.countOwned(skill.getTenantId(), skill.getUserId()) >= maxSkillsPerUser) {
            throw new IllegalStateException("SAVED_SKILL_LIMIT_EXCEEDED");
        }

        normalizeForInsert(skill, now);
        try {
            mapper.insert(toEntity(skill));
            return new SaveResult(skill, true);
        } catch (DuplicateKeyException duplicate) {
            existing = findByFingerprint(
                    skill.getTenantId(), skill.getUserId(), skill.getSourceFingerprint());
            if (existing != null) {
                return new SaveResult(existing, false);
            }
            throw duplicate;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateOwned(SavedSkill skill) {
        requireSavable(skill);
        requireOwner(skill.getTenantId(), skill.getUserId());
        if (isBlank(skill.getSkillId()) || skill.getVersion() <= 0) {
            throw new IllegalArgumentException("saved skill identity and version are required");
        }
        long now = System.currentTimeMillis();
        // Same owner lock as creation: serializes version bumps per owner so
        // two concurrent saves cannot both claim version N+1.
        mapper.ensureOwnerLock(skill.getTenantId(), skill.getUserId(), now);
        mapper.lockOwner(skill.getTenantId(), skill.getUserId());
        skill.setUpdateTime(now);
        return mapper.updateOwned(toEntity(skill)) > 0;
    }

    @Override
    public boolean setEnabled(Long tenantId, Long userId, String skillId, boolean enabled) {
        requireOwner(tenantId, userId);
        return mapper.updateOwnedEnabled(
                tenantId, userId, skillId, enabled, System.currentTimeMillis()) > 0;
    }

    @Override
    public boolean delete(Long tenantId, Long userId, String skillId) {
        requireOwner(tenantId, userId);
        return mapper.deleteOwned(tenantId, userId, skillId) > 0;
    }

    @Override
    public boolean markUsed(Long tenantId, Long userId, String skillId, long usedAt) {
        requireOwner(tenantId, userId);
        return mapper.incrementOwnedUse(tenantId, userId, skillId, usedAt) > 0;
    }

    private void normalizeForInsert(SavedSkill skill, long now) {
        if (skill.getSkillId() == null || skill.getSkillId().trim().isEmpty()) {
            skill.setSkillId(UUID.randomUUID().toString());
        }
        if (skill.getSourceSchemaVersion() == null || skill.getSourceSchemaVersion().trim().isEmpty()) {
            skill.setSourceSchemaVersion("v1");
        }
        if (skill.getVersion() <= 0) {
            skill.setVersion(1);
        }
        if (skill.getCreateTime() <= 0) {
            skill.setCreateTime(now);
        }
        skill.setUpdateTime(now);
    }

    private void requireSavable(SavedSkill skill) {
        if (skill == null) {
            throw new IllegalArgumentException("saved skill is required");
        }
        requireOwner(skill.getTenantId(), skill.getUserId());
        if (isBlank(skill.getSourceFingerprint())) {
            throw new IllegalArgumentException("sourceFingerprint is required");
        }
        if (isBlank(skill.getName()) || isBlank(skill.getDescription())
                || isBlank(skill.getTriggerText()) || isBlank(skill.getSystemPromptFragment())) {
            throw new IllegalArgumentException("saved skill definition is incomplete");
        }
        if (isBlank(skill.getSourceConversationId()) || isBlank(skill.getSourceRunId())) {
            throw new IllegalArgumentException("saved skill source is required");
        }
    }

    private void requireOwner(Long tenantId, Long userId) {
        if (tenantId == null || userId == null) {
            throw new IllegalArgumentException("saved skill owner is required");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private List<SavedSkill> fromEntities(List<AgentSavedSkillEntity> entities) {
        List<SavedSkill> skills = new ArrayList<>();
        if (entities != null) {
            for (AgentSavedSkillEntity entity : entities) {
                SavedSkill skill = fromEntity(entity);
                if (skill != null) {
                    skills.add(skill);
                }
            }
        }
        return skills;
    }

    private SavedSkill fromEntity(AgentSavedSkillEntity entity) {
        if (entity == null) {
            return null;
        }
        SavedSkill skill = new SavedSkill();
        skill.setSkillId(entity.getSkillId());
        skill.setTenantId(entity.getTenantId());
        skill.setUserId(entity.getUserId());
        skill.setName(entity.getName());
        skill.setDescription(entity.getDescription());
        skill.setTriggerText(entity.getTriggerText());
        skill.setExampleIntents(jsonCodec.readStrings(entity.getExampleIntentsJson()));
        skill.setTags(jsonCodec.readStrings(entity.getTagsJson()));
        skill.setSystemPromptFragment(entity.getSystemPromptFragment());
        skill.setRequiredToolNames(jsonCodec.readStrings(entity.getRequiredToolNamesJson()));
        skill.setOptionalToolNames(jsonCodec.readStrings(entity.getOptionalToolNamesJson()));
        skill.setSourceConversationId(entity.getSourceConversationId());
        skill.setSourceRunId(entity.getSourceRunId());
        skill.setSourceSchemaVersion(entity.getSourceSchemaVersion());
        skill.setSourceFingerprint(entity.getSourceFingerprint());
        skill.setEnabled(Boolean.TRUE.equals(entity.getEnabled()));
        skill.setVersion(entity.getVersion() != null ? entity.getVersion() : 1);
        skill.setUseCount(entity.getUseCount() != null ? entity.getUseCount() : 0L);
        skill.setLastUsedTime(entity.getLastUsedTime());
        skill.setEmbeddingRef(entity.getEmbeddingRef());
        skill.setCreateTime(entity.getCreateTime() != null ? entity.getCreateTime() : 0L);
        skill.setUpdateTime(entity.getUpdateTime() != null ? entity.getUpdateTime() : 0L);
        return skill;
    }

    private AgentSavedSkillEntity toEntity(SavedSkill skill) {
        AgentSavedSkillEntity entity = new AgentSavedSkillEntity();
        entity.setSkillId(skill.getSkillId());
        entity.setTenantId(skill.getTenantId());
        entity.setUserId(skill.getUserId());
        entity.setName(skill.getName());
        entity.setDescription(skill.getDescription());
        entity.setTriggerText(skill.getTriggerText());
        entity.setExampleIntentsJson(jsonCodec.writeStrings(skill.getExampleIntents()));
        entity.setTagsJson(jsonCodec.writeStrings(skill.getTags()));
        entity.setSystemPromptFragment(skill.getSystemPromptFragment());
        entity.setRequiredToolNamesJson(jsonCodec.writeStrings(skill.getRequiredToolNames()));
        entity.setOptionalToolNamesJson(jsonCodec.writeStrings(skill.getOptionalToolNames()));
        entity.setSourceConversationId(skill.getSourceConversationId());
        entity.setSourceRunId(skill.getSourceRunId());
        entity.setSourceSchemaVersion(skill.getSourceSchemaVersion());
        entity.setSourceFingerprint(skill.getSourceFingerprint());
        entity.setEnabled(skill.isEnabled());
        entity.setVersion(skill.getVersion());
        entity.setUseCount(skill.getUseCount());
        entity.setLastUsedTime(skill.getLastUsedTime());
        entity.setEmbeddingRef(skill.getEmbeddingRef());
        entity.setCreateTime(skill.getCreateTime());
        entity.setUpdateTime(skill.getUpdateTime());
        return entity;
    }
}
