package com.knowledge.agent.core.profile;

import com.knowledge.agent.core.entity.AgentUserProfileEntity;
import lombok.Data;

/**
 * One profile trait (domain view over {@code agent_user_profile}). A trait is a
 * single (dimension, value) assertion with confidence and provenance.
 */
@Data
public class ProfileTrait {

    public static final String SOURCE_INFERRED = "inferred";
    public static final String SOURCE_USER = "user";
    public static final String STATUS_ACTIVE = "active";
    public static final String STATUS_SUPPRESSED = "suppressed";

    private String traitId;
    private Long tenantId;
    private Long userId;
    private String dimension;
    private String traitValue;
    private int confidence;
    private String source = SOURCE_INFERRED;
    private String status = STATUS_ACTIVE;
    private boolean locked;
    private int evidenceCount;
    private long firstSeen;
    private long lastSeen;
    private long expiresAt;
    private long createTime;
    private long updateTime;

    public boolean isActive() {
        return STATUS_ACTIVE.equals(status);
    }

    public static ProfileTrait fromEntity(AgentUserProfileEntity entity) {
        ProfileTrait trait = new ProfileTrait();
        trait.setTraitId(entity.getTraitId());
        trait.setTenantId(entity.getTenantId());
        trait.setUserId(entity.getUserId());
        trait.setDimension(entity.getDimension());
        trait.setTraitValue(entity.getTraitValue());
        trait.setConfidence(entity.getConfidence() != null ? entity.getConfidence() : 0);
        if (entity.getSource() != null && !entity.getSource().isEmpty()) {
            trait.setSource(entity.getSource());
        }
        if (entity.getStatus() != null && !entity.getStatus().isEmpty()) {
            trait.setStatus(entity.getStatus());
        }
        trait.setLocked(Boolean.TRUE.equals(entity.getLocked()));
        trait.setEvidenceCount(entity.getEvidenceCount() != null ? entity.getEvidenceCount() : 0);
        trait.setFirstSeen(entity.getFirstSeen() != null ? entity.getFirstSeen() : 0);
        trait.setLastSeen(entity.getLastSeen() != null ? entity.getLastSeen() : 0);
        trait.setExpiresAt(entity.getExpiresAt() != null ? entity.getExpiresAt() : 0);
        trait.setCreateTime(entity.getCreateTime() != null ? entity.getCreateTime() : 0);
        trait.setUpdateTime(entity.getUpdateTime() != null ? entity.getUpdateTime() : 0);
        return trait;
    }

    public AgentUserProfileEntity toEntity() {
        AgentUserProfileEntity entity = new AgentUserProfileEntity();
        entity.setTraitId(traitId);
        entity.setTenantId(tenantId);
        entity.setUserId(userId);
        entity.setDimension(dimension);
        entity.setTraitValue(traitValue);
        entity.setConfidence(confidence);
        entity.setSource(source);
        entity.setStatus(status);
        entity.setLocked(locked);
        entity.setEvidenceCount(evidenceCount);
        entity.setFirstSeen(firstSeen);
        entity.setLastSeen(lastSeen);
        entity.setExpiresAt(expiresAt);
        entity.setCreateTime(createTime);
        entity.setUpdateTime(updateTime);
        return entity;
    }
}
