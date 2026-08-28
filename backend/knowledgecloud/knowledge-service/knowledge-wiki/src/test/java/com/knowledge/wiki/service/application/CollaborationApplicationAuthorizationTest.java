package com.knowledge.wiki.service.application;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;

import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.system.feign.IUserClient;
import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.enums.InvitationStatus;
import com.knowledge.wiki.service.service.ICollaborationInvitationService;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPermissionService;
import com.knowledge.wiki.service.service.IPluginService;
import com.knowledge.wiki.service.service.ISpaceService;

@ExtendWith(MockitoExtension.class)
class CollaborationApplicationAuthorizationTest {

    @Mock
    private ICollaborationInvitationService collaborationInvitationService;
    @Mock
    private ISpaceService spaceService;
    @Mock
    private IPageService pageService;
    @Mock
    private IUserClient userClient;
    @Mock
    private IPluginService pluginService;
    @Mock
    private IPermissionService permissionService;
    @InjectMocks
    private CollaborationApplication application;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void onlyInviteeCanAcceptInvitation() {
        authenticate(99L);
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.PENDING);
        when(collaborationInvitationService.getByToken("secret")).thenReturn(invitation);

        assertThrows(BusinessException.class, () -> application.acceptInvitation("secret"));
        verify(spaceService, never()).acceptInvitation(invitation.getId());
    }

    @Test
    void revokedInvitationCannotBeAccepted() {
        authenticate(42L);
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.EXPIRED);
        when(collaborationInvitationService.getByToken("secret")).thenReturn(invitation);

        assertThrows(BusinessException.class, () -> application.acceptInvitation("secret"));
        verify(spaceService, never()).acceptInvitation(invitation.getId());
    }

    @Test
    void acceptedInvitationPageIsStillBoundToInvitee() {
        authenticate(99L);
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.ACCEPTED);
        when(collaborationInvitationService.getByToken("secret")).thenReturn(invitation);

        assertThrows(BusinessException.class, () -> application.getInvitationPage("secret"));
        verify(pageService, never()).getPageContent(invitation.getPageId());
    }

    private CollaborationInvitation invitation(Long inviteeId, InvitationStatus status) {
        CollaborationInvitation invitation = new CollaborationInvitation();
        invitation.setId(7L);
        invitation.setPageId(20L);
        invitation.setSpaceId(10L);
        invitation.setInviteeId(inviteeId);
        invitation.setInviterId(1L);
        invitation.setStatus(status);
        invitation.setPermission(IPermissionService.PERMISSION_READ);
        return invitation;
    }

    private void authenticate(Long userId) {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(userId);
        user.setUserName("test-user");
        SecurityContextHolder.getContext().setAuthentication(new KnowledgeUserAuthentication(user, "token"));
    }
}
