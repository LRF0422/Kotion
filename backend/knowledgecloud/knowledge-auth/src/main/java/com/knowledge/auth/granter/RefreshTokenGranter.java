/**
 * Copyright (c) 2018-2028, Chill Zhuang 庄骞 (smallchill@163.com).
 * <p>
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * <p>
 * http://www.apache.org/licenses/LICENSE-2.0
 * <p>
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.knowledge.auth.granter;

import com.knowledge.auth.feign.AuthInternalClient;
import com.knowledge.auth.utils.IdentityTokenClaims;
import com.knowledge.auth.utils.TokenHashUtil;
import com.knowledge.core.launch.constant.TokenConstant;
import com.knowledge.core.secure.provider.JwtTokenProvider;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.dto.AuthSessionValidationDTO;
import com.knowledge.system.vo.UserInfo;
import lombok.AllArgsConstructor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * RefreshTokenGranter
 *
 * @author Chill
 */
@Component
@AllArgsConstructor
public class RefreshTokenGranter implements ITokenGranter {

	public static final String GRANT_TYPE = "refresh_token";

	private final AuthInternalClient authInternalClient;
	private final JwtTokenProvider jwtTokenProvider;

	@Override
	public UserInfo grant(TokenParameter tokenParameter) {
		String grantType = tokenParameter.getArgs().getStr("grantType");
		String refreshToken = tokenParameter.getArgs().getStr("refreshToken");
		if (!Func.isNoneBlank(grantType, refreshToken) || !grantType.equals(TokenConstant.REFRESH_TOKEN)) {
			return null;
		}

		Jwt jwt = jwtTokenProvider.parseToken(refreshToken);
		if (jwt == null || !TokenConstant.REFRESH_TOKEN.equals(Func.toStr(jwt.getClaim(TokenConstant.TOKEN_TYPE)))) {
			return null;
		}

		Long userId = Func.toLong(jwt.getClaim(TokenConstant.USER_ID));
		String sessionId = Func.toStr(jwt.getClaim(IdentityTokenClaims.SESSION_ID));
		String contextId = Func.toStr(jwt.getClaim(IdentityTokenClaims.CONTEXT_ID));
		int tokenAuthVersion = Func.toInt(jwt.getClaim(IdentityTokenClaims.AUTH_VERSION), 0);
		if (Func.isBlank(sessionId) || Func.isBlank(contextId)) {
			// Legacy stateless refresh tokens cannot participate in rotation or
			// revocation. Require one clean re-login after the session rollout.
			return null;
		}

		// Resolve current account/context state before consuming the single-use
		// refresh token, so ordinary lookup failures do not strand the session in a
		// rotating state.
		R<UserInfo> userResult = authInternalClient.userInfoByContext(userId, contextId);
		UserInfo userInfo = userResult.isSuccess() ? userResult.getData() : null;
		if (userInfo == null
				|| tokenAuthVersion != Func.toInt(userInfo.getAuthVersion(), 0)) {
			return null;
		}

		AuthSessionValidationDTO validation = new AuthSessionValidationDTO();
		validation.setSessionKey(sessionId);
		validation.setRefreshTokenHash(TokenHashUtil.sha256(refreshToken));
		validation.setAuthVersion(tokenAuthVersion);
		R<Boolean> validationResult = authInternalClient.validateSession(validation);
		if (!validationResult.isSuccess() || !Boolean.TRUE.equals(validationResult.getData())) {
			return null;
		}

		userInfo.setSessionId(sessionId);
		userInfo.setAudience(jwt.getAudience().isEmpty()
				? Func.toStr(jwt.getClaim(IdentityTokenClaims.AUDIENCE))
				: jwt.getAudience().get(0));
		userInfo.setCurrentContextType(Func.toStr(jwt.getClaim(IdentityTokenClaims.CONTEXT_TYPE)));
		userInfo.setCurrentContextId(contextId);
		return userInfo;
	}
}
