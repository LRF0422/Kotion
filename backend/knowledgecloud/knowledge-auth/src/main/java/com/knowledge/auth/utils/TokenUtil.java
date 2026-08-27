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
package com.knowledge.auth.utils;

import com.knowledge.core.launch.constant.TokenConstant;
import com.knowledge.core.secure.AuthInfo;
import com.knowledge.core.secure.TokenInfo;
import com.knowledge.core.secure.provider.JwtTokenProvider;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.vo.UserInfo;
import com.knowledge.system.vo.UserVO;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.HashMap;
import java.util.Map;

/**
 * 认证工具类
 *
 * @author Chill
 */
@Component
public class TokenUtil {

	public final static String CAPTCHA_HEADER_KEY = "Captcha-Key";
	public final static String CAPTCHA_HEADER_CODE = "Captcha-Code";
	public final static String CAPTCHA_NOT_CORRECT = "验证码不正确";
	public final static String TENANT_HEADER_KEY = "Tenant-Id";
	public final static String DEFAULT_TENANT_ID = "000000";
	public final static String USER_TYPE_HEADER_KEY = "User-Type";
	public final static String DEFAULT_USER_TYPE = "web";
	public final static String USER_NOT_FOUND = "用户名或密码错误";
	public final static String USER_DISABLED = "账号已被禁用，请联系管理员";
	public final static String HEADER_KEY = "Authorization";
	public final static String HEADER_PREFIX = "Basic ";
	public final static String DEFAULT_AVATAR = "https://gw.alipayobjects.com/zos/rmsportal/BiazfanxmamNRoxxVxka.png";

	private final JwtTokenProvider jwtTokenProvider;

	/**
	 * Static holder for backward compatibility with static method calls.
	 * Initialized after Spring context is ready.
	 */
	private static TokenUtil instance;

	public TokenUtil(JwtTokenProvider jwtTokenProvider) {
		this.jwtTokenProvider = jwtTokenProvider;
	}

	@PostConstruct
	public void init() {
		instance = this;
	}

	/**
	 * 创建认证token (实例方法)
	 *
	 * @param userInfo 用户信息
	 * @return token
	 */
	public AuthInfo createAuthInfoInstance(UserInfo userInfo) {
		UserVO user = userInfo.getUser();
		String roleAliases = Func.join(userInfo.getRoles());

		// 设置jwt参数
		Map<String, Object> param = new HashMap<>(16);
		param.put(TokenConstant.TOKEN_TYPE, TokenConstant.ACCESS_TOKEN);
		param.put(TokenConstant.TENANT_ID, user.getTenantId());
		param.put(TokenConstant.OAUTH_ID, userInfo.getOauthId());
		param.put(TokenConstant.USER_ID, Func.toStr(user.getId()));
		param.put(TokenConstant.ROLE_ID, user.getRoleId());
		param.put(TokenConstant.ROLE_NAME, roleAliases);
		param.put(TokenConstant.DEPT_ID, user.getDeptId());
		param.put(TokenConstant.ACCOUNT, user.getAccount());
		param.put(TokenConstant.USER_NAME, user.getAccount());
		param.put(TokenConstant.CLIENT_ID, "knowledge");

		// Use JwtTokenProvider to create access token
		TokenInfo accessToken = jwtTokenProvider.createAccessToken(param);

		AuthInfo authInfo = new AuthInfo();
		authInfo.setUserId(user.getId());
		authInfo.setTenantId(user.getTenantId());
		authInfo.setOauthId(userInfo.getOauthId());
		authInfo.setAccount(user.getAccount());
		authInfo.setUserName(user.getRealName());
		authInfo.setAuthority(roleAliases);
		authInfo.setAccessToken(accessToken.getToken());
		authInfo.setExpiresIn(accessToken.getExpire());
		authInfo.setRefreshToken(createRefreshTokenInstance(userInfo).getToken());
		authInfo.setTokenType(TokenConstant.BEARER);
		authInfo.setLicense(TokenConstant.LICENSE_NAME);

		return authInfo;
	}

	/**
	 * 创建refreshToken (实例方法)
	 *
	 * @param userInfo 用户信息
	 * @return refreshToken
	 */
	private TokenInfo createRefreshTokenInstance(UserInfo userInfo) {
		UserVO user = userInfo.getUser();
		Map<String, Object> param = new HashMap<>(16);
		param.put(TokenConstant.TOKEN_TYPE, TokenConstant.REFRESH_TOKEN);
		param.put(TokenConstant.USER_ID, Func.toStr(user.getId()));
		param.put(TokenConstant.TENANT_ID, user.getTenantId());
		return jwtTokenProvider.createRefreshToken(param);
	}

	/**
	 * 获取 JwtTokenProvider 实例
	 *
	 * @return JwtTokenProvider
	 */
	public JwtTokenProvider getJwtTokenProvider() {
		return jwtTokenProvider;
	}

	// ============ Static methods for backward compatibility ============

	/**
	 * 创建认证token (静态方法，保持向后兼容)
	 *
	 * @param userInfo 用户信息
	 * @return token
	 */
	public static AuthInfo createAuthInfo(UserInfo userInfo) {
		return instance.createAuthInfoInstance(userInfo);
	}

	/**
	 * 获取静态实例
	 *
	 * @return TokenUtil instance
	 */
	public static TokenUtil getInstance() {
		return instance;
	}

}
