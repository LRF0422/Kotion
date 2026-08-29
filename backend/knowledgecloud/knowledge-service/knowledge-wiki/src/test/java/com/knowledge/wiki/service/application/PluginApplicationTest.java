package com.knowledge.wiki.service.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Answers.RETURNS_SELF;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;

import com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.wiki.service.entity.InstalledPlugin;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.VersionDesc;
import com.knowledge.wiki.service.entity.dto.PluginReviewDTO;
import com.knowledge.wiki.service.entity.dto.PluginVersionPublishDTO;
import com.knowledge.wiki.service.entity.dto.QueryAdminPluginDTO;
import com.knowledge.wiki.service.entity.enums.InstalledPluginStatus;
import com.knowledge.wiki.service.entity.enums.PluginReviewDecision;
import com.knowledge.wiki.service.entity.enums.PluginStatus;
import com.knowledge.wiki.service.entity.vo.PluginVO;
import com.knowledge.wiki.service.service.IInstalledPluginService;
import com.knowledge.wiki.service.service.IPluginService;
import com.knowledge.wiki.service.service.IPluginTagService;
import com.knowledge.wiki.service.service.IPluginVersionService;

@ExtendWith(MockitoExtension.class)
class PluginApplicationTest {

    @Mock
    private IPluginService pluginService;
    @Mock
    private IPluginVersionService pluginVersionService;
    @Mock
    private IPluginTagService pluginTagService;
    @Mock
    private IInstalledPluginService installedPluginService;
    @InjectMocks
    private PluginApplication application;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void detailReturnsActiveVersionAndInstallMetadata() {
        Plugin plugin = plugin(7L, PluginStatus.DONE);
        plugin.setCurrentVersionId(99L);
        PluginVersion active = pluginVersion(8L, 7L, "1.0.0", VersionStatus.ACTIVE, PluginStatus.DONE);
        active.setResourcePath("plugins/example/index.js");
        active.setIntegrity("sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
        PluginVersion installed = pluginVersion(6L, 7L, "0.9.0", VersionStatus.IN_ACTIVE, PluginStatus.DONE);
        InstalledPlugin installRecord = new InstalledPlugin();
        installRecord.setStatus(InstalledPluginStatus.DISABLED);

        when(pluginService.getById(7L)).thenReturn(plugin);
        when(pluginService.getActiveVersion(7L)).thenReturn(active);
        when(pluginService.checkInstall(7L)).thenReturn(Collections.singletonList(installed));
        when(installedPluginService.getInstallRecord(7L)).thenReturn(installRecord);
        when(pluginTagService.listTagContents(7L)).thenReturn(Collections.singletonList("editor"));

        PluginVO result = application.detail(7L);

        assertNotNull(result.getCurrentVersion());
        assertEquals(active.getId(), result.getCurrentVersion().getId());
        assertEquals(active.getVersion(), result.getCurrentVersion().getVersion());
        assertEquals(active.getId(), result.getCurrentVersionId());
        assertEquals(active.getResourcePath(), result.getResourcePath());
        assertEquals(active.getIntegrity(), result.getIntegrity());
        assertEquals(1, result.getInstalleddVersions().size());
        assertEquals(installed.getId(), result.getInstalleddVersions().get(0).getId());
        assertEquals(InstalledPluginStatus.DISABLED, result.getInstallStatus());
        assertEquals(Collections.singletonList("editor"), result.getTags());
    }

    @Test
    void laterVersionSubmissionKeepsApprovedPluginVisible() {
        authenticate(42L, "user");
        Plugin plugin = new Plugin();
        plugin.setId(7L);
        plugin.setDeveloperId(42L);
        plugin.setStatus(PluginStatus.DONE);
        PluginVersion active = new PluginVersion();
        active.setId(8L);
        active.setSubjectId(7L);
        active.setVersion("1.0.0");
        active.setStatus(VersionStatus.ACTIVE);

        when(pluginService.getById(7L)).thenReturn(plugin);
        when(pluginService.getByIdForUpdate(7L)).thenReturn(plugin);
        when(pluginVersionService.getPendingVersion(7L)).thenReturn(null);
        when(pluginVersionService.getRejectedCandidate(7L)).thenReturn(null);
        when(pluginVersionService.versionExists(7L, "1.1.0", null)).thenReturn(false);
        when(pluginVersionService.getCurrentActiveVersion(7L)).thenReturn(active);
        when(pluginVersionService.save(any(PluginVersion.class))).thenReturn(true);
        when(pluginTagService.listTagContents(7L)).thenReturn(Collections.emptyList());

        application.publishVersion(7L, version("1.1.0"));

        ArgumentCaptor<PluginVersion> candidate = ArgumentCaptor.forClass(PluginVersion.class);
        verify(pluginVersionService).save(candidate.capture());
        assertEquals(VersionStatus.PENDING, candidate.getValue().getStatus());
        assertEquals(PluginStatus.PENDING, candidate.getValue().getReviewStatus());
        assertEquals(PluginStatus.DONE, plugin.getStatus());
        verify(pluginService, never()).updateById(any(Plugin.class));
    }

    @Test
    void ordinaryUserCannotReviewSubmissions() {
        authenticate(42L, "user");
        PluginReviewDTO review = new PluginReviewDTO();
        review.setDecision(PluginReviewDecision.START);

        assertThrows(BusinessException.class, () -> application.review(7L, review));
        verify(pluginService, never()).getById(any());
    }

    @Test
    void ordinaryUserCannotOpenAdminReviewData() {
        authenticate(42L, "user");

        assertThrows(BusinessException.class,
                () -> application.adminReviewList(new QueryAdminPluginDTO()));
        assertThrows(BusinessException.class, () -> application.adminReviewDetail(7L));
        verify(pluginService, never()).pageAdminReviewPlugins(any());
        verify(pluginService, never()).getById(any());
    }

    @Test
    void reviewerCanListPublishedPluginWithPendingCandidate() {
        authenticate(1L, "admin");
        Plugin plugin = plugin(7L, PluginStatus.DONE);
        PluginVersion active = pluginVersion(8L, 7L, "1.0.0", VersionStatus.ACTIVE, PluginStatus.DONE);
        PluginVersion candidate = pluginVersion(9L, 7L, "1.1.0", VersionStatus.PENDING, PluginStatus.PENDING);
        Page<Plugin> page = new Page<>(1, 10);
        page.setRecords(Collections.singletonList(plugin));
        page.setTotal(1);

        when(pluginService.pageAdminReviewPlugins(any())).thenReturn(page);
        when(pluginVersionService.getCurrentActiveVersion(7L)).thenReturn(active);
        when(pluginVersionService.getPendingVersion(7L)).thenReturn(candidate);
        when(pluginTagService.listTagContents(7L)).thenReturn(Collections.singletonList("editor"));

        PluginVO result = application.adminReviewList(new QueryAdminPluginDTO()).getRecords().get(0);

        assertEquals(PluginStatus.DONE, result.getStatus());
        assertEquals("1.0.0", result.getCurrentVersion().getVersion());
        assertEquals(PluginStatus.PENDING, result.getCandidateVersion().getReviewStatus());
        assertEquals(Collections.singletonList("editor"), result.getTags());
    }

    @Test
    void reviewerCanOpenInitialPendingSubmission() {
        authenticate(1L, "administrator");
        Plugin plugin = plugin(7L, PluginStatus.PENDING);
        PluginVersion candidate = pluginVersion(9L, 7L, "1.0.0", VersionStatus.PENDING, PluginStatus.PENDING);

        when(pluginService.getById(7L)).thenReturn(plugin);
        when(pluginVersionService.getCurrentActiveVersion(7L)).thenReturn(null);
        when(pluginVersionService.getPendingVersion(7L)).thenReturn(candidate);
        when(pluginTagService.listTagContents(7L)).thenReturn(Collections.emptyList());

        PluginVO result = application.adminReviewDetail(7L);

        assertNull(result.getCurrentVersion());
        assertNotNull(result.getCandidateVersion());
        assertEquals(PluginStatus.PENDING, result.getCandidateVersion().getReviewStatus());
    }

    @Test
    void reviewerMustStartPendingSubmissionBeforeApproval() {
        authenticate(1L, "admin");
        Plugin plugin = plugin(7L, PluginStatus.PENDING);
        PluginVersion candidate = pluginVersion(9L, 7L, "1.0.0", VersionStatus.PENDING, PluginStatus.PENDING);
        PluginReviewDTO review = review(PluginReviewDecision.APPROVE);

        when(pluginService.getById(7L)).thenReturn(plugin);
        when(pluginVersionService.getPendingVersion(7L)).thenReturn(candidate);

        assertThrows(BusinessException.class, () -> application.review(7L, review));
        verify(pluginVersionService, never()).updateById(any(PluginVersion.class));
    }

    @Test
    void reviewerCanStartInitialSubmission() {
        authenticate(1L, "admin");
        Plugin plugin = plugin(7L, PluginStatus.PENDING);
        PluginVersion candidate = pluginVersion(9L, 7L, "1.0.0", VersionStatus.PENDING, PluginStatus.PENDING);
        LambdaUpdateChainWrapper<PluginVersion> versionUpdate = successfulVersionUpdate();
        LambdaUpdateChainWrapper<Plugin> pluginUpdate = successfulPluginUpdate();

        when(pluginService.getById(7L)).thenReturn(plugin);
        when(pluginVersionService.getPendingVersion(7L)).thenReturn(candidate);
        when(pluginVersionService.getCurrentActiveVersion(7L)).thenReturn(null);
        when(pluginVersionService.lambdaUpdate()).thenReturn(versionUpdate);
        when(pluginService.lambdaUpdate()).thenReturn(pluginUpdate);
        when(pluginTagService.listTagContents(7L)).thenReturn(Collections.emptyList());

        PluginVO result = application.review(7L, review(PluginReviewDecision.START));

        assertEquals(PluginStatus.IN_PROGRESS, plugin.getStatus());
        assertEquals(PluginStatus.IN_PROGRESS, candidate.getReviewStatus());
        assertEquals(PluginStatus.IN_PROGRESS, result.getCandidateVersion().getReviewStatus());
    }

    @Test
    void rejectingLaterVersionKeepsApprovedVersionActive() {
        authenticate(1L, "admin");
        Plugin plugin = plugin(7L, PluginStatus.DONE);
        PluginVersion active = pluginVersion(8L, 7L, "1.0.0", VersionStatus.ACTIVE, PluginStatus.DONE);
        PluginVersion candidate = pluginVersion(9L, 7L, "1.1.0", VersionStatus.PENDING, PluginStatus.IN_PROGRESS);
        LambdaUpdateChainWrapper<PluginVersion> versionUpdate = successfulVersionUpdate();

        when(pluginService.getById(7L)).thenReturn(plugin);
        when(pluginVersionService.getPendingVersion(7L)).thenReturn(candidate, null);
        when(pluginVersionService.getCurrentActiveVersion(7L)).thenReturn(active);
        when(pluginVersionService.lambdaUpdate()).thenReturn(versionUpdate);
        when(pluginVersionService.getRejectedCandidate(7L)).thenReturn(candidate);
        when(pluginTagService.listTagContents(7L)).thenReturn(Collections.emptyList());

        PluginVO result = application.review(7L, review(PluginReviewDecision.REJECT));

        assertEquals(PluginStatus.DONE, plugin.getStatus());
        assertEquals(VersionStatus.ACTIVE, active.getStatus());
        assertEquals(VersionStatus.DRAFT, candidate.getStatus());
        assertEquals(PluginStatus.REJECTED, result.getCandidateVersion().getReviewStatus());
    }

    @Test
    void approvingLaterVersionReplacesActiveVersion() {
        authenticate(1L, "admin");
        Plugin plugin = plugin(7L, PluginStatus.DONE);
        PluginVersion active = pluginVersion(8L, 7L, "1.0.0", VersionStatus.ACTIVE, PluginStatus.DONE);
        PluginVersion candidate = pluginVersion(9L, 7L, "1.1.0", VersionStatus.PENDING, PluginStatus.IN_PROGRESS);
        candidate.setResourcePath("plugins/example-1.1.0.js");
        candidate.setIntegrity("sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
        LambdaUpdateChainWrapper<PluginVersion> versionUpdate = successfulVersionUpdate();

        when(pluginService.getById(7L)).thenReturn(plugin);
        when(pluginVersionService.getPendingVersion(7L)).thenReturn(candidate, null);
        when(pluginVersionService.getCurrentActiveVersion(7L)).thenReturn(active, candidate);
        when(pluginVersionService.lambdaUpdate()).thenReturn(versionUpdate);
        when(pluginVersionService.getRejectedCandidate(7L)).thenReturn(null);
        when(pluginTagService.listTagContents(7L)).thenReturn(Collections.emptyList());

        PluginVO result = application.review(7L, review(PluginReviewDecision.APPROVE));

        assertEquals(PluginStatus.DONE, plugin.getStatus());
        assertEquals(candidate.getId(), plugin.getCurrentVersionId());
        assertEquals(VersionStatus.IN_ACTIVE, active.getStatus());
        assertEquals(VersionStatus.ACTIVE, candidate.getStatus());
        assertEquals("1.1.0", result.getCurrentVersion().getVersion());
        assertNull(result.getCandidateVersion());
    }

    private PluginVersionPublishDTO version(String version) {
        PluginVersionPublishDTO dto = new PluginVersionPublishDTO();
        dto.setVersion(version);
        dto.setResourcePath("plugins/example/index.js");
        dto.setIntegrity("sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
        VersionDesc desc = new VersionDesc();
        desc.setLabel("ChangeLog");
        desc.setContent("{\"type\":\"doc\"}");
        dto.setVersionDescs(Collections.singletonList(desc));
        return dto;
    }

    private Plugin plugin(Long id, PluginStatus status) {
        Plugin plugin = new Plugin();
        plugin.setId(id);
        plugin.setName("Example plugin");
        plugin.setPluginKey("example-plugin");
        plugin.setStatus(status);
        return plugin;
    }

    private PluginVersion pluginVersion(Long id, Long pluginId, String version,
            VersionStatus status, PluginStatus reviewStatus) {
        PluginVersion pluginVersion = new PluginVersion();
        pluginVersion.setId(id);
        pluginVersion.setSubjectId(pluginId);
        pluginVersion.setVersion(version);
        pluginVersion.setStatus(status);
        pluginVersion.setReviewStatus(reviewStatus);
        return pluginVersion;
    }

    private PluginReviewDTO review(PluginReviewDecision decision) {
        PluginReviewDTO review = new PluginReviewDTO();
        review.setDecision(decision);
        return review;
    }

    @SuppressWarnings("unchecked")
    private LambdaUpdateChainWrapper<PluginVersion> successfulVersionUpdate() {
        LambdaUpdateChainWrapper<PluginVersion> wrapper = mock(LambdaUpdateChainWrapper.class, RETURNS_SELF);
        when(wrapper.update()).thenReturn(true);
        return wrapper;
    }

    @SuppressWarnings("unchecked")
    private LambdaUpdateChainWrapper<Plugin> successfulPluginUpdate() {
        LambdaUpdateChainWrapper<Plugin> wrapper = mock(LambdaUpdateChainWrapper.class, RETURNS_SELF);
        when(wrapper.update()).thenReturn(true);
        return wrapper;
    }

    private void authenticate(Long userId, String role) {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(userId);
        user.setUserName("test-user");
        user.setRoleName(role);
        SecurityContextHolder.getContext().setAuthentication(new KnowledgeUserAuthentication(user, "token"));
    }
}
