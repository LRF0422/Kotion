package com.knowledge.wiki.service.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
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

import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.VersionDesc;
import com.knowledge.wiki.service.entity.dto.PluginReviewDTO;
import com.knowledge.wiki.service.entity.dto.PluginVersionPublishDTO;
import com.knowledge.wiki.service.entity.enums.PluginReviewDecision;
import com.knowledge.wiki.service.entity.enums.PluginStatus;
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

    private void authenticate(Long userId, String role) {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(userId);
        user.setUserName("test-user");
        user.setRoleName(role);
        SecurityContextHolder.getContext().setAuthentication(new KnowledgeUserAuthentication(user, "token"));
    }
}
