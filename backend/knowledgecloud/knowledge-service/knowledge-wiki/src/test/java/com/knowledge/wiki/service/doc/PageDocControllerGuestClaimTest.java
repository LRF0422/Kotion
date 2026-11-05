package com.knowledge.wiki.service.doc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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
import com.knowledge.wiki.service.collab.CollabSessionService;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.dto.SessionClaimDTO;
import com.knowledge.wiki.service.entity.vo.PageSessionVO;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPermissionService;

/**
 * The page-route claim must classify the lease by identity, not by the route.
 * <p>
 * An explicit page-level collaborator grant means the caller is an invited
 * collaborator even when they arrive through the normal page route, so the lease
 * has to be the preemptible guest kind. A regular space participant must keep
 * claiming a non-preemptible lease.
 * </p>
 */
@ExtendWith(MockitoExtension.class)
class PageDocControllerGuestClaimTest {

    private static final Long PAGE_ID = 20L;
    private static final Long USER_ID = 42L;
    private static final String CLIENT_ID = "client-1";

    @Mock
    private PageDocService pageDocService;

    @Mock
    private IPageService pageService;

    @Mock
    private IPermissionService permissionService;

    @Mock
    private CollabSessionService collabSessionService;

    @InjectMocks
    private PageDocController controller;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void inviteeArrivingThroughTheNormalPageRouteClaimsAGuestLease() {
        authenticate();
        givenLivePage();
        when(permissionService.hasPageGrant(USER_ID, PAGE_ID)).thenReturn(true);
        when(collabSessionService.claimSession(eq(PAGE_ID), eq(USER_ID), eq(CLIENT_ID), anyString(), eq(true)))
                .thenReturn(hostState());

        PageSessionVO response = controller.claimSession(PAGE_ID, claimRequest()).getData();

        assertEquals(CollabSessionService.ROLE_HOST, response.getRole());
        verify(permissionService).hasPageGrant(USER_ID, PAGE_ID);
        verify(collabSessionService).claimSession(eq(PAGE_ID), eq(USER_ID), eq(CLIENT_ID), anyString(), eq(true));
    }

    @Test
    void regularParticipantClaimsANonPreemptibleLease() {
        authenticate();
        givenLivePage();
        when(permissionService.hasPageGrant(USER_ID, PAGE_ID)).thenReturn(false);
        when(collabSessionService.claimSession(eq(PAGE_ID), eq(USER_ID), eq(CLIENT_ID), anyString(), eq(false)))
                .thenReturn(hostState());

        PageSessionVO response = controller.claimSession(PAGE_ID, claimRequest()).getData();

        assertEquals(CollabSessionService.ROLE_HOST, response.getRole());
        verify(permissionService).hasPageGrant(USER_ID, PAGE_ID);
        verify(collabSessionService).claimSession(eq(PAGE_ID), eq(USER_ID), eq(CLIENT_ID), anyString(), eq(false));
    }

    private void givenLivePage() {
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
        state.setHostName("test-user");
        state.setHostSelf(true);
        return state;
    }

    private void authenticate() {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(USER_ID);
        user.setUserName("test-user");
        SecurityContextHolder.getContext().setAuthentication(new KnowledgeUserAuthentication(user, "token"));
    }
}
