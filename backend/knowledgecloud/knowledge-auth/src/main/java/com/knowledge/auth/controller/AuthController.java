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
import com.knowledge.core.secure.AuthInfo;
import com.knowledge.core.tool.api.R;
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
import com.knowledge.auth.granter.ITokenGranter;
import com.knowledge.auth.granter.RefreshTokenGranter;
import com.knowledge.auth.granter.TokenGranterBuilder;
import com.knowledge.auth.granter.TokenParameter;
import com.knowledge.auth.utils.TokenUtil;
import com.knowledge.common.cache.CacheNames;
import com.knowledge.system.vo.UserInfo;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
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

	@PostMapping("oauth2/token")
	@ApiOperation(value = "获取认证token", notes = "传入租户ID:tenantId,账号:account,密码:password")
	public R<AuthInfo> token(
			@ApiParam(value = "授权类型", required = true) @RequestParam(defaultValue = "password", required = false) String grantType,
			@ApiParam(value = "刷新令牌") @RequestParam(required = false) String refreshToken,
			@ApiParam(value = "租户ID", required = false) @RequestParam(required = false) String tenantId,
			@ApiParam(value = "账号") @RequestParam(required = false) String account,
			@ApiParam(value = "密码") @RequestParam(required = false) String password) {

		String userType = Func.toStr(WebUtil.getRequest().getHeader(TokenUtil.USER_TYPE_HEADER_KEY),
				TokenUtil.DEFAULT_USER_TYPE);

		TokenParameter tokenParameter = new TokenParameter();
		tokenParameter.getArgs().set("tenantId", tenantId)
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

		// 禁用账号拦截：status 2-禁用
		if (Integer.valueOf(2).equals(userInfo.getUser().getStatus())) {
			recordLoginLog(grantType, tenantId, account, userInfo, 0, "USER_DISABLED");
			return R.fail(TokenUtil.USER_DISABLED);
		}

		recordLoginLog(grantType, tenantId, account, userInfo, 1, null);
		return R.data(TokenUtil.createAuthInfo(userInfo));
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
			logLogin.setCreateTime(LocalDateTime.now());
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
