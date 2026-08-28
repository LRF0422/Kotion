package com.knowledge.auth.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.when;

import java.util.Arrays;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.knowledge.core.launch.constant.TokenConstant;
import com.knowledge.core.secure.AuthInfo;
import com.knowledge.core.secure.TokenInfo;
import com.knowledge.core.secure.provider.JwtTokenProvider;
import com.knowledge.system.vo.UserInfo;
import com.knowledge.system.vo.UserVO;

@ExtendWith(MockitoExtension.class)
class TokenUtilTest {

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void writesRoleAliasesToAuthInfoAndJwtClaims() {
        TokenInfo accessToken = token("access", 7200);
        TokenInfo refreshToken = token("refresh", 86400);
        ArgumentCaptor<Map<String, Object>> claims = ArgumentCaptor.forClass(Map.class);
        when(jwtTokenProvider.createAccessToken(claims.capture())).thenReturn(accessToken);
        when(jwtTokenProvider.createRefreshToken(anyMap())).thenReturn(refreshToken);

        UserVO user = new UserVO();
        user.setId(7L);
        user.setTenantId("000000");
        user.setAccount("admin");
        user.setRoleId("11,12");
        UserInfo userInfo = new UserInfo();
        userInfo.setUser(user);
        userInfo.setRoles(Arrays.asList("administrator", "user"));
        userInfo.setPermissions(Arrays.asList("platform.dashboard.read", "platform.audit.read"));
        userInfo.setCurrentContextType("TEAM");
        userInfo.setCurrentContextId("100001");
        userInfo.setAudience("kotion-platform-admin");
        userInfo.setSessionId("session-1");
        userInfo.setAuthVersion(3);

        AuthInfo authInfo = new TokenUtil(jwtTokenProvider).createAuthInfoInstance(userInfo);

        assertEquals("administrator,user", authInfo.getAuthority());
        assertEquals("administrator,user,platform.dashboard.read,platform.audit.read",
                claims.getValue().get(TokenConstant.ROLE_NAME));
        assertEquals("kotion-platform-admin", claims.getValue().get(TokenConstant.CLIENT_ID));
        assertEquals("11,12", claims.getValue().get(TokenConstant.ROLE_ID));
        assertEquals("100001", claims.getValue().get(TokenConstant.TENANT_ID));
        assertEquals("100001", claims.getValue().get(IdentityTokenClaims.CONTEXT_ID));
        assertEquals("TEAM", claims.getValue().get(IdentityTokenClaims.CONTEXT_TYPE));
        assertEquals("kotion-platform-admin", claims.getValue().get(IdentityTokenClaims.AUDIENCE));
        assertEquals("session-1", claims.getValue().get(IdentityTokenClaims.SESSION_ID));
        assertEquals("platform.dashboard.read,platform.audit.read",
                claims.getValue().get(IdentityTokenClaims.PERMISSIONS));
        assertEquals(3, claims.getValue().get(IdentityTokenClaims.AUTH_VERSION));
    }

    private TokenInfo token(String value, int expire) {
        TokenInfo token = new TokenInfo();
        token.setToken(value);
        token.setExpire(expire);
        return token;
    }
}
