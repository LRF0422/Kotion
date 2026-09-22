package com.knowledge.agent.core.profile;

import com.knowledge.agent.core.entity.AgentProfileExtractionEntity;
import com.knowledge.agent.core.entity.AgentUserProfileConsentEntity;
import com.knowledge.agent.core.entity.AgentUserProfileEntity;
import com.knowledge.agent.core.entity.AgentUserProfileEvidenceEntity;
import com.knowledge.agent.core.mapper.AgentProfileExtractionMapper;
import com.knowledge.agent.core.mapper.AgentUserProfileConsentMapper;
import com.knowledge.agent.core.mapper.AgentUserProfileEvidenceMapper;
import com.knowledge.agent.core.mapper.AgentUserProfileMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * Owner-scoped store for the derived user profile. Every method requires an
 * explicit owner; callers pass the identity resolved from the security context
 * and never a client-supplied value.
 *
 * <p>Derived data is rebuildable, so read failures degrade to an empty result
 * (the recommendation / injection path must never fail a run).
 */
@Slf4j
@Component
public class ProfileStore {

    private final AgentUserProfileMapper traitMapper;
    private final AgentUserProfileEvidenceMapper evidenceMapper;
    private final AgentProfileExtractionMapper extractionMapper;
    private final AgentUserProfileConsentMapper consentMapper;

    public ProfileStore(AgentUserProfileMapper traitMapper,
                        AgentUserProfileEvidenceMapper evidenceMapper,
                        AgentProfileExtractionMapper extractionMapper,
                        AgentUserProfileConsentMapper consentMapper) {
        this.traitMapper = traitMapper;
        this.evidenceMapper = evidenceMapper;
        this.extractionMapper = extractionMapper;
        this.consentMapper = consentMapper;
    }

    // ==================== traits ====================

    public List<ProfileTrait> listActive(Long tenantId, Long userId, int limit) {
        List<ProfileTrait> traits = new ArrayList<>();
        if (tenantId == null || userId == null) {
            return traits;
        }
        try {
            for (AgentUserProfileEntity entity : traitMapper.selectActive(
                    tenantId, userId, Math.max(1, Math.min(limit, 500)))) {
                traits.add(ProfileTrait.fromEntity(entity));
            }
        } catch (Exception e) {
            log.warn("profile listActive failed for {}:{}: {}", tenantId, userId, e.getMessage());
        }
        return traits;
    }

    public List<ProfileTrait> listAll(Long tenantId, Long userId) {
        List<ProfileTrait> traits = new ArrayList<>();
        if (tenantId == null || userId == null) {
            return traits;
        }
        try {
            for (AgentUserProfileEntity entity : traitMapper.selectAll(tenantId, userId)) {
                traits.add(ProfileTrait.fromEntity(entity));
            }
        } catch (Exception e) {
            log.warn("profile listAll failed for {}:{}: {}", tenantId, userId, e.getMessage());
        }
        return traits;
    }

    public ProfileTrait findByKey(Long tenantId, Long userId, String dimension, String value) {
        if (tenantId == null || userId == null || dimension == null || value == null) {
            return null;
        }
        AgentUserProfileEntity entity = traitMapper.selectByKey(tenantId, userId, dimension, value);
        return entity != null ? ProfileTrait.fromEntity(entity) : null;
    }

    public ProfileTrait findByTraitId(Long tenantId, Long userId, String traitId) {
        if (tenantId == null || userId == null || traitId == null || traitId.trim().isEmpty()) {
            return null;
        }
        AgentUserProfileEntity entity = traitMapper.selectByTraitId(tenantId, userId, traitId.trim());
        return entity != null ? ProfileTrait.fromEntity(entity) : null;
    }

    public int countActive(Long tenantId, Long userId) {
        return traitMapper.countActive(tenantId, userId);
    }

    /** Insert or update one computed trait state (see ProfileMerger for the math). */
    public void upsert(ProfileTrait trait) {
        if (trait.getTraitId() == null || trait.getTraitId().isEmpty()) {
            trait.setTraitId(UUID.randomUUID().toString());
        }
        long now = System.currentTimeMillis();
        if (trait.getCreateTime() <= 0) {
            trait.setCreateTime(now);
        }
        trait.setUpdateTime(now);
        traitMapper.upsertTrait(trait.toEntity());
    }

    /** User edit: lock the row so extraction cannot overwrite it. */
    public boolean updateUserTrait(ProfileTrait trait) {
        trait.setUpdateTime(System.currentTimeMillis());
        return traitMapper.updateUserTrait(trait.toEntity()) > 0;
    }

    /** User delete: write the tombstone (never a hard delete, so it cannot revive). */
    public boolean suppress(Long tenantId, Long userId, String traitId) {
        return traitMapper.suppressByTraitId(tenantId, userId, traitId, System.currentTimeMillis()) > 0;
    }

