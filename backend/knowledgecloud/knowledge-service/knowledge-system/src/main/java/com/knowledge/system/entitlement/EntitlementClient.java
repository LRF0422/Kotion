package com.knowledge.system.entitlement;

import cn.hutool.core.util.StrUtil;
import com.knowledge.core.entitlement.EntitlementResolver;
import com.knowledge.core.entitlement.client.EntitlementFeignConfiguration;
import com.knowledge.core.entitlement.client.IEntitlementClient;
import com.knowledge.core.entitlement.model.EntitlementSnapshot;
import com.knowledge.core.launch.constant.TokenConstant;
import com.knowledge.core.secure.provider.JwtTokenProvider;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.api.ResultCode;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.core.tool.utils.WebUtil;
import com.knowledge.system.service.IEntitlementService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.Map;

/**
 * 权益服务的内部实现（服务间调用）。
 *
 * <p>身份校验用 {@code Knowledge-Internal-Token} 请求头中的服务令牌，而不是
 * {@code @PreAuthorize} + Authorization：Feign 默认透传调用方用户令牌，方法级鉴权
 * 会随调用方身份变化而失败。与 wiki 的 OrganizationMembership 内部接口同构。</p>
 *
 * @author Kotion
 */
@RestController
@RequiredArgsConstructor
public class EntitlementClient implements IEntitlementClient {

	private static final String SERVICE_ACCOUNT = "internal-service";
	private static final String FUNC_SERVICE_USER_ID = "-1";

	private final IEntitlementService entitlementService;
	private final EntitlementResolver entitlementResolver;
	private final JwtTokenProvider jwtTokenProvider;

	@Override
	public R<EntitlementSnapshot> snapshot(Long userId) {
		if (!isInternalServiceCall()) {
			return R.fail(ResultCode.UN_AUTHORIZED, "内部接口仅允许服务间调用");
		}
		return R.data(entitlementResolver.resolve(userId));
	}

	@Override
	public R<Boolean> hasFeature(Long userId, String code) {
		if (!isInternalServiceCall()) {
			return R.fail(ResultCode.UN_AUTHORIZED, "内部接口仅允许服务间调用");
		}
		return R.data(entitlementService.hasFeature(userId, code));
	}

	@Override
	public R<Long> getQuota(Long userId, String code) {
		if (!isInternalServiceCall()) {
			return R.fail(ResultCode.UN_AUTHORIZED, "内部接口仅允许服务间调用");
		}
		return R.data(entitlementService.getQuota(userId, code));
	}

	/** 校验请求头中的令牌是否为平台内部服务账号签发的有效令牌。 */
	private boolean isInternalServiceCall() {
		HttpServletRequest request = WebUtil.getRequest();
		if (request == null) {
			return false;
		}
		String token = request.getHeader(EntitlementFeignConfiguration.INTERNAL_TOKEN_HEADER);
		if (StrUtil.isBlank(token)) {
			return false;
		}
		Jwt jwt;
		try {
			jwt = jwtTokenProvider.parseToken(token);
		} catch (RuntimeException parseFailure) {
			return false;
		}
		if (jwt == null) {
			return false;
		}
		Map<String, Object> claims = jwt.getClaims();
		return SERVICE_ACCOUNT.equals(Func.toStr(claims.get(TokenConstant.ACCOUNT)))
				&& FUNC_SERVICE_USER_ID.equals(Func.toStr(claims.get(TokenConstant.USER_ID)));
	}
}
