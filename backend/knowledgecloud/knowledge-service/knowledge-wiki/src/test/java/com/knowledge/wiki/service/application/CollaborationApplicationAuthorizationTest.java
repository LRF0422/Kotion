package com.knowledge.wiki.service.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;

import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.system.feign.IUserClient;
import com.knowledge.wiki.feign.IOrganizationMembershipClient;
import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.dto.InvitationAcceptResponseDTO;
import com.knowledge.wiki.service.entity.dto.InvitationEnterResponseDTO;
import com.knowledge.wiki.service.entity.enums.InvitationStatus;
import com.knowledge.wiki.service.entity.enums.PageStatus;
import com.knowledge.wiki.service.entity.vo.MyCollaborationInvitationVO;
import com.knowledge.wiki.service.entity.vo.PageVO;
import com.knowledge.wiki.service.exception.WikiException;
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
    private IOrganizationMembershipClient organizationMembershipClient;
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

    @BeforeEach
    void pagesAreLiveUnlessATestSaysOtherwise() {
        // The trash gate has its own test below; the authorization tests describe
        // live pages. lenient(): not every test reaches the gate.
        lenient().when(pageService.isLivePage(any(Page.class))).thenReturn(true);
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
    void trashedPageCannotBeEnteredThroughItsInvitation() {
        authenticate(42L);
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.ACCEPTED);
        Page page = page("doc");
        page.setStatus(PageStatus.TRASH);
        when(collaborationInvitationService.getByTokenForValidation("secret")).thenReturn(invitation);
        when(pageService.getById(20L)).thenReturn(page);
        when(pageService.isLivePage(page)).thenReturn(false);

        BusinessException error = assertThrows(BusinessException.class, () -> application.enterInvitation("secret"));
        assertEquals(WikiException.PAGE_IN_TRASH.getCode(), error.getCode());
        verify(spaceService, never()).getById(anyLong());
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
    void acceptInvitationAdmitsInviteeIntoSpaceContext() {
        authenticate(42L);
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.PENDING);
        Page page = page("doc");
        Space space = spaceInContext("org-a");
        when(collaborationInvitationService.getByToken("secret")).thenReturn(invitation);
        when(pageService.getById(20L)).thenReturn(page);
        when(spaceService.getById(10L)).thenReturn(space);
        when(organizationMembershipClient.ensureMember(42L, "org-a")).thenReturn(R.data(true));
        when(permissionService.effectivePagePermission(42L, page)).thenReturn(IPermissionService.PERMISSION_WRITE);

        InvitationAcceptResponseDTO response = application.acceptInvitation("secret");

        assertEquals("org-a", response.getContextId());
        verify(organizationMembershipClient).ensureMember(42L, "org-a");
    }

    @Test
    void enterInvitationReportsContextToSwitchInto() {
        authenticate(42L);
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.ACCEPTED);
        Page page = page("doc");
        when(collaborationInvitationService.getByTokenForValidation("secret")).thenReturn(invitation);
        when(pageService.getById(20L)).thenReturn(page);
        when(spaceService.getById(10L)).thenReturn(spaceInContext("org-a"));
        when(organizationMembershipClient.ensureMember(42L, "org-a")).thenReturn(R.data(true));
        when(permissionService.effectivePagePermission(42L, page)).thenReturn(IPermissionService.PERMISSION_WRITE);

        InvitationEnterResponseDTO response = application.enterInvitation("secret");

        assertEquals("org-a", response.getContextId());
        assertEquals(Long.valueOf(10L), response.getSpaceId());
        assertEquals(Long.valueOf(20L), response.getPageId());
        assertEquals(IPermissionService.PERMISSION_WRITE, response.getPermission());
    }

    /**
     * The grant is best-effort: a rejected or unreachable membership call must not turn
     * acceptance/entry into an error the invitee cannot act on. The client still receives
     * the context to switch into (it may already be a member of that organization).
     */
    @Test
    void failedContextGrantDoesNotBreakEntering() {
        authenticate(42L);
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.ACCEPTED);
        Page page = page("doc");
        when(collaborationInvitationService.getByTokenForValidation("secret")).thenReturn(invitation);
        when(pageService.getById(20L)).thenReturn(page);
        when(spaceService.getById(10L)).thenReturn(spaceInContext("org-a"));
        when(organizationMembershipClient.ensureMember(42L, "org-a"))
                .thenThrow(new IllegalStateException("knowledge-system unreachable"));
        when(permissionService.effectivePagePermission(42L, page)).thenReturn(IPermissionService.PERMISSION_WRITE);

        InvitationEnterResponseDTO response = application.enterInvitation("secret");

        assertEquals("org-a", response.getContextId());
        assertEquals(Long.valueOf(20L), response.getPageId());
    }

    @Test
    void sameContextInvitationSkipsTheRemoteGrant() {
        authenticate(42L, "org-a");
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.ACCEPTED);
        Page page = page("doc");
        when(collaborationInvitationService.getByTokenForValidation("secret")).thenReturn(invitation);
        when(pageService.getById(20L)).thenReturn(page);
        when(spaceService.getById(10L)).thenReturn(spaceInContext("org-a"));
        when(permissionService.effectivePagePermission(42L, page)).thenReturn(IPermissionService.PERMISSION_WRITE);

        InvitationEnterResponseDTO response = application.enterInvitation("secret");

        assertEquals("org-a", response.getContextId());
        verify(organizationMembershipClient, never()).ensureMember(anyLong(), anyString());
    }

    @Test
    void pendingInvitationCannotBeEntered() {
        authenticate(42L);
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.PENDING);
        when(collaborationInvitationService.getByTokenForValidation("secret")).thenReturn(invitation);

        assertThrows(BusinessException.class, () -> application.enterInvitation("secret"));
        verify(organizationMembershipClient, never()).ensureMember(anyLong(), anyString());
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

    // ------------------------------------------------------------------
    // Home list of the caller's own invitations
    // ------------------------------------------------------------------

    @Test
    void myInvitationsIncludePendingAndAcceptedSortedNewestFirst() {
        authenticate(42L);
        LocalDateTime now = LocalDateTime.now();
        CollaborationInvitation pending = invitation(42L, InvitationStatus.PENDING);
        pending.setId(1L);
        pending.setToken("pending-token");
        pending.setCreatedAt(now.minusDays(2));
        pending.setExpiresAt(now.plusDays(5));
        CollaborationInvitation accepted = invitation(42L, InvitationStatus.ACCEPTED);
        accepted.setId(2L);
        accepted.setPageId(21L);
        accepted.setToken("accepted-token");
        accepted.setCreatedAt(now.minusDays(1));
        Page first = page("doc");
        Page second = page("meeting-minutes");
        second.setId(21L);
        when(collaborationInvitationService.getActiveByInvitee(42L)).thenReturn(Arrays.asList(pending, accepted));
        when(pageService.listByIds(anyCollection())).thenReturn(Arrays.asList(first, second));
        when(pageService.filterLivePages(anyCollection())).thenReturn(Arrays.asList(first, second));
        Space space = new Space();
        space.setId(10L);
        space.setName("Team");
        when(spaceService.listByIds(anyCollection())).thenReturn(Collections.singletonList(space));
        when(userClient.getUserById(1L)).thenReturn(R.data(inviter("Alice")));

        List<MyCollaborationInvitationVO> result = application.listMyInvitations();

        assertEquals(2, result.size());
        // Accepted invitation created more recently comes first.
        assertEquals(Long.valueOf(21L), result.get(0).getPageId());
        assertEquals("ACCEPTED", result.get(0).getStatus());
        assertEquals("accepted-token", result.get(0).getToken());
        assertEquals("Meeting", result.get(0).getPageTitle());
        assertEquals("meeting-minutes", result.get(0).getPageType());
        assertEquals("Team", result.get(0).getSpaceName());
        assertEquals("Alice", result.get(0).getInviterName());
        assertEquals("PENDING", result.get(1).getStatus());
        assertEquals("pending-token", result.get(1).getToken());
    }

    @Test
    void myInvitationsExcludeExpiredTrashedAndMissingPages() {
        authenticate(42L);
        LocalDateTime now = LocalDateTime.now();
        CollaborationInvitation usable = invitation(42L, InvitationStatus.ACCEPTED);
        usable.setId(1L);
        usable.setCreatedAt(now.minusHours(1));
        CollaborationInvitation trashed = invitation(42L, InvitationStatus.ACCEPTED);
        trashed.setId(2L);
        trashed.setPageId(21L);
        trashed.setCreatedAt(now.minusHours(2));
        CollaborationInvitation pageGone = invitation(42L, InvitationStatus.ACCEPTED);
        pageGone.setId(3L);
        pageGone.setPageId(22L);
        pageGone.setCreatedAt(now.minusHours(3));
        CollaborationInvitation expired = invitation(42L, InvitationStatus.PENDING);
        expired.setId(4L);
        expired.setPageId(23L);
        expired.setExpiresAt(now.minusHours(1));
        when(collaborationInvitationService.getActiveByInvitee(42L))
                .thenReturn(Arrays.asList(usable, trashed, pageGone, expired));
        Page live = page("doc");
        Page trashedPage = page("doc");
        trashedPage.setId(21L);
        when(pageService.listByIds(anyCollection())).thenReturn(Arrays.asList(live, trashedPage));
        when(pageService.filterLivePages(anyCollection())).thenReturn(Collections.singletonList(live));
        when(spaceService.listByIds(anyCollection())).thenReturn(Collections.emptyList());
        when(userClient.getUserById(1L)).thenReturn(R.data(inviter("Alice")));

        List<MyCollaborationInvitationVO> result = application.listMyInvitations();

        assertEquals(1, result.size());
        assertEquals(Long.valueOf(20L), result.get(0).getPageId());
    }

    @Test
    void myInvitationsKeepOneRowPerPagePreferringAccepted() {
        authenticate(42L);
        LocalDateTime now = LocalDateTime.now();
        CollaborationInvitation pending = invitation(42L, InvitationStatus.PENDING);
        pending.setId(1L);
        pending.setToken("stale");
        pending.setCreatedAt(now.minusDays(3));
        CollaborationInvitation accepted = invitation(42L, InvitationStatus.ACCEPTED);
        accepted.setId(2L);
        accepted.setToken("current");
        accepted.setCreatedAt(now.minusDays(1));
        // Newest first in the repository result, the pending row still loses.
        when(collaborationInvitationService.getActiveByInvitee(42L))
                .thenReturn(Arrays.asList(accepted, pending));
        Page page = page("doc");
        when(pageService.listByIds(anyCollection())).thenReturn(Collections.singletonList(page));
        when(pageService.filterLivePages(anyCollection())).thenReturn(Collections.singletonList(page));
        when(spaceService.listByIds(anyCollection())).thenReturn(Collections.emptyList());
        when(userClient.getUserById(1L)).thenReturn(R.data(inviter("Alice")));

        List<MyCollaborationInvitationVO> result = application.listMyInvitations();

        assertEquals(1, result.size());
        assertEquals(Long.valueOf(2L), result.get(0).getId());
        assertEquals("ACCEPTED", result.get(0).getStatus());
        assertEquals("current", result.get(0).getToken());
    }

    @Test
    void myInvitationsAreEmptyWhenNoneAreActive() {
        authenticate(42L);
        when(collaborationInvitationService.getActiveByInvitee(42L)).thenReturn(Collections.emptyList());

        assertTrue(application.listMyInvitations().isEmpty());
        verify(pageService, never()).listByIds(anyCollection());
    }

    /**
     * The home list is a convenience view: a knowledge-system outage must cost the
     * inviter name, not the whole list.
     */
    @Test
    void myInvitationsSurviveAnUnreachableUserService() {
        authenticate(42L);
        CollaborationInvitation invitation = invitation(42L, InvitationStatus.ACCEPTED);
        when(collaborationInvitationService.getActiveByInvitee(42L))
                .thenReturn(Collections.singletonList(invitation));
        Page page = page("doc");
        when(pageService.listByIds(anyCollection())).thenReturn(Collections.singletonList(page));
        when(pageService.filterLivePages(anyCollection())).thenReturn(Collections.singletonList(page));
        when(spaceService.listByIds(anyCollection())).thenReturn(Collections.emptyList());
        when(userClient.getUserById(1L)).thenThrow(new IllegalStateException("knowledge-system down"));

        List<MyCollaborationInvitationVO> result = application.listMyInvitations();

        assertEquals(1, result.size());
        assertNull(result.get(0).getInviterName());
    }

    private KnowledgeUser inviter(String name) {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(1L);
        user.setUserName(name);
        return user;
    }

    private Page page(String pageType) {
        Page page = new Page();
        page.setId(20L);
        page.setSpaceId(10L);
        page.setTitle("Meeting");
        page.setPageType(pageType);
        return page;
    }

    private Space spaceInContext(String tenantId) {
        Space space = new Space();
        space.setId(10L);
        space.setTenantId(tenantId);
        return space;
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
        authenticate(userId, null);
    }

    private void authenticate(Long userId, String tenantId) {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(userId);
        user.setUserName("test-user");
        user.setTenantId(tenantId);
        SecurityContextHolder.getContext().setAuthentication(new KnowledgeUserAuthentication(user, "token"));
    }
}
