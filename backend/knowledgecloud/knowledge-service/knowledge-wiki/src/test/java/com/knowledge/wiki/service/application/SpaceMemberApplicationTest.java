package com.knowledge.wiki.service.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
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
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.SpaceMember;
import com.knowledge.wiki.service.entity.dto.SpaceMemberDTO;
import com.knowledge.wiki.service.entity.enums.CollaboratorRole;
import com.knowledge.wiki.service.service.IPermissionService;
import com.knowledge.wiki.service.service.ISpaceMemberService;
import com.knowledge.wiki.service.service.ISpaceService;

@ExtendWith(MockitoExtension.class)
class SpaceMemberApplicationTest {

    @Mock
    private ISpaceMemberService spaceMemberService;
    @Mock
    private ISpaceService spaceService;
    @Mock
    private IPermissionService permissionService;
    @Mock
    private IUserClient userClient;
    @Mock
    private SpaceActivityApplication spaceActivityApplication;
    @InjectMocks
    private SpaceMemberApplication application;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void guestWithoutSpaceWidePermissionCannotListMembers() {
        authenticate(42L);
        Space space = space(10L, 1L);
        when(spaceService.getById(10L)).thenReturn(space);
        when(permissionService.effectiveSpacePermission(42L, space)).thenReturn(null);

        assertThrows(BusinessException.class, () -> application.listMembers(10L));
        verify(spaceMemberService, never()).getSpaceMembers(10L);
        verify(userClient, never()).listByIds(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void memberListingUsesSpaceMemberRows() {
        authenticate(42L);
        Space space = space(10L, 1L);
        SpaceMember member = new SpaceMember();
        member.setUserId(42L);
        member.setRole(CollaboratorRole.MEMBER);
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(42L);
        user.setUserName("member");
        user.setEmail("member@example.com");

        when(spaceService.getById(10L)).thenReturn(space);
        when(spaceMemberService.getMemberRole(10L, 42L)).thenReturn(CollaboratorRole.MEMBER);
        when(permissionService.effectiveSpacePermission(42L, space))
                .thenReturn(IPermissionService.PERMISSION_WRITE);
        when(spaceMemberService.getSpaceMembers(10L)).thenReturn(Collections.singletonList(member));
        when(userClient.listByIds(java.util.Arrays.asList(42L, 1L)))
                .thenReturn(R.data(Collections.singletonList(user)));

        List<SpaceMemberDTO> result = application.listMembers(10L);

        assertEquals(1, result.size());
        assertEquals(42L, result.get(0).getId());
        assertEquals(CollaboratorRole.MEMBER.getCode(), result.get(0).getRole());
    }

    private Space space(Long id, Long ownerId) {
        Space space = new Space();
        space.setId(id);
        space.setUserId(ownerId);
        return space;
    }

    private void authenticate(Long userId) {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(userId);
        user.setUserName("test-user");
        SecurityContextHolder.getContext().setAuthentication(new KnowledgeUserAuthentication(user, "token"));
    }
}
