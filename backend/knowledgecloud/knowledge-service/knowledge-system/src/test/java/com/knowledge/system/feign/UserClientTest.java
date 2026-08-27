package com.knowledge.system.feign;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.knowledge.core.tool.api.R;
import com.knowledge.system.domain.User;
import com.knowledge.system.service.IUserService;
import com.knowledge.system.vo.UserInfo;

@ExtendWith(MockitoExtension.class)
class UserClientTest {

    @Mock
    private IUserService userService;
    @InjectMocks
    private UserClient userClient;

    @Test
    void passwordLoginPopulatesRoleAliases() {
        User user = user();
        when(userService.userInfo("000000", "admin", "password")).thenReturn(user);
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
        when(userService.getRoleAlias("000000", "11")).thenReturn(Collections.singletonList("administrator"));

        R<UserInfo> result = userClient.userInfo(7L);

        assertEquals(Collections.singletonList("administrator"), result.getData().getRoles());
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
