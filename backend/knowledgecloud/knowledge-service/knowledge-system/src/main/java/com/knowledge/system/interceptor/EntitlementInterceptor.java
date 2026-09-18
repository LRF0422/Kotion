package com.knowledge.system.interceptor;

import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.ResultCode;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.system.annotation.RequireEntitlement;
import com.knowledge.system.service.IEntitlementService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * 权益拦截器：只对标注 {@link RequireEntitlement} 的处理器生效。
 *
 * @author Kotion
 */
@Component
@RequiredArgsConstructor
public class EntitlementInterceptor implements HandlerInterceptor {

	private final IEntitlementService entitlementService;

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
		if (!(handler instanceof HandlerMethod)) {
			return true;
		}
		HandlerMethod handlerMethod = (HandlerMethod) handler;
		RequireEntitlement annotation = handlerMethod.getMethodAnnotation(RequireEntitlement.class);
		if (annotation == null) {
			annotation = handlerMethod.getBeanType().getAnnotation(RequireEntitlement.class);
		}
		if (annotation == null) {
			return true;
		}
		Long userId = SecurityContextUtil.getUserId();
		if (userId == null) {
			throw new BusinessException(ResultCode.UN_AUTHORIZED.getCode(), "用户未登录");
		}
		if (!entitlementService.hasFeature(userId, annotation.value())) {
			throw new BusinessException(ResultCode.FAILURE.getCode(), annotation.message());
		}
		return true;
	}
}
