package com.knowledge.wiki.service.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.wiki.service.entity.PageCollaborator;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.enums.CollaboratorRole;
import com.knowledge.wiki.service.entity.enums.SpaceType;
import com.knowledge.wiki.service.entity.enums.SpaceVisibility;
import com.knowledge.wiki.service.service.IPageCollaboratorService;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPermissionService;
import com.knowledge.wiki.service.service.ISpaceMemberService;
import com.knowledge.wiki.service.service.ISpaceService;

@ExtendWith(MockitoExtension.class)
class PermissionServiceImplTest {

    @Mock
    private ISpaceService spaceService;
    @Mock
    private IPageService pageService;
    @Mock
    private ISpaceMemberService spaceMemberService;
    @Mock
    private IPageCollaboratorService pageCollaboratorService;
    @InjectMocks
    private PermissionServiceImpl permissionService;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void ownerCannotReadSpaceFromAnotherContext() {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(1L);
        user.setTenantId("context-a");
        SecurityContextHolder.getContext().setAuthentication(new KnowledgeUserAuthentication(user, "token"));
        Space space = collaborationSpace(10L, SpaceVisibility.PRIVATE);
        space.setTenantId("context-b");

        assertNull(permissionService.effectiveSpacePermission(1L, space));
    }

    @Test
    void guestHasNoPrivateSpaceWidePermission() {
        Space space = collaborationSpace(10L, SpaceVisibility.PRIVATE);
        when(spaceMemberService.getMemberRole(10L, 42L)).thenReturn(CollaboratorRole.GUEST);

        assertNull(permissionService.effectiveSpacePermission(42L, space));
    }

    @Test
    void unknownRequiredPermissionCannotFailOpen() {
        com.knowledge.wiki.service.entity.Page page = new com.knowledge.wiki.service.entity.Page();
        page.setId(20L);

        assertThrows(RuntimeException.class,
                () -> permissionService.checkPagePermission(42L, page, "TYPO"));
    }

    @Test
    void guestOnlyReceivesExplicitPageGrant() {
        Space space = collaborationSpace(10L, SpaceVisibility.PRIVATE);
        com.knowledge.wiki.service.entity.Page page = new com.knowledge.wiki.service.entity.Page();
        page.setId(20L);
        page.setSpaceId(10L);
        PageCollaborator grant = new PageCollaborator();
        grant.setPageId(20L);
        grant.setUserId(42L);
        grant.setPermission(IPermissionService.PERMISSION_READ);
        LambdaQueryChainWrapper<PageCollaborator> query = mock(LambdaQueryChainWrapper.class);

        when(spaceService.getById(10L)).thenReturn(space);
        when(spaceMemberService.getMemberRole(10L, 42L)).thenReturn(CollaboratorRole.GUEST);
        when(pageCollaboratorService.lambdaQuery()).thenReturn(query);
        when(query.eq(any(), any())).thenReturn(query);
        when(query.one()).thenReturn(grant);

        assertEquals(IPermissionService.PERMISSION_READ,
                permissionService.effectivePagePermission(42L, page));
    }

    @Test
    void memberSpacePermissionCannotBeLoweredByPageGrant() {
        Space space = collaborationSpace(10L, SpaceVisibility.PRIVATE);
        com.knowledge.wiki.service.entity.Page page = new com.knowledge.wiki.service.entity.Page();
        page.setId(20L);
        page.setSpaceId(10L);
        PageCollaborator grant = new PageCollaborator();
        grant.setPermission(IPermissionService.PERMISSION_READ);
        LambdaQueryChainWrapper<PageCollaborator> query = mock(LambdaQueryChainWrapper.class);

        when(spaceService.getById(10L)).thenReturn(space);
        when(spaceMemberService.getMemberRole(10L, 42L)).thenReturn(CollaboratorRole.MEMBER);
        when(pageCollaboratorService.lambdaQuery()).thenReturn(query);
        when(query.eq(any(), any())).thenReturn(query);
        when(query.one()).thenReturn(grant);

        assertEquals(IPermissionService.PERMISSION_WRITE,
                permissionService.effectivePagePermission(42L, page));
    }

    private Space collaborationSpace(Long id, SpaceVisibility visibility) {
        Space space = new Space();
        space.setId(id);
        space.setUserId(1L);
        space.setType(SpaceType.COLLABORATION);
        space.setVisibility(visibility);
        return space;
    }
}
