package com.knowledge.system.feign;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.knowledge.core.tool.api.R;
import com.knowledge.system.domain.Tenant;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.enums.TenantType;
import com.knowledge.system.service.IOrganizationMemberService;
import com.knowledge.system.service.IRolePermissionService;
import com.knowledge.system.service.IRoleService;
import com.knowledge.system.service.ITenantService;
import com.knowledge.system.service.IUserRoleService;
import com.knowledge.system.service.IUserService;
import com.knowledge.system.vo.UserInfo;

@ExtendWith(MockitoExtension.class)
class UserClientTest {

    @Mock
    private IUserService userService;
    @Mock
    private ITenantService tenantService;
    @Mock
    private IUserRoleService userRoleService;
    @Mock
    private IRoleService roleService;
    @Mock
    private IRolePermissionService rolePermissionService;
    @Mock
    private IOrganizationMemberService organizationMemberService;
    @InjectMocks
    private UserClient userClient;

    @Test
    void passwordLoginPopulatesRoleAliases() {
        User user = user();
        when(userService.userInfo("000000", "admin", "password")).thenReturn(user);
        when(tenantService.getByTenantId("000000")).thenReturn(tenant("000000", TenantType.INDIVIDUAL));
        when(userService.getRoleAlias("000000", "11")).thenReturn(Collections.singletonList("administrator"));

        R<UserInfo> result = userClient.userInfo("000000", "admin", "password");

        assertEquals(Collections.singletonList("administrator"), result.getData().getRoles());
        assertEquals("11", result.getData().getUser().getRoleId());
        verify(userService).getRoleAlias("000000", "11");
    }

    @Test
    void refreshLookupPopulatesRoleAliases() {
        User user = user();
        when(userService.userInfo(7L)).thenReturn(user);
        when(tenantService.getByTenantId("000000")).thenReturn(tenant("000000", TenantType.INDIVIDUAL));
        when(userService.getRoleAlias("000000", "11")).thenReturn(Collections.singletonList("administrator"));

        R<UserInfo> result = userClient.userInfo(7L);

        assertEquals(Collections.singletonList("administrator"), result.getData().getRoles());
    }

    @Test
    void contextLookupRejectsUnavailableOrganization() {
        User user = user();
        user.setPersonalContextId("000000");
        when(userService.userInfo(7L)).thenReturn(user);
        when(tenantService.getByTenantId("100001")).thenReturn(tenant("100001", TenantType.TEAM));
        when(organizationMemberService.isActiveMember("100001", 7L)).thenReturn(false);

        R<UserInfo> result = userClient.userInfo(7L, "100001");

        assertFalse(result.isSuccess());
    }

    @Test
    void contextLookupAcceptsActiveOrganizationMembership() {
        User user = user();
        user.setPersonalContextId("000000");
        when(userService.userInfo(7L)).thenReturn(user);
        when(tenantService.getByTenantId("100001")).thenReturn(tenant("100001", TenantType.TEAM));
        when(organizationMemberService.isActiveMember("100001", 7L)).thenReturn(true);

        R<UserInfo> result = userClient.userInfo(7L, "100001");

        assertTrue(result.isSuccess());
        assertEquals("100001", result.getData().getCurrentContextId());
        assertEquals(Collections.emptyList(), result.getData().getRoles());
    }

    private Tenant tenant(String tenantId, TenantType type) {
        Tenant tenant = new Tenant();
        tenant.setTenantId(tenantId);
        tenant.setTenantType(type);
        tenant.setStatus(1);
        return tenant;
    }

    private User user() {
        User user = new User();
        user.setId(7L);
        user.setTenantId("000000");
        user.setAccount("admin");
        user.setRoleId("11");
        return user;
    }
}
