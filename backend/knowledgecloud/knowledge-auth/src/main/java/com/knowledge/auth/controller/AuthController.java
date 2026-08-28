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
package com.knowledge.auth.controller;

import com.knowledge.core.log.feign.ILogClient;
import com.knowledge.core.log.model.LogLogin;
import com.knowledge.core.launch.constant.TokenConstant;
import com.knowledge.core.secure.AuthInfo;
import com.knowledge.core.secure.provider.JwtTokenProvider;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.KnowledgeConstant;
import com.knowledge.core.tool.support.Kv;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.core.tool.utils.RedisUtil;
import com.knowledge.core.tool.utils.WebUtil;
import com.wf.captcha.SpecCaptcha;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiParam;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.knowledge.auth.feign.AuthInternalClient;
import com.knowledge.auth.granter.ITokenGranter;
import com.knowledge.auth.granter.RefreshTokenGranter;
import com.knowledge.auth.granter.TokenGranterBuilder;
import com.knowledge.auth.granter.TokenParameter;
import com.knowledge.auth.utils.IdentityTokenClaims;
import com.knowledge.auth.utils.TokenHashUtil;
import com.knowledge.auth.utils.TokenUtil;
import com.knowledge.common.cache.CacheNames;
import com.knowledge.system.dto.AuthSessionDTO;
import com.knowledge.system.dto.AuthSessionValidationDTO;
import com.knowledge.system.vo.UserInfo;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * 认证模块
 *
 * @author Chill
 */
@Slf4j
@RestController
@AllArgsConstructor
@Api(value = "用户授权认证", tags = "授权接口")
public class AuthController {

	private RedisUtil redisUtil;

	private ILogClient logClient;

	private AuthInternalClient authInternalClient;

	private JwtTokenProvider jwtTokenProvider;

