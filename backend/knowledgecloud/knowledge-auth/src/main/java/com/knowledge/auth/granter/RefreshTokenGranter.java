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

import com.knowledge.core.launch.constant.TokenConstant;
import com.knowledge.core.secure.provider.JwtTokenProvider;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.feign.IUserClient;
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

	private final IUserClient userClient;
	private final JwtTokenProvider jwtTokenProvider;

	@Override
	public UserInfo grant(TokenParameter tokenParameter) {
		String grantType = tokenParameter.getArgs().getStr("grantType");
		String refreshToken = tokenParameter.getArgs().getStr("refreshToken");
		UserInfo userInfo = null;
		if (Func.isNoneBlank(grantType, refreshToken) && grantType.equals(TokenConstant.REFRESH_TOKEN)) {
			// Use JwtTokenProvider to parse and validate the refresh token
			Jwt jwt = jwtTokenProvider.parseToken(refreshToken);
			if (jwt != null) {
				String tokenType = Func.toStr(jwt.getClaim(TokenConstant.TOKEN_TYPE));
				if (tokenType.equals(TokenConstant.REFRESH_TOKEN)) {
					Long userId = Func.toLong(jwt.getClaim(TokenConstant.USER_ID));
					R<UserInfo> result = userClient.userInfo(userId);
					userInfo = result.isSuccess() ? result.getData() : null;
				}
			}
		}
		return userInfo;
	}
}
