package com.knowledge.agent.core.web;

import com.knowledge.agent.core.entity.AgentUserProfileEvidenceEntity;
import com.knowledge.agent.core.profile.ProfileDimension;
import com.knowledge.agent.core.profile.ProfileMerger;
import com.knowledge.agent.core.profile.ProfileSensitivity;
import com.knowledge.agent.core.profile.ProfileStore;
import com.knowledge.agent.core.profile.ProfileTrait;
import com.knowledge.agent.core.web.dto.ProfileConsentRequest;
import com.knowledge.agent.core.web.dto.ProfileTraitView;
import com.knowledge.agent.core.web.dto.UpsertProfileTraitRequest;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * User-facing profile API. The user owns every trait: they can read, add,
 * edit, delete and opt out. Identity always comes from the security context —
 * never from the request.
 *
 * <pre>
 * GET    /api/agent/v1/profile                       own profile + consent
 * GET    /api/agent/v1/profile/traits/{id}/evidence  redacted evidence of one trait
 * POST   /api/agent/v1/profile/traits                add a user-declared trait
 * PUT    /api/agent/v1/profile/traits/{id}           edit a trait (locks it)
 * DELETE /api/agent/v1/profile/traits/{id}           delete a trait (tombstone)
 * DELETE /api/agent/v1/profile                       purge all derived data
 * GET    /api/agent/v1/profile/consent               opt-in state
 * PUT    /api/agent/v1/profile/consent               opt in/out (out purges)
 * </pre>
 */
@Api(tags = "Agent User Profile")
@Slf4j
@RestController
@RequestMapping("/api/agent/v1/profile")
public class UserProfileController {

    private static final int MAX_VALUE_LENGTH = 128;
    private static final int MAX_EVIDENCE_LIMIT = 50;

    private final ProfileStore store;

    public UserProfileController(ProfileStore store) {
        this.store = store;
    }