	@PostMapping("oauth2/token")
	@ApiOperation(value = "获取认证token", notes = "传入租户ID:tenantId,账号:account,密码:password")
	public R<AuthInfo> token(
			@ApiParam(value = "授权类型", required = true) @RequestParam(defaultValue = "password", required = false) String grantType,
			@ApiParam(value = "刷新令牌") @RequestParam(required = false) String refreshToken,
			@ApiParam(value = "租户ID", required = false) @RequestParam(required = false) String tenantId,
			@ApiParam(value = "客户端 audience") @RequestParam(required = false) String audience,
			@ApiParam(value = "账号") @RequestParam(required = false) String account,
			@ApiParam(value = "密码") @RequestParam(required = false) String password) {

		String userType = Func.toStr(WebUtil.getRequest().getHeader(TokenUtil.USER_TYPE_HEADER_KEY),
				TokenUtil.DEFAULT_USER_TYPE);

		TokenParameter tokenParameter = new TokenParameter();
		tokenParameter.getArgs().set("tenantId", tenantId)
				.set("audience", audience)
					.set("account", account)
				.set("password", password)
				.set("grantType", grantType)
				.set("refreshToken", refreshToken)
				.set("userType", userType);

		ITokenGranter granter = TokenGranterBuilder.getGranter(grantType);
		UserInfo userInfo = granter.grant(tokenParameter);

		if (userInfo == null || userInfo.getUser() == null || userInfo.getUser().getId() == null) {
			recordLoginLog(grantType, tenantId, account, null, 0, "BAD_CREDENTIALS");
			return R.fail(TokenUtil.USER_NOT_FOUND);
		}

		String grantedSessionId = userInfo.getSessionId();
		String grantedAudience = userInfo.getAudience();
		String requestedAudience = Func.toStr(audience, TokenUtil.DEFAULT_CLIENT_AUDIENCE);
		if (RefreshTokenGranter.GRANT_TYPE.equals(grantType)) {
			requestedAudience = Func.toStr(grantedAudience, TokenUtil.DEFAULT_CLIENT_AUDIENCE);
			if (Func.isNotBlank(audience) && !requestedAudience.equals(audience)) {
				return R.fail("刷新令牌 audience 不匹配");
			}
		}
		if (!TokenUtil.DEFAULT_CLIENT_AUDIENCE.equals(requestedAudience)
				&& !isOperatorAudience(requestedAudience)) {
			return R.fail("不支持的客户端 audience");
		}
		if (isOperatorAudience(requestedAudience)) {
			R<UserInfo> operatorContext = authInternalClient.userInfoByContext(
					userInfo.getUser().getId(), KnowledgeConstant.ADMIN_TENANT_ID);
			if (!operatorContext.isSuccess() || operatorContext.getData() == null) {
				return R.fail("当前账号不能登录平台运营端");
			}
			userInfo = operatorContext.getData();
			userInfo.setSessionId(grantedSessionId);
			userInfo.setAudience(grantedAudience);
		}
		if (Func.isBlank(userInfo.getAudience())) {
			userInfo.setAudience(requestedAudience);
		}
		if (isOperatorAudience(userInfo.getAudience()) && !canUseOperatorAudience(userInfo)) {
			return R.fail("当前账号不能登录平台运营端");
		}
		if (Func.isBlank(userInfo.getSessionId())) {
			userInfo.setSessionId(UUID.randomUUID().toString());
		}

		// 禁用账号拦截：status 2-禁用
		if (Integer.valueOf(2).equals(userInfo.getUser().getStatus())) {
			recordLoginLog(grantType, userInfo.getCurrentContextId(), account, userInfo, 0, "USER_DISABLED");
			return R.fail(TokenUtil.USER_DISABLED);
		}

		recordLoginLog(grantType, userInfo.getCurrentContextId(), account, userInfo, 1, null);
		AuthInfo authInfo;
		try {
			authInfo = TokenUtil.createAuthInfo(userInfo);
			persistSession(userInfo, authInfo);
		} catch (RuntimeException error) {
			if (RefreshTokenGranter.GRANT_TYPE.equals(grantType)) {
				authInternalClient.revokeSession(userInfo.getSessionId());
			}
			throw error;
		}
		return R.data(authInfo);
	}

