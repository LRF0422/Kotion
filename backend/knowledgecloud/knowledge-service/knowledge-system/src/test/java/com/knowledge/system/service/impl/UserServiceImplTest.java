package com.knowledge.system.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;

import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.system.dto.QueryUserDTO;
import com.knowledge.system.service.IRoleService;

class UserServiceImplTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void queryDefaultsAreBoundedForAdminListContract() {
        QueryUserDTO dto = new QueryUserDTO();

        assertEquals(1, dto.getCurrent());
        assertEquals(10, dto.getSize());
    }

    @Test
    void currentAdministratorCannotResetOwnPassword() {
        authenticate(7L, "000000", "administrator");
        UserServiceImpl service = new UserServiceImpl(mock(IRoleService.class));

        assertThrows(ServiceException.class, () -> service.resetAdminPasswords("7"));
    }

    private void authenticate(Long userId, String tenantId, String role) {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(userId);
        user.setTenantId(tenantId);
        user.setRoleName(role);
        SecurityContextHolder.getContext().setAuthentication(new KnowledgeUserAuthentication(user, "token"));
    }
}