    @ApiOperation("Read the caller's own profile (active traits + consent)")
    @GetMapping
    public R<Map<String, Object>> get() {
        try {
            Identity identity = identity();
            boolean consent = store.isConsentGiven(identity.tenantId, identity.userId);
            List<ProfileTraitView> traits = new ArrayList<>();
            for (ProfileTrait trait : store.listActive(identity.tenantId, identity.userId, 200)) {
                traits.add(ProfileTraitView.of(trait));
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("consent", consent);
            result.put("count", traits.size());
            result.put("traits", traits);
            result.put("dimensions", ProfileDimension.keys());
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("profile read failed", e);
            return R.fail("读取画像失败");
        }
    }

    @ApiOperation("Read the redacted evidence behind one trait (owner only)")
    @GetMapping("/traits/{traitId}/evidence")
    public R<Map<String, Object>> evidence(@PathVariable String traitId) {
        try {
            Identity identity = identity();
            ProfileTrait trait = store.findByTraitId(identity.tenantId, identity.userId, traitId);
            if (trait == null) {
                return R.fail("画像项不存在");
            }
            List<Map<String, Object>> items = new ArrayList<>();
            for (AgentUserProfileEvidenceEntity evidence : store.listEvidence(
                    identity.tenantId, identity.userId, traitId, MAX_EVIDENCE_LIMIT)) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("excerpt", evidence.getExcerpt());
                item.put("sessionId", evidence.getSessionId());
                item.put("observedAt", evidence.getObservedAt());
                items.add(item);
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("traitId", traitId);
            result.put("count", items.size());
            result.put("evidence", items);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("profile evidence read failed for {}", traitId, e);
            return R.fail("读取画像依据失败");
        }
    }

    @ApiOperation("Add a user-declared trait (locked against extraction)")
    @PostMapping("/traits")
    public R<ProfileTraitView> create(@RequestBody UpsertProfileTraitRequest request) {
        try {
            Identity identity = identity();
            String dimension = validateDimension(request != null ? request.getDimension() : null);
            String value = validateValue(request != null ? request.getValue() : null);
            long now = System.currentTimeMillis();
            ProfileTrait existing = store.findByKey(identity.tenantId, identity.userId, dimension, value);

            ProfileTrait trait = new ProfileTrait();
            trait.setTraitId(existing != null ? existing.getTraitId() : UUID.randomUUID().toString());
            trait.setTenantId(identity.tenantId);
            trait.setUserId(identity.userId);
            trait.setDimension(dimension);
            trait.setTraitValue(value);
            trait.setConfidence(100);
            trait.setSource(ProfileTrait.SOURCE_USER);
            trait.setStatus(ProfileTrait.STATUS_ACTIVE);
            trait.setLocked(true);
            trait.setEvidenceCount(existing != null ? existing.getEvidenceCount() + 1 : 1);
            trait.setFirstSeen(existing != null && existing.getFirstSeen() > 0
                    ? existing.getFirstSeen() : now);
            trait.setLastSeen(now);
            trait.setExpiresAt(0L);
            trait.setCreateTime(existing != null ? existing.getCreateTime() : now);
            trait.setUpdateTime(now);
            store.upsert(trait);
            return R.data(ProfileTraitView.of(trait));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("profile trait create failed", e);
            return R.fail("保存画像失败");
        }
    }

    @ApiOperation("Edit a trait (re-locks it so extraction cannot overwrite)")
    @PutMapping("/traits/{traitId}")
    public R<ProfileTraitView> update(@PathVariable String traitId,
                                      @RequestBody UpsertProfileTraitRequest request) {
        try {
            Identity identity = identity();
            ProfileTrait current = store.findByTraitId(identity.tenantId, identity.userId, traitId);
            if (current == null) {
                return R.fail("画像项不存在");
            }
            String dimension = request != null && request.getDimension() != null
                    && !request.getDimension().trim().isEmpty()
                    ? validateDimension(request.getDimension()) : current.getDimension();
            String value = validateValue(request != null ? request.getValue() : null);
            long now = System.currentTimeMillis();

            ProfileTrait atNewKey = store.findByKey(identity.tenantId, identity.userId, dimension, value);
            ProfileTrait trait = new ProfileTrait();
            trait.setTraitId(atNewKey != null ? atNewKey.getTraitId() : UUID.randomUUID().toString());
            trait.setTenantId(identity.tenantId);
            trait.setUserId(identity.userId);
            trait.setDimension(dimension);
            trait.setTraitValue(value);
            trait.setConfidence(100);
            trait.setSource(ProfileTrait.SOURCE_USER);
            trait.setStatus(ProfileTrait.STATUS_ACTIVE);
            trait.setLocked(true);
            trait.setEvidenceCount(current.getEvidenceCount() + 1);
            trait.setFirstSeen(current.getFirstSeen() > 0 ? current.getFirstSeen() : now);
            trait.setLastSeen(now);
            trait.setExpiresAt(0L);
            trait.setCreateTime(current.getCreateTime() > 0 ? current.getCreateTime() : now);
            trait.setUpdateTime(now);
            store.upsert(trait);
            if (!trait.getTraitId().equals(current.getTraitId())) {
                store.suppress(identity.tenantId, identity.userId, current.getTraitId());
                store.deleteEvidence(identity.tenantId, identity.userId, current.getTraitId());
            }
            return R.data(ProfileTraitView.of(trait));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("profile trait update failed for {}", traitId, e);
            return R.fail("更新画像失败");
        }
    }

    @ApiOperation("Delete one trait (tombstone; extraction can never revive it)")
    @DeleteMapping("/traits/{traitId}")
    public R<Map<String, Object>> delete(@PathVariable String traitId) {
        try {
            Identity identity = identity();
            boolean removed = store.suppress(identity.tenantId, identity.userId, traitId);
            // The tombstone keeps the key, but the evidence must be purged.
            store.deleteEvidence(identity.tenantId, identity.userId, traitId);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("traitId", traitId);
            result.put("removed", removed);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("profile trait delete failed for {}", traitId, e);
            return R.fail("删除画像失败");
        }
    }

    @ApiOperation("Purge all derived profile data for the caller")
    @DeleteMapping
    public R<Map<String, Object>> reset() {
        try {
            Identity identity = identity();
            store.purgeAll(identity.tenantId, identity.userId);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("reset", true);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("profile reset failed", e);
            return R.fail("重置画像失败");
        }
    }

    @ApiOperation("Read the profile opt-in state")
    @GetMapping("/consent")
    public R<Map<String, Object>> getConsent() {
        try {
            Identity identity = identity();
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("enabled", store.isConsentGiven(identity.tenantId, identity.userId));
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("profile consent read failed", e);
            return R.fail("读取画像授权失败");
        }
    }

    @ApiOperation("Opt in/out; opting out purges every derived trait and evidence row")
    @PutMapping("/consent")
    public R<Map<String, Object>> setConsent(@RequestBody ProfileConsentRequest request) {
        try {
            Identity identity = identity();
            boolean enabled = request != null && request.isEnabled();
            store.setConsent(identity.tenantId, identity.userId, enabled);
            if (!enabled) {
                store.purgeAll(identity.tenantId, identity.userId);
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("enabled", enabled);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("profile consent write failed", e);
            return R.fail("保存画像授权失败");
        }
    }

    // ==================== internals ====================

    private String validateDimension(String dimension) {
        if (dimension == null || dimension.trim().isEmpty()) {
            throw new IllegalArgumentException("dimension 不能为空");
        }
        ProfileDimension resolved = ProfileDimension.fromKey(dimension);
        if (resolved == null) {
            throw new IllegalArgumentException("不支持的画像维度");
        }
        return resolved.getKey();
    }

    private String validateValue(String value) {
        String normalized = ProfileMerger.normalizeValue(value);
        if (normalized == null || normalized.length() > MAX_VALUE_LENGTH) {
            throw new IllegalArgumentException("value 无效或过长");
        }
        if (ProfileSensitivity.isBlocked(normalized)) {
            throw new IllegalArgumentException("该内容涉及敏感属性，不允许作为画像");
        }
        return normalized;
    }

    private Identity identity() {
        Long userId = SecurityContextUtil.getUserId();
        Long tenantId = parseTenantId();
        if (userId == null || tenantId == null) {
            throw new IllegalArgumentException("PROFILE_IDENTITY_REQUIRED");
        }
        return new Identity(tenantId, userId);
    }

    private Long parseTenantId() {
        try {
            String tenantId = SecurityContextUtil.getTenantId();
            return tenantId == null || tenantId.trim().isEmpty()
                    ? null : Long.parseLong(tenantId.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static final class Identity {
        private final Long tenantId;
        private final Long userId;

        private Identity(Long tenantId, Long userId) {
            this.tenantId = tenantId;
            this.userId = userId;
        }
    }
}