	@PostMapping("oauth2/context")
	@ApiOperation(value = "切换当前个人/组织上下文")
	public R<AuthInfo> switchContext(
			@RequestParam String contextId,
			@RequestParam String refreshToken,
			@RequestHeader(value = "Authorization", required = false) String authorization) {
		Jwt jwt = jwtTokenProvider.parseToken(extractBearerToken(authorization));
		if (jwt == null || !TokenConstant.ACCESS_TOKEN.equals(Func.toStr(jwt.getClaim(TokenConstant.TOKEN_TYPE)))) {
			return R.fail("当前登录凭证无效");
		}
		Long userId = Func.toLong(jwt.getClaim(TokenConstant.USER_ID));
		String sessionId = Func.toStr(jwt.getClaim(IdentityTokenClaims.SESSION_ID));
		String sourceContextId = Func.toStr(jwt.getClaim(IdentityTokenClaims.CONTEXT_ID),
				Func.toStr(jwt.getClaim(TokenConstant.TENANT_ID)));
		int tokenAuthVersion = Func.toInt(jwt.getClaim(IdentityTokenClaims.AUTH_VERSION), 0);
		if (Func.isBlank(sourceContextId) || sourceContextId.equals(contextId)) {
			return R.fail("目标上下文必须与当前上下文不同");
		}
		Jwt refreshJwt = jwtTokenProvider.parseToken(refreshToken);
		if (refreshJwt == null
				|| !TokenConstant.REFRESH_TOKEN.equals(Func.toStr(refreshJwt.getClaim(TokenConstant.TOKEN_TYPE)))
				|| !userId.equals(Func.toLong(refreshJwt.getClaim(TokenConstant.USER_ID)))
				|| !sessionId.equals(Func.toStr(refreshJwt.getClaim(IdentityTokenClaims.SESSION_ID)))
				|| tokenAuthVersion != Func.toInt(refreshJwt.getClaim(IdentityTokenClaims.AUTH_VERSION), 0)
				|| !sourceContextId.equals(Func.toStr(refreshJwt.getClaim(IdentityTokenClaims.CONTEXT_ID)))) {
			return R.fail("刷新令牌与当前会话不匹配");
		}

		R<UserInfo> result = authInternalClient.userInfoByContext(userId, contextId);
		if (!result.isSuccess() || result.getData() == null) {
			return R.fail("无权切换到该上下文");
		}
		UserInfo userInfo = result.getData();
		if (tokenAuthVersion != Func.toInt(userInfo.getAuthVersion(), 0)) {
			return R.fail("登录凭证已失效，请重新登录");
		}
		String targetAudience = jwt.getAudience().isEmpty()
				? Func.toStr(jwt.getClaim(IdentityTokenClaims.AUDIENCE), TokenUtil.DEFAULT_CLIENT_AUDIENCE)
				: jwt.getAudience().get(0);
		userInfo.setAudience(targetAudience);
		if (isOperatorAudience(targetAudience) && !canUseOperatorAudience(userInfo)) {
			return R.fail("平台运营会话不能切换到该上下文");
		}

		// Atomically claim the session from the source context. This serializes
		// refresh and context-switch operations and rejects stale pre-switch access
		// tokens after the session context has changed.
		AuthSessionValidationDTO validation = new AuthSessionValidationDTO();
		validation.setSessionKey(sessionId);
		validation.setRefreshTokenHash(TokenHashUtil.sha256(refreshToken));
		validation.setAuthVersion(tokenAuthVersion);
		R<Boolean> activeResult = authInternalClient.validateSession(validation);
		if (!activeResult.isSuccess() || !Boolean.TRUE.equals(activeResult.getData())) {
			return R.fail("登录会话已失效，请重新登录");
		}

		userInfo.setSessionId(sessionId);
		try {
			AuthInfo authInfo = TokenUtil.createAuthInfo(userInfo);
			persistSession(userInfo, authInfo);
			return R.data(authInfo);
		} catch (RuntimeException error) {
			authInternalClient.revokeSession(sessionId);
			throw error;
		}
	}

	@PostMapping("oauth2/logout")
	@ApiOperation(value = "撤销当前登录会话")
	public R<?> logout(
			@RequestHeader(value = "Authorization", required = false) String authorization,
			@RequestParam(value = "refreshToken", required = false) String refreshToken) {
		Jwt jwt = jwtTokenProvider.parseToken(extractBearerToken(authorization));
		if (jwt == null && Func.isNotBlank(refreshToken)) {
			Jwt refreshJwt = jwtTokenProvider.parseToken(refreshToken);
			if (refreshJwt != null && TokenConstant.REFRESH_TOKEN.equals(
					Func.toStr(refreshJwt.getClaim(TokenConstant.TOKEN_TYPE)))) {
				jwt = refreshJwt;
			}
		}
		if (jwt == null) {
			return R.fail("登录会话凭证无效");
		}
		String sessionId = Func.toStr(jwt.getClaim(IdentityTokenClaims.SESSION_ID));
		if (Func.isBlank(sessionId)) {
			return R.fail("登录会话不存在");
		}
		authInternalClient.revokeSession(sessionId);
		return R.success();
	}

	private boolean isOperatorAudience(String audience) {
		return "kotion-platform-admin".equals(audience);
	}

	private boolean canUseOperatorAudience(UserInfo userInfo) {
		if (userInfo == null || !KnowledgeConstant.ADMIN_TENANT_ID.equals(userInfo.getCurrentContextId())
				|| userInfo.getRoles() == null) {
			return false;
		}
		return userInfo.getRoles().stream().anyMatch(role ->
				"administrator".equalsIgnoreCase(role)
						|| role.toUpperCase().startsWith("PLATFORM_"));
	}

