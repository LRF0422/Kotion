package com.knowledge.agent.core.web;

import com.knowledge.agent.core.savedskill.SavedSkill;
import com.knowledge.agent.core.savedskill.SavedSkillService;
import com.knowledge.agent.core.savedskill.SavedSkillStore;
import com.knowledge.agent.core.web.dto.SavedSkillView;
import com.knowledge.agent.core.web.dto.SetSavedSkillEnabledRequest;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Management and deterministic compilation API for personal saved skills. */
@Api(tags = "Agent Saved Skills")
@Slf4j
@RestController
@RequestMapping("/api/agent/v1/saved-skills")
public class SavedSkillController {

    private final SavedSkillService savedSkillService;

    public SavedSkillController(SavedSkillService savedSkillService) {
        this.savedSkillService = savedSkillService;
    }

    @ApiOperation("List personal saved skills")
    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(name = "enabled", required = false) Boolean enabled,
            @RequestParam(name = "offset", defaultValue = "0") int offset,
            @RequestParam(name = "limit", defaultValue = "20") int limit) {
        try {
            Identity identity = identity();
            List<SavedSkillView> items = new ArrayList<>();
            for (SavedSkill skill : savedSkillService.list(
                    identity.tenantId, identity.userId, enabled, offset, limit)) {
                items.add(SavedSkillView.of(skill));
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("count", items.size());
            result.put("items", items);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("Saved skill list failed", e);
            return R.fail("读取技能失败");
        }
    }

    @ApiOperation("Get one personal saved skill")
    @GetMapping("/{skillId}")
    public R<SavedSkillView> get(@PathVariable String skillId) {
        try {
            Identity identity = identity();
            SavedSkill skill = savedSkillService.get(identity.tenantId, identity.userId, skillId);
            return skill != null ? R.data(SavedSkillView.of(skill)) : R.fail("技能不存在");
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        }
    }

    @ApiOperation("Enable or disable one personal saved skill")
    @PostMapping("/{skillId}/enabled")
    public R<Map<String, Object>> setEnabled(@PathVariable String skillId,
                                             @RequestBody SetSavedSkillEnabledRequest request) {
        if (request == null || request.getEnabled() == null) {
            return R.fail("enabled is required");
        }
        try {
            Identity identity = identity();
            boolean updated = savedSkillService.setEnabled(
                    identity.tenantId, identity.userId, skillId, request.getEnabled());
            if (!updated) {
                return R.fail("技能不存在");
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("skillId", skillId);
            result.put("enabled", request.getEnabled());
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        }
    }

    @ApiOperation("Delete one personal saved skill")
    @DeleteMapping("/{skillId}")
    public R<Map<String, Object>> delete(@PathVariable String skillId) {
        try {
            Identity identity = identity();
            boolean removed = savedSkillService.delete(identity.tenantId, identity.userId, skillId);
            if (!removed) {
                return R.fail("技能不存在");
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("skillId", skillId);
            result.put("removed", true);
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        }
    }

    @ApiOperation("Compile an owned completed run into a personal saved skill")
    @PostMapping("/from-run/{runId}")
    public R<Map<String, Object>> saveFromRun(@PathVariable String runId) {
        try {
            Identity identity = identity();
            SavedSkillStore.SaveResult saved = savedSkillService.saveCompletedRun(
                    runId, identity.tenantId, identity.userId);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("skill", SavedSkillView.of(saved.getSkill()));
            result.put("created", saved.isCreated());
            return R.data(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.error("Saved skill compile failed for run {}", runId, e);
            return R.fail("生成技能失败");
        }
    }

    private Identity identity() {
        Long userId = SecurityContextUtil.getUserId();
        Long tenantId = parseTenantId();
        if (userId == null || tenantId == null) {
            throw new IllegalArgumentException("SAVED_SKILL_IDENTITY_REQUIRED");
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
