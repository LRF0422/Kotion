package com.knowledge.wiki.service.application;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper;
import com.github.yulichang.toolkit.MPJWrappers;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.wiki.service.converter.PluginConverter;
import com.knowledge.wiki.service.converter.PluginVersionConverter;
import com.knowledge.wiki.service.entity.InstalledPlugin;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginLogo;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.VersionDesc;
import com.knowledge.wiki.service.entity.dto.PluginBatchReviewDTO;
import com.knowledge.wiki.service.entity.dto.PluginDTO;
import com.knowledge.wiki.service.entity.dto.PluginReviewDTO;
import com.knowledge.wiki.service.entity.dto.PluginSubmissionDTO;
import com.knowledge.wiki.service.entity.dto.PluginVersionPublishDTO;
import com.knowledge.wiki.service.entity.dto.QueryAdminPluginDTO;
import com.knowledge.wiki.service.entity.dto.QueryPluginDTO;
import com.knowledge.wiki.service.entity.dto.TagDTO;
import com.knowledge.wiki.service.entity.enums.PluginCategory;
import com.knowledge.wiki.service.entity.enums.PluginReviewDecision;
import com.knowledge.wiki.service.entity.enums.PluginReviewReason;
import com.knowledge.wiki.service.entity.enums.PluginStatus;
import com.knowledge.wiki.service.entity.vo.PluginBatchReviewFailureVO;
import com.knowledge.wiki.service.entity.vo.PluginBatchReviewResultVO;
import com.knowledge.wiki.service.entity.vo.PluginReviewReasonCountVO;
import com.knowledge.wiki.service.entity.vo.PluginReviewStatsVO;
import com.knowledge.wiki.service.entity.vo.PluginVO;
import com.knowledge.wiki.service.entity.vo.PluginVersionVO;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.service.IInstalledPluginService;
import com.knowledge.wiki.service.service.IPluginService;
import com.knowledge.wiki.service.service.IPluginTagService;
import com.knowledge.wiki.service.service.IPluginVersionService;
import com.knowledge.wiki.service.util.PluginSubmissionValidator;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class PluginApplication {

    @Autowired
    private IPluginService pluginService;
    @Autowired
    private IPluginVersionService pluginVersionService;
    @Autowired
    private IPluginTagService pluginTagService;
    @Autowired
    private IInstalledPluginService installedPluginService;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired(required = false)
    private PluginReviewNotifier reviewNotifier;

    /**
     * Backward-compatible adapter for the historical POST /plugin payload. New
     * clients should use /plugin/submissions and /plugin/{id}/versions.
     */
    @Transactional(rollbackFor = Exception.class)
    public void createPlugin(PluginDTO dto) {
        createLegacyPlugin(dto, false);
    }

    @Transactional(rollbackFor = Exception.class)
    public void createInnerPlugin(PluginDTO dto) {
        requireAdministrator();
        createLegacyPlugin(dto, true);
    }

    private void createLegacyPlugin(PluginDTO dto, boolean trustedInner) {
        Plugin plugin = dto.getId() == null ? pluginService.getByKey(dto.getPluginKey()) : requirePlugin(dto.getId());
        if (plugin == null) {
            PluginSubmissionDTO submission = legacySubmission(dto);
            Long ownerId = trustedInner ? legacyOwner(dto) : currentUserId();
            plugin = submitInternal(submission, ownerId, trustedInner && dto.isPublish());
            if (StrUtil.isBlank(plugin.getDeveloper()) && StrUtil.isNotBlank(dto.getDeveloperName())) {
                plugin.setDeveloper(StrUtil.trim(dto.getDeveloperName()));
                plugin.setMaintainer(StrUtil.trim(dto.getDeveloperName()));
                pluginService.updateById(plugin);
            }
            if (trustedInner && dto.isPublish()) {
                startReview(plugin, null);
                approve(plugin, null);
            }
            return;
        }

        if (!trustedInner) {
            requireOwner(plugin, currentUserId());
        }
        if (dto.isPublish()) {
            PluginVersion current = pluginVersionService.getCurrentActiveVersion(plugin.getId());
            PluginVersionPublishDTO publish = new PluginVersionPublishDTO();
            publish.setVersion(StrUtil.isNotBlank(dto.getVersion()) ? dto.getVersion()
                    : current == null ? "1.0.0" : PluginSubmissionValidator.nextPatchVersion(current.getVersion()));
            publish.setResourcePath(dto.getResourcePath());
            publish.setIntegrity(dto.getIntegrity());
            publish.setVersionDescs(legacyVersionDescriptions(dto, current));
            createVersionInternal(plugin, publish, trustedInner);
            if (trustedInner) {
                startReview(plugin, null);
                approve(plugin, null);
            }
        } else {
            PluginSubmissionDTO submission = mergeLegacyResubmission(plugin, dto);
            resubmitInternal(plugin, submission, false);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public PluginVO submit(PluginSubmissionDTO dto) {
        return toSubmissionVO(submitInternal(dto, currentUserId(), true));
    }

    @Transactional(rollbackFor = Exception.class)
    public PluginVO resubmit(Long id, PluginSubmissionDTO dto) {
        Plugin plugin = requirePlugin(id);
        requireOwner(plugin, currentUserId());
        return toSubmissionVO(resubmitInternal(plugin, dto, true));
    }

    @Transactional(rollbackFor = Exception.class)
    public PluginVO publishVersion(Long pluginId, PluginVersionPublishDTO dto) {
        Plugin plugin = requirePlugin(pluginId);
        requireOwner(plugin, currentUserId());
        createVersionInternal(plugin, dto, true);
        return toSubmissionVO(plugin);
    }

    @Transactional(rollbackFor = Exception.class)
    public PluginVO review(Long id, PluginReviewDTO dto) {
        requirePermission("platform.plugins.review");
        Plugin plugin = requirePlugin(id);
        PluginReviewDecision decision = dto.getDecision();
        String reason = StrUtil.trim(dto.getReason());
        if (decision == PluginReviewDecision.START) {
            startReview(plugin, reason);
        } else if (decision == PluginReviewDecision.APPROVE) {
            approve(plugin, reason);
        } else if (decision == PluginReviewDecision.REJECT) {
            requireRejectionReason(reason, dto.getReasonCode());
            reject(plugin, reason, dto.getReasonCode());
        } else {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        Plugin refreshed = requirePlugin(id);
        if (decision != PluginReviewDecision.START) {
            notifyReviewDecision(refreshed, decision, reason, dto.getReasonCode());
        }
        return toSubmissionVO(refreshed);
    }

    private void requireRejectionReason(String reason, PluginReviewReason reasonCode) {
        if (StrUtil.isBlank(reason)) {
            throw WikiException.PLUGIN_REVIEW_REASON_REQUIRED.newException();
        }
        if (reasonCode == null) {
            throw WikiException.PLUGIN_REVIEW_REASON_CODE_REQUIRED.newException();
        }
    }

    /**
     * Reviewer claims the current candidate. Claiming is optimistic: the update
     * only succeeds while the row is still unclaimed or already owned by the caller.
     */
    @Transactional(rollbackFor = Exception.class)
    public PluginVO claim(Long pluginId) {
        requirePermission("platform.plugins.review");
        requirePlugin(pluginId);
        PluginVersion candidate = requirePendingCandidate(pluginId);
        Long me = currentUserId();
        if (candidate.getClaimedBy() != null && !Objects.equals(candidate.getClaimedBy(), me)) {
            throw WikiException.PLUGIN_ALREADY_CLAIMED.newException();
        }
        LambdaUpdateChainWrapper<PluginVersion> claimUpdate = pluginVersionService.lambdaUpdate()
                .eq(PluginVersion::getId, candidate.getId());
        if (candidate.getClaimedBy() == null) {
            // Only the first reviewer to flip a null claim wins the race.
            claimUpdate.isNull(PluginVersion::getClaimedBy);
        } else {
            claimUpdate.eq(PluginVersion::getClaimedBy, me);
        }
        boolean claimed = claimUpdate
                .set(PluginVersion::getClaimedBy, me)
                .set(PluginVersion::getClaimedByName, StrUtil.trim(SecurityContextUtil.getUserName()))
                .set(PluginVersion::getClaimedTime, LocalDateTime.now())
                .update();
        if (!claimed) {
            throw WikiException.PLUGIN_ALREADY_CLAIMED.newException();
        }
        return toSubmissionVO(requirePlugin(pluginId));
    }

    /** Release a candidate the caller currently owns so others can pick it up. */
    @Transactional(rollbackFor = Exception.class)
    public PluginVO release(Long pluginId) {
        requirePermission("platform.plugins.review");
        requirePlugin(pluginId);
        PluginVersion candidate = requirePendingCandidate(pluginId);
        Long me = currentUserId();
        if (candidate.getClaimedBy() != null && !Objects.equals(candidate.getClaimedBy(), me)) {
            throw WikiException.PLUGIN_NOT_CLAIMED_BY_YOU.newException();
        }
        pluginVersionService.lambdaUpdate()
                .eq(PluginVersion::getId, candidate.getId())
                .set(PluginVersion::getClaimedBy, null)
                .set(PluginVersion::getClaimedByName, null)
                .set(PluginVersion::getClaimedTime, null)
                .update();
        return toSubmissionVO(requirePlugin(pluginId));
    }

    /**
     * Apply one decision to several plugins. Each item runs in its own transaction
     * so a single invalid row is reported without rolling back the rest.
     */
    public PluginBatchReviewResultVO batchReview(PluginBatchReviewDTO dto) {
        requirePermission("platform.plugins.review");
        PluginReviewDecision decision = dto.getDecision();
        if (decision == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        String reason = StrUtil.trim(dto.getReason());
        if (decision == PluginReviewDecision.REJECT) {
            requireRejectionReason(reason, dto.getReasonCode());
        }
        List<Long> ids = dto.getIds() == null ? new ArrayList<>()
                : dto.getIds().stream().filter(Objects::nonNull).distinct().collect(Collectors.toList());
        PluginBatchReviewResultVO result = new PluginBatchReviewResultVO();
        result.setRequested(ids.size());
        if (ids.isEmpty()) {
            return result;
        }
        PluginReviewDTO single = new PluginReviewDTO();
        single.setDecision(decision);
        single.setReason(reason);
        single.setReasonCode(dto.getReasonCode());
        for (Long id : ids) {
            try {
                if (transactionManager == null) {
                    review(id, single);
                } else {
                    new TransactionTemplate(transactionManager)
                            .execute(status -> {
                                review(id, single);
                                return null;
                            });
                }
                result.setSucceeded(result.getSucceeded() + 1);
            } catch (Exception ex) {
                result.getFailures().add(new PluginBatchReviewFailureVO(id,
                        StrUtil.isBlank(ex.getMessage()) ? "审核失败" : ex.getMessage()));
            }
        }
        return result;
    }

    /** Aggregate review health for the admin console. */
    public PluginReviewStatsVO reviewStats() {
        requirePermission("platform.plugins.read");
        PluginReviewStatsVO stats = new PluginReviewStatsVO();
        // Plugin-level terminal states give the approval rate.
        for (Plugin plugin : pluginService.lambdaQuery().list()) {
            PluginStatus status = plugin.getStatus();
            if (status == null) {
                continue;
            }
            if (status == PluginStatus.DONE) {
                stats.setApproved(stats.getApproved() + 1);
            } else if (status == PluginStatus.REJECTED) {
                stats.setRejected(stats.getRejected() + 1);
            }
        }
        long decisions = stats.getApproved() + stats.getRejected();
        stats.setApprovalRate(decisions == 0 ? 0D : (double) stats.getApproved() / decisions);

        long totalMinutes = 0;
        long decided = 0;
        Map<PluginReviewReason, Long> reasonCounts = new EnumMap<>(PluginReviewReason.class);
        for (PluginVersion version : pluginVersionService.lambdaQuery().list()) {
            // Queue size tracks candidate versions so pending updates are counted too.
            if (version.getReviewStatus() == PluginStatus.PENDING) {
                stats.setPending(stats.getPending() + 1);
            } else if (version.getReviewStatus() == PluginStatus.IN_PROGRESS) {
                stats.setInProgress(stats.getInProgress() + 1);
            }
            if (version.getReviewStatus() == PluginStatus.REJECTED && version.getReviewReasonCode() != null) {
                reasonCounts.merge(version.getReviewReasonCode(), 1L, Long::sum);
            }
            boolean isDecision = version.getReviewStatus() == PluginStatus.DONE
                    || version.getReviewStatus() == PluginStatus.REJECTED;
            if (isDecision && version.getReviewTime() != null && version.getCreateTime() != null) {
                totalMinutes += Math.max(0,
                        Duration.between(version.getCreateTime(), version.getReviewTime()).toMinutes());
                decided++;
            }
        }
        if (decided > 0) {
            stats.setAverageReviewHours((double) totalMinutes / decided / 60D);
        }
        List<PluginReviewReasonCountVO> reasons = new ArrayList<>();
        for (PluginReviewReason reason : PluginReviewReason.values()) {
            reasons.add(new PluginReviewReasonCountVO(reason, reasonCounts.getOrDefault(reason, 0L)));
        }
        stats.setReasons(reasons);
        return stats;
    }

    public IPage<PluginVO> mySubmissions(QueryPluginDTO dto) {
        Long ownerId = currentUserId();
        IPage<Plugin> page = pluginService.page(dto.page(), Wrappers.<Plugin>lambdaQuery()
                .eq(Plugin::getDeveloperId, ownerId)
                .eq(dto.getCategory() != null, Plugin::getCategory, dto.getCategory())
                .and(StrUtil.isNotBlank(dto.getSearchValue()), wrapper -> wrapper
                        .like(Plugin::getName, dto.getSearchValue())
                        .or()
                        .like(Plugin::getPluginKey, dto.getSearchValue()))
                .orderByDesc(Plugin::getUpdateTime));
        return page.convert(this::toSubmissionVO);
    }

    public IPage<PluginVO> adminReviewList(QueryAdminPluginDTO dto) {
        requirePermission("platform.plugins.read");
        return pluginService.pageAdminReviewPlugins(dto).convert(this::toSubmissionVO);
    }

    public PluginVO adminReviewDetail(Long id) {
        requirePermission("platform.plugins.read");
        return toSubmissionVO(requirePlugin(id));
    }

    /** Full version history (newest first) for the admin review timeline. */
    public List<PluginVersionVO> adminReviewVersions(Long id) {
        requirePermission("platform.plugins.read");
        requirePlugin(id);
        return PluginVersionConverter.INSTANCE.convertVO(pluginVersionService.listVersions(id));
    }

    public PluginVO detail(Long id) {
        Plugin plugin = requirePlugin(id);
        if (plugin.getStatus() != PluginStatus.DONE) {
            throw WikiException.PLUGIN_NOT_FOUND.newException();
        }
        PluginVersion activeVersion = pluginService.getActiveVersion(id);
        if (activeVersion == null || activeVersion.getStatus() != VersionStatus.ACTIVE) {
            throw WikiException.PLUGIN_VERSION_NOT_FOUND.newException();
        }
        PluginVO vo = PluginConverter.INSTANCE.convertVO(plugin);
        vo.setCurrentVersion(PluginVersionConverter.INSTANCE.convertVO(activeVersion));
        vo.setCurrentVersionId(activeVersion.getId());
        vo.setResourcePath(activeVersion.getResourcePath());
        vo.setIntegrity(activeVersion.getIntegrity());
        vo.setInstalleddVersions(PluginVersionConverter.INSTANCE.convertVO(pluginService.checkInstall(id)));
        InstalledPlugin record = installedPluginService.getInstallRecord(id);
        vo.setInstallStatus(record == null ? null : record.getStatus());
        vo.setTags(pluginTagService.listTagContents(id));
        return vo;
    }

    public List<PluginVersionVO> getInstalledPlugins() {
        List<PluginVersion> installedPlugins = pluginService.getInstalledPlugins(null, null);
        return PluginVersionConverter.INSTANCE.convertVO(installedPlugins);
    }

    public void installPlugin(Long pluginVersionId) {
        PluginVersion version = pluginVersionService.getById(pluginVersionId);
        if (version == null || version.getStatus() != VersionStatus.ACTIVE) {
            throw WikiException.PLUGIN_VERSION_NOT_FOUND.newException();
        }
        Plugin plugin = requirePlugin(version.getSubjectId());
        if (plugin.getStatus() != PluginStatus.DONE) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        this.pluginService.installPlugin(pluginVersionId);
    }

    public void uninstall(Long pluginVersionId) {
        this.pluginService.uninstallPlugin(pluginVersionId);
    }

    public IPage<PluginVO> searchPlugin(QueryPluginDTO dto) {
        MPJLambdaWrapper<Plugin> wrapper = MPJWrappers.lambdaJoin(Plugin.class);
        wrapper.leftJoin(PluginVersion.class, PluginVersion::getSubjectId, Plugin::getId)
                .like(StrUtil.isNotBlank(dto.getSearchValue()), Plugin::getName, dto.getSearchValue())
                .selectAll(Plugin.class)
                .selectAs(PluginVersion::getId, PluginVO::getCurrentVersionId)
                .selectAs(PluginVersion::getResourcePath, PluginVO::getResourcePath)
                .selectAs(PluginVersion::getIntegrity, PluginVO::getIntegrity)
                .eq(dto.getCategory() != null, Plugin::getCategory, dto.getCategory())
                .eq(Plugin::getStatus, PluginStatus.DONE)
                .eq(PluginVersion::getStatus, VersionStatus.ACTIVE);
        IPage<PluginVO> page = this.pluginService.selectJoinListPage(dto.page(), PluginVO.class, wrapper);
        page.getRecords().forEach(it -> {
            it.setTags(pluginTagService.listTagContents(it.getId()));
            it.setInstalleddVersions(PluginVersionConverter.INSTANCE.convertVO(pluginService.checkInstall(it.getId())));
            InstalledPlugin record = installedPluginService.getInstallRecord(it.getId());
            it.setInstallStatus(record == null ? null : record.getStatus());
        });
        return page;
    }

    public void updatePluginToLatestVersion(Long pluginVersionId) {
        this.pluginService.updatePluginToLatestVersion(pluginVersionId);
    }

    public void enable(Long versionId) {
        this.pluginService.enablePlugin(versionId);
    }

    public void disable(Long versionId) {
        this.pluginService.disablePlugin(versionId);
    }

    public void deleteInstalled(Long versionId) {
        this.pluginService.deleteInstalledPlugin(versionId);
    }

    private Plugin submitInternal(PluginSubmissionDTO dto, Long ownerId, boolean requireIntegrity) {
        prepareSubmission(dto, requireIntegrity);
        if (pluginService.getByKey(dto.getPluginKey()) != null) {
            throw WikiException.PLUGIN_EXISTS.newException();
        }

        Plugin plugin = new Plugin();
        applySubmission(plugin, dto);
        plugin.setDeveloperId(ownerId);
        plugin.setMaintainerId(ownerId);
        String ownerName = SecurityContextUtil.getUserName();
        plugin.setDeveloper(ownerName);
        plugin.setMaintainer(ownerName);
        plugin.setStatus(PluginStatus.PENDING);
        plugin.setInstallCtn(0L);
        plugin.setFavoriteCtn(0L);
        plugin.setDownloads(0L);
        plugin.setRating(0D);
        plugin.setReviews(0L);
        try {
            pluginService.save(plugin);
        } catch (DuplicateKeyException ex) {
            throw WikiException.PLUGIN_EXISTS.newException(ex);
        }

        PluginVersion candidate = candidate(plugin.getId(), dto.getVersion(), dto.getResourcePath(),
                dto.getIntegrity(), dto.getVersionDescs());
        saveCandidate(candidate);
        pluginTagService.replaceTags(plugin.getId(), dto.getTags());
        log.info("Plugin {} submitted by user {}", plugin.getPluginKey(), ownerId);
        return plugin;
    }

    private Plugin resubmitInternal(Plugin plugin, PluginSubmissionDTO dto, boolean requireIntegrity) {
        PluginVersion active = pluginVersionService.getCurrentActiveVersion(plugin.getId());
        boolean initialSubmission = plugin.getStatus() == PluginStatus.REJECTED && active == null;
        boolean laterVersion = plugin.getStatus() == PluginStatus.DONE && active != null;
        if (!initialSubmission && !laterVersion) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        prepareSubmission(dto, requireIntegrity);
        if (!Objects.equals(plugin.getPluginKey(), dto.getPluginKey())) {
            throw WikiException.INVALID_PARAMETER.newException("pluginKey不可修改");
        }
        PluginVersion candidate = pluginVersionService.getRejectedCandidate(plugin.getId());
        if (candidate == null) {
            throw WikiException.PLUGIN_VERSION_NOT_FOUND.newException();
        }
        assertVersionAvailable(plugin.getId(), dto.getVersion(), candidate.getId());
        assertNewerThanActive(plugin.getId(), dto.getVersion());
        if (initialSubmission) {
            boolean claimed = pluginService.lambdaUpdate()
                    .eq(Plugin::getId, plugin.getId())
                    .eq(Plugin::getStatus, PluginStatus.REJECTED)
                    .set(Plugin::getStatus, PluginStatus.PENDING)
                    .update();
            if (!claimed) {
                throw WikiException.PLUGIN_INVALID_STATE.newException();
            }
        }

        applySubmission(plugin, dto);
        plugin.setStatus(initialSubmission ? PluginStatus.PENDING : PluginStatus.DONE);
        pluginService.lambdaUpdate()
                .eq(Plugin::getId, plugin.getId())
                .set(Plugin::getName, plugin.getName())
                .set(Plugin::getDescription, plugin.getDescription())
                .set(Plugin::getCategory, plugin.getCategory())
                .set(Plugin::getIcon, plugin.getIcon())
                .set(Plugin::getIconMd, plugin.getIconMd())
                .set(Plugin::getIconLg, plugin.getIconLg())
                .set(Plugin::getIconXl, plugin.getIconXl())
                .set(Plugin::getStatus, plugin.getStatus())
                .update();

        candidate.setVersion(dto.getVersion());
        candidate.setResourcePath(dto.getResourcePath());
        candidate.setIntegrity(dto.getIntegrity());
        candidate.setVersionDescription(dto.getVersionDescs());
        candidate.setStatus(VersionStatus.PENDING);
        candidate.setReviewStatus(PluginStatus.PENDING);
        clearReviewAudit(candidate.getId());
        pluginVersionService.updateById(candidate);
        pluginTagService.replaceTags(plugin.getId(), dto.getTags());
        return plugin;
    }

    private void createVersionInternal(Plugin plugin, PluginVersionPublishDTO dto, boolean requireIntegrity) {
        plugin = pluginService.getByIdForUpdate(plugin.getId());
        if (plugin == null || plugin.getStatus() != PluginStatus.DONE
                || pluginVersionService.getPendingVersion(plugin.getId()) != null) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        dto.setVersion(PluginSubmissionValidator.requireSemanticVersion(dto.getVersion()));
        dto.setResourcePath(PluginSubmissionValidator.requireJavaScriptPath(dto.getResourcePath()));
        dto.setIntegrity(requireIntegrity ? PluginSubmissionValidator.requireIntegrity(dto.getIntegrity())
                : StrUtil.trim(dto.getIntegrity()));
        PluginSubmissionValidator.validateVersionDescriptions(dto.getVersionDescs());
        PluginVersion candidate = pluginVersionService.getRejectedCandidate(plugin.getId());
        assertVersionAvailable(plugin.getId(), dto.getVersion(), candidate == null ? null : candidate.getId());
        assertNewerThanActive(plugin.getId(), dto.getVersion());

        if (candidate == null) {
            candidate = candidate(plugin.getId(), dto.getVersion(), dto.getResourcePath(),
                    dto.getIntegrity(), dto.getVersionDescs());
            saveCandidate(candidate);
        } else {
            candidate.setVersion(dto.getVersion());
            candidate.setResourcePath(dto.getResourcePath());
            candidate.setIntegrity(dto.getIntegrity());
            candidate.setVersionDescription(dto.getVersionDescs());
            candidate.setStatus(VersionStatus.PENDING);
            candidate.setReviewStatus(PluginStatus.PENDING);
            clearReviewAudit(candidate.getId());
            pluginVersionService.updateById(candidate);
        }
    }

    private void startReview(Plugin plugin, String reason) {
        PluginVersion candidate = requirePendingCandidate(plugin.getId());
        if (candidate.getReviewStatus() != PluginStatus.PENDING) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        PluginVersion active = pluginVersionService.getCurrentActiveVersion(plugin.getId());
        if (active == null && plugin.getStatus() != PluginStatus.PENDING) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        if (active != null && plugin.getStatus() != PluginStatus.DONE) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        ReviewAudit audit = audit(reason);
        boolean candidateClaimed = pluginVersionService.lambdaUpdate()
                .eq(PluginVersion::getId, candidate.getId())
                .eq(PluginVersion::getStatus, VersionStatus.PENDING)
                .eq(PluginVersion::getReviewStatus, PluginStatus.PENDING)
                .set(PluginVersion::getReviewStatus, PluginStatus.IN_PROGRESS)
                .set(PluginVersion::getReviewComment, audit.comment)
                .set(PluginVersion::getReviewReasonCode, null)
                .set(PluginVersion::getReviewerId, audit.reviewerId)
                .set(PluginVersion::getReviewerName, audit.reviewerName)
                .set(PluginVersion::getReviewTime, audit.reviewTime)
                .update();
        if (!candidateClaimed) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        audit.apply(candidate);
        candidate.setReviewStatus(PluginStatus.IN_PROGRESS);
        if (active == null) {
            boolean pluginClaimed = pluginService.lambdaUpdate()
                    .eq(Plugin::getId, plugin.getId())
                    .eq(Plugin::getStatus, PluginStatus.PENDING)
                    .set(Plugin::getStatus, PluginStatus.IN_PROGRESS)
                    .update();
            if (!pluginClaimed) {
                throw WikiException.PLUGIN_INVALID_STATE.newException();
            }
            plugin.setStatus(PluginStatus.IN_PROGRESS);
        }
    }

    private void reject(Plugin plugin, String reason, PluginReviewReason reasonCode) {
        PluginVersion candidate = requirePendingCandidate(plugin.getId());
        if (candidate.getReviewStatus() != PluginStatus.IN_PROGRESS) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        PluginVersion active = pluginVersionService.getCurrentActiveVersion(plugin.getId());
        ReviewAudit audit = audit(reason);
        boolean candidateClaimed = pluginVersionService.lambdaUpdate()
                .eq(PluginVersion::getId, candidate.getId())
                .eq(PluginVersion::getStatus, VersionStatus.PENDING)
                .eq(PluginVersion::getReviewStatus, PluginStatus.IN_PROGRESS)
                .set(PluginVersion::getStatus, VersionStatus.DRAFT)
                .set(PluginVersion::getReviewStatus, PluginStatus.REJECTED)
                .set(PluginVersion::getReviewComment, audit.comment)
                .set(PluginVersion::getReviewReasonCode, reasonCode)
                .set(PluginVersion::getReviewerId, audit.reviewerId)
                .set(PluginVersion::getReviewerName, audit.reviewerName)
                .set(PluginVersion::getReviewTime, audit.reviewTime)
                .update();
        if (!candidateClaimed) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        audit.apply(candidate);
        candidate.setStatus(VersionStatus.DRAFT);
        candidate.setReviewStatus(PluginStatus.REJECTED);
        candidate.setReviewReasonCode(reasonCode);
        if (active == null) {
            boolean pluginClaimed = pluginService.lambdaUpdate()
                    .eq(Plugin::getId, plugin.getId())
                    .eq(Plugin::getStatus, PluginStatus.IN_PROGRESS)
                    .set(Plugin::getStatus, PluginStatus.REJECTED)
                    .update();
            if (!pluginClaimed) {
                throw WikiException.PLUGIN_INVALID_STATE.newException();
            }
            plugin.setStatus(PluginStatus.REJECTED);
        }
    }

    private void approve(Plugin plugin, String reason) {
        PluginVersion candidate = requirePendingCandidate(plugin.getId());
        if (candidate.getReviewStatus() != PluginStatus.IN_PROGRESS) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        candidate.setIntegrity(PluginSubmissionValidator.requireIntegrity(candidate.getIntegrity()));
        candidate.setResourcePath(PluginSubmissionValidator.requireJavaScriptPath(candidate.getResourcePath()));
        PluginVersion active = pluginVersionService.getCurrentActiveVersion(plugin.getId());
        // Keep the START note when no approval comment is supplied.
        String comment = StrUtil.isNotBlank(reason) ? StrUtil.trim(reason) : candidate.getReviewComment();
        ReviewAudit audit = audit(comment);
        boolean candidateClaimed = pluginVersionService.lambdaUpdate()
                .eq(PluginVersion::getId, candidate.getId())
                .eq(PluginVersion::getStatus, VersionStatus.PENDING)
                .eq(PluginVersion::getReviewStatus, PluginStatus.IN_PROGRESS)
                .set(PluginVersion::getReviewStatus, PluginStatus.DONE)
                .set(PluginVersion::getReviewComment, audit.comment)
                .set(PluginVersion::getReviewReasonCode, null)
                .set(PluginVersion::getReviewerId, audit.reviewerId)
                .set(PluginVersion::getReviewerName, audit.reviewerName)
                .set(PluginVersion::getReviewTime, audit.reviewTime)
                .update();
        if (!candidateClaimed) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        audit.apply(candidate);
        if (active == null) {
            boolean pluginClaimed = pluginService.lambdaUpdate()
                    .eq(Plugin::getId, plugin.getId())
                    .eq(Plugin::getStatus, PluginStatus.IN_PROGRESS)
                    .set(Plugin::getStatus, PluginStatus.DONE)
                    .update();
            if (!pluginClaimed) {
                throw WikiException.PLUGIN_INVALID_STATE.newException();
            }
        } else if (plugin.getStatus() != PluginStatus.DONE) {
            throw WikiException.PLUGIN_INVALID_STATE.newException();
        }
        if (active != null && !Objects.equals(active.getId(), candidate.getId())) {
            active.setStatus(VersionStatus.IN_ACTIVE);
            pluginVersionService.updateById(active);
            candidate.setLastVersionId(active.getId());
        }
        candidate.setStatus(VersionStatus.ACTIVE);
        candidate.setReviewStatus(PluginStatus.DONE);
        pluginVersionService.updateById(candidate);
        plugin.setCurrentVersionId(candidate.getId());
        plugin.setStatus(PluginStatus.DONE);
        pluginService.updateById(plugin);
    }

    private void prepareSubmission(PluginSubmissionDTO dto, boolean requireIntegrity) {
        dto.setName(PluginSubmissionValidator.requireText(dto.getName(), 2, 50));
        dto.setPluginKey(PluginSubmissionValidator.requirePluginKey(dto.getPluginKey()));
        dto.setDescription(PluginSubmissionValidator.requireText(dto.getDescription(), 10, 500));
        dto.setVersion(PluginSubmissionValidator.requireSemanticVersion(dto.getVersion()));
        dto.setTags(PluginSubmissionValidator.normalizeTags(dto.getTags()));
        dto.setIcon(PluginSubmissionValidator.optionalObjectPath(dto.getIcon()));
        dto.setResourcePath(PluginSubmissionValidator.requireJavaScriptPath(dto.getResourcePath()));
        dto.setIntegrity(requireIntegrity ? PluginSubmissionValidator.requireIntegrity(dto.getIntegrity())
                : StrUtil.trim(dto.getIntegrity()));
        if (dto.getCategory() == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        PluginSubmissionValidator.validateVersionDescriptions(dto.getVersionDescs());
    }

    private void applySubmission(Plugin plugin, PluginSubmissionDTO dto) {
        plugin.setName(dto.getName());
        plugin.setPluginKey(dto.getPluginKey());
        plugin.setDescription(dto.getDescription());
        plugin.setCategory(dto.getCategory());
        plugin.setIcon(dto.getIcon());
        plugin.setIconMd(dto.getIcon());
        plugin.setIconLg(dto.getIcon());
        plugin.setIconXl(dto.getIcon());
    }

    private PluginVersion candidate(Long pluginId, String version, String resourcePath, String integrity,
            List<com.knowledge.wiki.service.entity.VersionDesc> descriptions) {
        PluginVersion candidate = new PluginVersion();
        candidate.setSubjectId(pluginId);
        candidate.setVersion(version);
        candidate.setResourcePath(resourcePath);
        candidate.setIntegrity(integrity);
        candidate.setVersionDescription(descriptions);
        candidate.setStatus(VersionStatus.PENDING);
        candidate.setReviewStatus(PluginStatus.PENDING);
        return candidate;
    }

    private void saveCandidate(PluginVersion candidate) {
        try {
            pluginVersionService.save(candidate);
        } catch (DuplicateKeyException ex) {
            throw WikiException.PLUGIN_VERSION_EXISTS.newException(ex);
        }
    }

    private void assertVersionAvailable(Long pluginId, String version, Long excludedVersionId) {
        if (pluginVersionService.versionExists(pluginId, version, excludedVersionId)) {
            throw WikiException.PLUGIN_VERSION_EXISTS.newException();
        }
    }

    private void assertNewerThanActive(Long pluginId, String version) {
        PluginVersion active = pluginVersionService.getCurrentActiveVersion(pluginId);
        if (active != null && PluginSubmissionValidator.compareSemanticVersions(version, active.getVersion()) <= 0) {
            throw WikiException.PLUGIN_INVALID_VERSION.newException("新版本必须高于当前激活版本");
        }
    }

    private PluginVersion requirePendingCandidate(Long pluginId) {
        PluginVersion candidate = pluginVersionService.getPendingVersion(pluginId);
        if (candidate == null) {
            throw WikiException.PLUGIN_VERSION_NOT_FOUND.newException();
        }
        return candidate;
    }

    private Plugin requirePlugin(Long id) {
        Plugin plugin = pluginService.getById(id);
        if (plugin == null) {
            throw WikiException.PLUGIN_NOT_FOUND.newException();
        }
        return plugin;
    }

    private void requireOwner(Plugin plugin, Long userId) {
        if (!Objects.equals(plugin.getDeveloperId(), userId)) {
            throw WikiException.PLUGIN_FORBIDDEN.newException();
        }
    }

    private void requireAdministrator() {
        requireAuthority(null);
    }

    private void requirePermission(String permission) {
        requireAuthority("ROLE_" + permission);
    }

    private void requireAuthority(String expectedAuthority) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        boolean allowed = authentication != null && authentication.isAuthenticated()
                && authentication.getAuthorities().stream().anyMatch(authority -> {
                    String name = authority.getAuthority();
                    return "ROLE_administrator".equalsIgnoreCase(name)
                            || "ROLE_admin".equalsIgnoreCase(name)
                            || expectedAuthority != null && expectedAuthority.equalsIgnoreCase(name);
                });
        if (!allowed) {
            throw WikiException.PLUGIN_FORBIDDEN.newException();
        }
    }

    private Long currentUserId() {
        Long userId = SecurityContextUtil.getUserId();
        if (userId == null || userId <= 0) {
            throw WikiException.PLUGIN_FORBIDDEN.newException();
        }
        return userId;
    }

    private ReviewAudit audit(String comment) {
        return new ReviewAudit(StrUtil.trim(comment), currentUserId(),
                StrUtil.trim(SecurityContextUtil.getUserName()), LocalDateTime.now());
    }

    /** Drop stale decision/claim metadata when a rejected candidate is resubmitted or reused. */
    private void clearReviewAudit(Long versionId) {
        pluginVersionService.lambdaUpdate()
                .eq(PluginVersion::getId, versionId)
                .set(PluginVersion::getReviewComment, null)
                .set(PluginVersion::getReviewReasonCode, null)
                .set(PluginVersion::getReviewerId, null)
                .set(PluginVersion::getReviewerName, null)
                .set(PluginVersion::getReviewTime, null)
                .set(PluginVersion::getClaimedBy, null)
                .set(PluginVersion::getClaimedByName, null)
                .set(PluginVersion::getClaimedTime, null)
                .update();
    }

    private void notifyReviewDecision(Plugin plugin, PluginReviewDecision decision, String reason,
            PluginReviewReason reasonCode) {
        if (reviewNotifier == null) {
            return;
        }
        reviewNotifier.notifyDecision(SecurityContextUtil.getUserId(), plugin,
                pluginVersionService.getLatestVersion(plugin.getId()), decision, reason, reasonCode);
    }

    /** Snapshot of the acting reviewer, applied to the SQL update and the in-memory entity. */
    private static final class ReviewAudit {
        private final String comment;
        private final Long reviewerId;
        private final String reviewerName;
        private final LocalDateTime reviewTime;

        private ReviewAudit(String comment, Long reviewerId, String reviewerName, LocalDateTime reviewTime) {
            this.comment = comment;
            this.reviewerId = reviewerId;
            this.reviewerName = reviewerName;
            this.reviewTime = reviewTime;
        }

        private void apply(PluginVersion candidate) {
            candidate.setReviewComment(comment);
            candidate.setReviewerId(reviewerId);
            candidate.setReviewerName(reviewerName);
            candidate.setReviewTime(reviewTime);
        }
    }

    private Long legacyOwner(PluginDTO dto) {
        Long userId = SecurityContextUtil.getUserId();
        if (userId != null && userId > 0) {
            return userId;
        }
        if (dto.getDeveloperId() != null && dto.getDeveloperId() > 0) {
            return dto.getDeveloperId();
        }
        throw WikiException.PLUGIN_FORBIDDEN.newException();
    }

    private PluginVO toSubmissionVO(Plugin plugin) {
        PluginVO vo = PluginConverter.INSTANCE.convertVO(plugin);
        vo.setTags(pluginTagService.listTagContents(plugin.getId()));
        PluginVersion active = pluginVersionService.getCurrentActiveVersion(plugin.getId());
        if (active != null) {
            vo.setCurrentVersion(PluginVersionConverter.INSTANCE.convertVO(active));
        }
        PluginVersion candidate = pluginVersionService.getPendingVersion(plugin.getId());
        if (candidate == null) {
            PluginVersion rejected = pluginVersionService.getRejectedCandidate(plugin.getId());
            if (rejected != null && rejected.getReviewStatus() == PluginStatus.REJECTED) {
                candidate = rejected;
            }
        }
        if (candidate != null) {
            vo.setCandidateVersion(PluginVersionConverter.INSTANCE.convertVO(candidate));
        }
        return vo;
    }

    private PluginSubmissionDTO legacySubmission(PluginDTO dto) {
        PluginSubmissionDTO submission = new PluginSubmissionDTO();
        submission.setName(dto.getName());
        submission.setPluginKey(dto.getPluginKey());
        submission.setDescription(dto.getDescription());
        submission.setVersion(StrUtil.isBlank(dto.getVersion()) ? "1.0.0" : dto.getVersion());
        submission.setCategory(dto.getCategory() == null ? PluginCategory.FEATURE : dto.getCategory());
        submission.setTags(legacyTags(dto.getTags()));
        submission.setIcon(legacyIcon(dto));
        submission.setResourcePath(dto.getResourcePath());
        submission.setIntegrity(dto.getIntegrity());
        submission.setVersionDescs(dto.getVersionDescs());
        return submission;
    }

    private PluginSubmissionDTO mergeLegacyResubmission(Plugin plugin, PluginDTO dto) {
        PluginSubmissionDTO submission = new PluginSubmissionDTO();
        submission.setName(StrUtil.isBlank(dto.getName()) ? plugin.getName() : dto.getName());
        submission.setPluginKey(plugin.getPluginKey());
        submission.setDescription(StrUtil.isBlank(dto.getDescription()) ? plugin.getDescription() : dto.getDescription());
        PluginVersion rejected = pluginVersionService.getRejectedCandidate(plugin.getId());
        submission.setVersion(StrUtil.isBlank(dto.getVersion()) && rejected != null ? rejected.getVersion() : dto.getVersion());
        submission.setCategory(dto.getCategory() == null ? plugin.getCategory() : dto.getCategory());
        submission.setTags(CollUtil.isEmpty(dto.getTags()) ? pluginTagService.listTagContents(plugin.getId())
                : legacyTags(dto.getTags()));
        submission.setIcon(StrUtil.isBlank(dto.getIcon()) && CollUtil.isEmpty(dto.getLogos()) ? plugin.getIcon()
                : legacyIcon(dto));
        submission.setResourcePath(StrUtil.isBlank(dto.getResourcePath()) && rejected != null
                ? rejected.getResourcePath() : dto.getResourcePath());
        submission.setIntegrity(StrUtil.isBlank(dto.getIntegrity()) && rejected != null
                ? rejected.getIntegrity() : dto.getIntegrity());
        submission.setVersionDescs(CollUtil.isEmpty(dto.getVersionDescs()) && rejected != null
                ? rejected.getVersionDescription() : dto.getVersionDescs());
        return submission;
    }

    private List<VersionDesc> legacyVersionDescriptions(PluginDTO dto, PluginVersion current) {
        if (CollUtil.isNotEmpty(dto.getVersionDescs())) {
            return dto.getVersionDescs();
        }
        if (current != null && CollUtil.isNotEmpty(current.getVersionDescription())) {
            return current.getVersionDescription();
        }
        VersionDesc fallback = new VersionDesc();
        fallback.setLabel("ChangeLog");
        fallback.setContent("{}");
        return java.util.Collections.singletonList(fallback);
    }

    private List<String> legacyTags(List<TagDTO> tags) {
        if (CollUtil.isEmpty(tags)) {
            List<String> fallback = new ArrayList<>();
            fallback.add("plugin");
            return fallback;
        }
        return tags.stream().filter(Objects::nonNull).map(TagDTO::getText).collect(Collectors.toList());
    }

    private String legacyIcon(PluginDTO dto) {
        if (StrUtil.isNotBlank(dto.getIcon())) {
            return dto.getIcon();
        }
        if (CollUtil.isEmpty(dto.getLogos())) {
            return null;
        }
        return dto.getLogos().stream()
                .filter(Objects::nonNull)
                .filter(logo -> StrUtil.isNotBlank(logo.getPath()))
                .min(Comparator.comparing(PluginLogo::getSize,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .map(PluginLogo::getPath)
                .orElse(null);
    }
}