	private String extractBearerToken(String authorization) {
		if (Func.isBlank(authorization) || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
			return "";
		}
		return authorization.substring(7).trim();
	}

	private void persistSession(UserInfo userInfo, AuthInfo authInfo) {
		Jwt refreshJwt = jwtTokenProvider.parseToken(authInfo.getRefreshToken());
		if (refreshJwt == null || refreshJwt.getExpiresAt() == null) {
			throw new IllegalStateException("无法解析新签发的刷新令牌");
		}
		AuthSessionDTO dto = new AuthSessionDTO();
		dto.setSessionKey(userInfo.getSessionId());
		dto.setUserId(userInfo.getUser().getId());
		dto.setAudience(userInfo.getAudience());
		dto.setContextType(userInfo.getCurrentContextType());
		dto.setContextId(userInfo.getCurrentContextId());
		dto.setRefreshTokenHash(TokenHashUtil.sha256(authInfo.getRefreshToken()));
		dto.setAuthVersion(Func.toInt(userInfo.getAuthVersion(), 0));
		dto.setIssuedAt(LocalDateTime.now(ZoneOffset.UTC));
		dto.setExpiresAt(LocalDateTime.ofInstant(refreshJwt.getExpiresAt(), ZoneOffset.UTC));
		dto.setLastSeenAt(LocalDateTime.now(ZoneOffset.UTC));
		HttpServletRequest request = WebUtil.getRequest();
		if (request != null) {
			dto.setRemoteIp(WebUtil.getIP(request));
			dto.setUserAgent(request.getHeader(WebUtil.USER_AGENT_HEADER));
		}
		R<?> persisted = authInternalClient.upsertSession(dto);
		if (!persisted.isSuccess()) {
			throw new IllegalStateException(Func.toStr(persisted.getMsg(), "登录会话保存失败"));
		}
	}

	/**
	 * 登录日志落库（刷新令牌不记录，失败不影响登录主流程）
	 */
	private void recordLoginLog(String grantType, String tenantId, String account, UserInfo userInfo, int success, String failReason) {
		if (RefreshTokenGranter.GRANT_TYPE.equals(grantType)) {
			return;
		}
		try {
			LogLogin logLogin = new LogLogin();
			logLogin.setTenantId(Func.toStr(tenantId, TokenUtil.DEFAULT_TENANT_ID));
			logLogin.setAccount(account);
			if (userInfo != null && userInfo.getUser() != null) {
				logLogin.setUserId(userInfo.getUser().getId());
				logLogin.setAccount(Func.toStr(userInfo.getUser().getAccount(), account));
			}
			logLogin.setSuccess(success);
			logLogin.setFailReason(failReason);
			HttpServletRequest request = WebUtil.getRequest();
			if (request != null) {
				logLogin.setRemoteIp(WebUtil.getIP(request));
				logLogin.setUserAgent(request.getHeader(WebUtil.USER_AGENT_HEADER));
			}
			logLogin.setCreateTime(LocalDateTime.now(ZoneOffset.UTC));
			logClient.saveLoginLog(logLogin);
		} catch (Exception e) {
			log.warn("登录日志记录失败: account={}", account, e);
		}
	}

	@GetMapping("/captcha")
	@ApiOperation(value = "获取验证码")
	public R<Kv> captcha() {
		SpecCaptcha specCaptcha = new SpecCaptcha(130, 48, 5);
		String verCode = specCaptcha.text().toLowerCase();
		String key = UUID.randomUUID().toString();

		// 存入redis并设置过期时间为30分钟
		redisUtil.set(CacheNames.CAPTCHA_KEY + key, verCode, 30L, TimeUnit.MINUTES);
		// 将key和base64返回给前端
		return R.data(Kv.init().set("key", key).set("image", specCaptcha.toBase64()));
	}

}
