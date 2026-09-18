package com.knowledge.core.entitlement.config;

import com.knowledge.core.entitlement.interceptor.EntitlementInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 注册权益拦截器；只对标注了 {@link com.knowledge.core.entitlement.annotation.RequireEntitlement}
 * 的接口生效。
 *
 * @author Kotion
 */
public class EntitlementWebMvcConfiguration implements WebMvcConfigurer {

	private final EntitlementInterceptor entitlementInterceptor;

	public EntitlementWebMvcConfiguration(EntitlementInterceptor entitlementInterceptor) {
		this.entitlementInterceptor = entitlementInterceptor;
	}

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(entitlementInterceptor).addPathPatterns("/**");
	}
}
