package com.knowledge.wiki.service.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;
import java.util.List;

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
import com.knowledge.wiki.service.exception.WikiException;
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
    private PageDocCommandService pageDocCommandService;
    @InjectMocks
    private SpaceApplication application;

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