    /** Hard delete one trait + its evidence (used by the internal reset path). */
    public void deleteTraitHard(Long tenantId, Long userId, String traitId) {
        evidenceMapper.deleteByTrait(tenantId, userId, traitId);
        AgentUserProfileEntity entity = traitMapper.selectByTraitId(tenantId, userId, traitId);
        if (entity != null) {
            traitMapper.deleteById(entity.getId());
        }
    }

    public int deleteExpiredTraits(long now) {
        return traitMapper.deleteExpired(now);
    }

    // ==================== evidence ====================

    public void addEvidence(Long tenantId, Long userId, String traitId, String sessionId,
                            String runId, String excerpt, long observedAt) {
        if (tenantId == null || userId == null || traitId == null) {
            return;
        }
        AgentUserProfileEvidenceEntity entity = new AgentUserProfileEvidenceEntity();
        entity.setTenantId(tenantId);
        entity.setUserId(userId);
        entity.setTraitId(traitId);
        entity.setSessionId(sessionId);
        entity.setRunId(runId);
        entity.setExcerpt(excerpt);
        entity.setObservedAt(observedAt);
        entity.setCreateTime(System.currentTimeMillis());
        evidenceMapper.insert(entity);
    }

    public List<AgentUserProfileEvidenceEntity> listEvidence(Long tenantId, Long userId,
                                                             String traitId, int limit) {
        if (tenantId == null || userId == null || traitId == null) {
            return Collections.emptyList();
        }
        List<AgentUserProfileEvidenceEntity> rows =
                evidenceMapper.selectByTrait(tenantId, userId, traitId, Math.max(1, Math.min(limit, 100)));
        return rows != null ? rows : Collections.<AgentUserProfileEvidenceEntity>emptyList();
    }

    /** Remove the evidence of one trait (used when the user deletes it). */
    public void deleteEvidence(Long tenantId, Long userId, String traitId) {
        if (tenantId == null || userId == null || traitId == null) {
            return;
        }
        evidenceMapper.deleteByTrait(tenantId, userId, traitId);
    }

    public int trimEvidence(Long tenantId, Long userId, String traitId, int keep) {
        if (traitId == null || keep < 1) {
            return 0;
        }
        return evidenceMapper.trimByTrait(tenantId, userId, traitId, keep);
    }

    public int deleteStaleEvidence(long cutoff) {
        return evidenceMapper.deleteOlderThan(cutoff);
    }

    // ==================== consent ====================

    public boolean isConsentGiven(Long tenantId, Long userId) {
        if (tenantId == null || userId == null) {
            return false;
        }
        try {
            AgentUserProfileConsentEntity entity = consentMapper.selectByOwner(tenantId, userId);
            return entity != null && Boolean.TRUE.equals(entity.getEnabled());
        } catch (Exception e) {
            log.warn("profile consent read failed for {}:{}: {}", tenantId, userId, e.getMessage());
            return false;
        }
    }

    public void setConsent(Long tenantId, Long userId, boolean enabled) {
        long now = System.currentTimeMillis();
        AgentUserProfileConsentEntity entity = new AgentUserProfileConsentEntity();
        entity.setTenantId(tenantId);
        entity.setUserId(userId);
        entity.setEnabled(enabled);
        entity.setAgreedAt(enabled ? now : 0L);
        entity.setCreateTime(now);
        entity.setUpdateTime(now);
        consentMapper.upsertConsent(entity);
    }

    // ==================== reset / watermark ====================

    /** Full physical purge of the derived data (user opt-out / reset). */
    public void purgeAll(Long tenantId, Long userId) {
        evidenceMapper.deleteByOwner(tenantId, userId);
        traitMapper.deleteByOwner(tenantId, userId);
        extractionMapper.deleteByOwner(tenantId, userId);
    }

    public AgentProfileExtractionEntity getWatermark(Long tenantId, Long userId, String sessionId) {
        if (tenantId == null || userId == null || sessionId == null || sessionId.trim().isEmpty()) {
            return null;
        }
        return extractionMapper.selectBySession(tenantId, userId, sessionId.trim());
    }

    public void saveWatermark(Long tenantId, Long userId, String sessionId, int extractedCount,
                              String runId, String model, String status) {
        long now = System.currentTimeMillis();
        AgentProfileExtractionEntity entity = new AgentProfileExtractionEntity();
        entity.setTenantId(tenantId);
        entity.setUserId(userId);
        entity.setSessionId(sessionId);
        entity.setExtractedMessageCount(extractedCount);
        entity.setLastRunId(runId);
        entity.setModel(model);
        entity.setStatus(status);
        entity.setCreateTime(now);
        entity.setUpdateTime(now);
        extractionMapper.upsertWatermark(entity);
    }
}
