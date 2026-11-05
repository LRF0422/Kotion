package com.knowledge.wiki.service.doc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;

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
import com.knowledge.wiki.service.collab.CollabSessionService;
import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.dto.SessionClaimDTO;
import com.knowledge.wiki.service.entity.enums.InvitationStatus;
import com.knowledge.wiki.service.entity.vo.PageDocVO;
import com.knowledge.wiki.service.entity.vo.PageSessionVO;
import com.knowledge.wiki.service.service.ICollaborationInvitationService;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPermissionService;

/**
 * The invitation token is an access key, not proof that the collaborator still
 * has access: removing a page collaborator deletes the persistent grant but
 * leaves the accepted invitation row behind. Writes therefore require the grant
 * as well; reads stay token-bound, exactly as before.
 */
@ExtendWith(MockitoExtension.class)
class CollaborationPageControllerWriteAccessTest {

    private static final String TOKEN = "invite-token";
    private static final Long PAGE_ID = 20L;
    private static final Long USER_ID = 42L;
    private static final String CLIENT_ID = "guest-client";

    @Mock
    private PageDocService pageDocService;

    @Mock
    private PageOpService pageOpService;

    @Mock
    private PageDocCommandService pageDocCommandService;

    @Mock
    private CollabSessionService collabSessionService;

    @Mock
    private ICollaborationInvitationService collaborationInvitationService;

    @Mock
    private IPageService pageService;

    @Mock
    private IPermissionService permissionService;

    @InjectMocks
    private CollaborationPageController controller;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void removedCollaboratorKeepsReadAccessButCannotClaimTheWriteLease() {
        authenticate();
        givenAcceptedInvitation();
        when(permissionService.hasPageGrant(USER_ID, PAGE_ID)).thenReturn(false);

        // Reads remain authorized by the token (unchanged pre-existing behavior).
        PageDocVO doc = new PageDocVO();
        when(pageDocService.readDoc(PAGE_ID)).thenReturn(doc);
        assertEquals(doc, controller.readDoc(TOKEN).getData());

        // Writes do not: the grant that "remove collaborator" deleted is required.
        assertThrows(BusinessException.class, () -> controller.claimSession(TOKEN, claimRequest()));
        verify(collabSessionService, never()).claimSession(anyLong(), anyLong(), anyString(), anyString(), anyBoolean());
    }

    @Test
    void collaboratorWithTheGrantCanClaimTheWriteLease() {
        authenticate();
        givenAcceptedInvitation();
        when(permissionService.hasPageGrant(USER_ID, PAGE_ID)).thenReturn(true);
        when(collabSessionService.claimSession(eq(PAGE_ID), eq(USER_ID), eq(CLIENT_ID), anyString(), eq(true)))
                .thenReturn(hostState());
        when(pageDocService.readRev(PAGE_ID)).thenReturn(7L);

        PageSessionVO response = controller.claimSession(TOKEN, claimRequest()).getData();

        assertEquals(CollabSessionService.ROLE_HOST, response.getRole());
        assertEquals(Long.valueOf(7L), response.getRev());
    }

    private void givenAcceptedInvitation() {
        CollaborationInvitation invitation = new CollaborationInvitation();
        invitation.setId(1L);
        invitation.setToken(TOKEN);
        invitation.setPageId(PAGE_ID);
        invitation.setSpaceId(10L);
        invitation.setInviteeId(USER_ID);
        invitation.setInviterId(7L);
        invitation.setPermission(IPermissionService.PERMISSION_WRITE);
        invitation.setStatus(InvitationStatus.ACCEPTED);
        invitation.setExpiresAt(LocalDateTime.now().plusDays(7));
        when(collaborationInvitationService.getByTokenForValidation(TOKEN)).thenReturn(invitation);

        Page page = new Page();
        page.setId(PAGE_ID);
        page.setSpaceId(10L);
        when(pageService.getById(PAGE_ID)).thenReturn(page);
        when(pageService.isLivePage(page)).thenReturn(true);
    }

    private SessionClaimDTO claimRequest() {
        SessionClaimDTO request = new SessionClaimDTO();
        request.setClientId(CLIENT_ID);
        return request;
    }

    private CollabSessionService.SessionState hostState() {
        CollabSessionService.SessionState state = new CollabSessionService.SessionState();
        state.setRole(CollabSessionService.ROLE_HOST);
        state.setAlive(true);
        state.setHostUserId(USER_ID);
        state.setHostName("guest-user");
        state.setHostSelf(true);
        return state;
    }

    private void authenticate() {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(USER_ID);
        user.setUserName("guest-user");
        SecurityContextHolder.getContext().setAuthentication(new KnowledgeUserAuthentication(user, "token"));
    }
}
