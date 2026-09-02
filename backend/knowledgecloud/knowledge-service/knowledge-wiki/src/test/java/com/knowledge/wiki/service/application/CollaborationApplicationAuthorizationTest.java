package com.knowledge.wiki.service.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;

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
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.dto.InvitationAcceptResponseDTO;
import com.knowledge.wiki.service.entity.enums.InvitationStatus;
import com.knowledge.wiki.service.entity.vo.PageVO;
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

    @Test
    void acceptedInvitationReturnsComponentTypeAndEffectivePermission() {
        authenticate(42L);
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.PENDING);
        Page page = page("meeting-minutes");
        when(collaborationInvitationService.getByToken("secret")).thenReturn(invitation);
        when(pageService.getById(20L)).thenReturn(page);
        when(permissionService.effectivePagePermission(42L, page)).thenReturn(IPermissionService.PERMISSION_WRITE);

        InvitationAcceptResponseDTO response = application.acceptInvitation("secret");

        assertEquals("meeting-minutes", response.getPageType());
        assertEquals(IPermissionService.PERMISSION_WRITE, response.getPermission());
        verify(spaceService).acceptInvitation(invitation.getId());
    }

    @Test
    void invitationPageReturnsComponentTypeAndEffectivePermission() {
        authenticate(42L);
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.ACCEPTED);
        Page page = page("meeting-minutes");
        when(collaborationInvitationService.getByToken("secret")).thenReturn(invitation);
        when(pageService.getById(20L)).thenReturn(page);
        when(pageService.getPageContent(20L)).thenReturn(page);
        when(pageService.getParents(20L)).thenReturn(Collections.emptyList());
        when(permissionService.effectivePagePermission(42L, page)).thenReturn(IPermissionService.PERMISSION_WRITE);
        Space space = new Space();
        space.setId(10L);
        when(spaceService.getById(10L)).thenReturn(space);

        PageVO response = application.getInvitationPage("secret");

        assertEquals("meeting-minutes", response.getPageType());
        assertEquals(IPermissionService.PERMISSION_WRITE, response.getPermission());
    }

    private Page page(String pageType) {
        Page page = new Page();
        page.setId(20L);
        page.setSpaceId(10L);
        page.setTitle("Meeting");
        page.setPageType(pageType);
        return page;
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
