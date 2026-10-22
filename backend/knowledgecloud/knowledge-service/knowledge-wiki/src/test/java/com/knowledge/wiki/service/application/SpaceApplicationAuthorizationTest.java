package com.knowledge.wiki.service.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;

import com.knowledge.core.entitlement.EntitlementGate;
import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.system.feign.IUserClient;
import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.dto.CollaborationInvitationRequestDTO;
import com.knowledge.wiki.service.entity.dto.PageDTO;
import com.knowledge.wiki.service.entity.dto.SpaceMemberDTO;
import com.knowledge.wiki.service.entity.dto.TemplateDTO;
import com.knowledge.wiki.service.entity.dto.UpdatePageTitleDTO;
import com.knowledge.wiki.service.doc.PageDocCommandService;
import com.knowledge.wiki.service.entity.enums.InvitationStatus;
import com.knowledge.wiki.service.entity.enums.PageStatus;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.search.WikiSearchService;
import com.knowledge.wiki.service.service.ICollaborationInvitationService;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPermissionService;
import com.knowledge.wiki.service.service.ISpaceService;

@ExtendWith(MockitoExtension.class)
class SpaceApplicationAuthorizationTest {

    @Mock
    private ISpaceService spaceService;
    @Mock
    private IPageService pageService;
    @Mock
    private IUserClient userClient;
    @Mock
    private IPermissionService permissionService;
    @Mock
    private ICollaborationInvitationService collaborationInvitationService;
    @Mock
    private SpaceMemberApplication spaceMemberApplication;
    @Mock
    private EntitlementGate entitlementGate;
    @Mock
    private PageDocCommandService pageDocCommandService;
    @Mock
    private WikiSearchService wikiSearchService;
    @InjectMocks
    private SpaceApplication application;

    @BeforeEach
    void pagesAreLiveUnlessATestSaysOtherwise() {
        // Status is covered by its own tests below; the authorization tests all
        // describe live pages. lenient(): many tests never reach the guard.
        lenient().when(pageService.isLivePage(any(Page.class))).thenReturn(true);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void readOnlyUserCannotCreateCollaborationInvitation() {
        authenticate(42L);
        Page page = page(20L, 10L);
        CollaborationInvitationRequestDTO dto = invitationRequest(20L, 10L);
        when(pageService.getById(20L)).thenReturn(page);
        doThrow(WikiException.FORBIDDEN_ACCESS.newException())
                .when(permissionService).checkPagePermission(42L, page, IPermissionService.PERMISSION_ADMIN);

        assertThrows(BusinessException.class, () -> application.createCollaborationInvitation(dto));
        verify(userClient, never()).listByIds(any());
        verify(spaceService, never()).getCollaborationService();
    }

    @Test
    void invitationPageMustBelongToRequestedSpace() {
        authenticate(42L);
        Page page = page(20L, 11L);
        CollaborationInvitationRequestDTO dto = invitationRequest(20L, 10L);
        when(pageService.getById(20L)).thenReturn(page);

        assertThrows(BusinessException.class, () -> application.createCollaborationInvitation(dto));
        verify(userClient, never()).listByIds(any());
    }

    @Test
    void legacyMemberRouteDelegatesToCanonicalApplication() {
        SpaceMemberDTO member = new SpaceMemberDTO();
        member.setId(42L);
        List<SpaceMemberDTO> expected = Collections.singletonList(member);
        when(spaceMemberApplication.listMembers(10L)).thenReturn(expected);

        assertEquals(expected, application.getSpaceMembers(10L));
    }

    @Test
    void spaceAdminCannotRevokeInvitationFromAnotherSpace() {
        authenticate(42L);
        Space space = new Space();
        space.setId(10L);
        CollaborationInvitation invitation = new CollaborationInvitation();
        invitation.setId(7L);
        invitation.setSpaceId(11L);
        invitation.setStatus(InvitationStatus.PENDING);
        when(spaceService.getById(10L)).thenReturn(space);
        when(collaborationInvitationService.getById(7L)).thenReturn(invitation);

        assertThrows(BusinessException.class, () -> application.revokeInvitation(10L, 7L));
        verify(permissionService, never()).effectiveSpacePermission(any(), any());
        verify(collaborationInvitationService, never()).lambdaUpdate();
    }

    @Test
    void componentPageCannotAlsoUsePageTemplate() {
        PageDTO dto = createPageRequest();
        dto.setTemplateId(99L);
        dto.setPageType("meeting-minutes");

        assertThrows(BusinessException.class, () -> application.createPage(dto));
        verify(spaceService, never()).getById(any());
        verify(pageService, never()).getById(any());
    }

    @Test
    void blankPageTypeIsNormalizedAtApplicationBoundary() {
        authenticate(42L);
        PageDTO dto = createPageRequest();
        dto.setPageType("   ");
        Space space = new Space();
        space.setId(10L);
        when(spaceService.getById(10L)).thenReturn(space);
        when(permissionService.effectiveSpacePermission(42L, space)).thenReturn(IPermissionService.PERMISSION_WRITE);
        when(spaceService.getPageService()).thenReturn(pageService);
        when(pageService.createPage(any(Page.class), eq(false)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        application.createPage(dto);

        ArgumentCaptor<Page> pageCaptor = ArgumentCaptor.forClass(Page.class);
        verify(pageService).createPage(pageCaptor.capture(), eq(false));
        assertNull(pageCaptor.getValue().getPageType());
    }

    @Test
    void componentPageCannotBeRenamedThroughDirectEndpointWhenTypeIsBlank() {
        authenticate(42L);
        Page page = page(20L, 10L);
        when(pageService.getById(20L)).thenReturn(page);
        UpdatePageTitleDTO dto = new UpdatePageTitleDTO();
        dto.setTitle("New title");

        assertThrows(BusinessException.class, () -> application.updateComponentPageTitle(20L, dto));
        verify(permissionService).checkPagePermission(42L, page, IPermissionService.PERMISSION_WRITE);
        verify(pageDocCommandService, never()).updateTitle(any(), any(), any());
    }

    @Test
    void spaceContainingComponentPageCannotBecomeTemplate() {
        TemplateDTO dto = new TemplateDTO();
        dto.setSpaceId(10L);
        Space space = new Space();
        space.setId(10L);
        when(spaceService.getById(10L)).thenReturn(space);
        when(pageService.hasComponentPages(10L)).thenReturn(true);

        assertThrows(BusinessException.class, () -> application.saveAsTemplate(dto));
        verify(spaceService, never()).createOrSave(any(Space.class));
        verify(pageService, never()).copySpacePage(any(), any());
    }

    // ---- Trash is not a normal read/write target ----

    @Test
    void trashedPageContentIsRefusedWithTheTrashCode() {
        authenticate(42L);
        Page page = page(20L, 10L);
        page.setStatus(PageStatus.TRASH);
        when(spaceService.getPageService()).thenReturn(pageService);
        when(pageService.getPageContent(20L)).thenReturn(page);
        when(pageService.isLivePage(page)).thenReturn(false);

        BusinessException error = assertThrows(BusinessException.class, () -> application.getPageContent(20L));
        assertEquals(WikiException.PAGE_IN_TRASH.getCode(), error.getCode());
    }

    @Test
    void liveRowUnderATrashedAncestorCannotJoinTheCollaborationRoom() {
        authenticate(42L);
        Page page = page(20L, 10L);
        page.setAncestors("5");
        when(pageService.getById(20L)).thenReturn(page);
        // The page row itself is ACTIVE, but its parent is in the trash.
        when(pageService.isLivePage(page)).thenReturn(false);

        BusinessException error = assertThrows(BusinessException.class, () -> application.authorizeCollabRoom(20L));
        assertEquals(WikiException.PAGE_IN_TRASH.getCode(), error.getCode());
    }

    @Test
    void restoreReachesATrashedPageAndReindexesTheSubtree() {
        authenticate(42L);
        Page parent = page(20L, 10L);
        parent.setStatus(PageStatus.TRASH);
        Page child = page(21L, 10L);
        child.setAncestors("20");
        child.setStatus(PageStatus.TRASH);
        when(pageService.getById(20L)).thenReturn(parent);
        when(pageService.getSubtree(20L)).thenReturn(java.util.Arrays.asList(parent, child));
        when(spaceService.getPageService()).thenReturn(pageService);

        application.restorePage(20L);

        verify(pageService).restore(20L);
        verify(wikiSearchService).reindexPage(20L);
        verify(wikiSearchService).reindexPage(21L);
        // The restore goes through; it must not be blocked by the trash guard.
        verify(permissionService).checkPagePermission(42L, parent, IPermissionService.PERMISSION_WRITE);
    }

    @Test
    void restoringALiveRowUnderATrashedAncestorRestoresTheAncestor() {
        authenticate(42L);
        Page child = page(21L, 10L);
        child.setAncestors("20");
        child.setStatus(PageStatus.ACTIVE);
        Page parent = page(20L, 10L);
        parent.setStatus(PageStatus.TRASH);
        when(pageService.getById(21L)).thenReturn(child);
        when(pageService.getParents(21L)).thenReturn(Collections.singletonList(parent));
        when(pageService.getSubtree(20L)).thenReturn(Collections.singletonList(parent));
        when(spaceService.getPageService()).thenReturn(pageService);

        application.restorePage(21L);

        // The legacy orphan becomes reachable only when its trashed parent returns.
        verify(pageService).restore(20L);
        verify(permissionService).checkPagePermission(42L, parent, IPermissionService.PERMISSION_WRITE);
        verify(wikiSearchService).reindexPage(20L);
    }

    @Test
    void restoringACascadedChildRestoresItsTrashedRoot() {
        authenticate(42L);
        Page parent = page(20L, 10L);
        parent.setStatus(PageStatus.TRASH);
        Page child = page(21L, 10L);
        child.setAncestors("20");
        child.setStatus(PageStatus.TRASH);
        when(pageService.getById(21L)).thenReturn(child);
        when(pageService.getParents(21L)).thenReturn(Collections.singletonList(parent));
        when(pageService.getSubtree(20L)).thenReturn(java.util.Arrays.asList(parent, child));
        when(spaceService.getPageService()).thenReturn(pageService);

        application.restorePage(21L);

        // The child cannot become visible on its own; the trashed root comes back.
        verify(pageService).restore(20L);
        verify(permissionService).checkPagePermission(42L, parent, IPermissionService.PERMISSION_WRITE);
        verify(wikiSearchService).reindexPage(20L);
        verify(wikiSearchService).reindexPage(21L);
    }

    private PageDTO createPageRequest() {
        PageDTO dto = new PageDTO();
        dto.setSpaceId(10L);
        dto.setTitle("Page");
        return dto;
    }

    private CollaborationInvitationRequestDTO invitationRequest(Long pageId, Long spaceId) {
        CollaborationInvitationRequestDTO dto = new CollaborationInvitationRequestDTO();
        dto.setPageId(pageId);
        dto.setSpaceId(spaceId);
        dto.setCollaboratorIds(Collections.singletonList(99L));
        dto.setPermissions(Collections.singletonList(IPermissionService.PERMISSION_READ));
        return dto;
    }

    private Page page(Long id, Long spaceId) {
        Page page = new Page();
        page.setId(id);
        page.setSpaceId(spaceId);
        return page;
    }

    private void authenticate(Long userId) {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(userId);
        user.setUserName("test-user");
        SecurityContextHolder.getContext().setAuthentication(new KnowledgeUserAuthentication(user, "token"));
    }
}
