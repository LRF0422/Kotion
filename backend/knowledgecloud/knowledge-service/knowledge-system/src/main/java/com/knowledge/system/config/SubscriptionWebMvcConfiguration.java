package com.knowledge.system.config;

import com.knowledge.system.interceptor.EntitlementInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 注册权益拦截器；只有标注了 {@link com.knowledge.system.annotation.RequireEntitlement}
 * 的接口才会真正校验。
 *
 * @author Kotion
 */
@Configuration
@RequiredArgsConstructor
public class SubscriptionWebMvcConfiguration implements WebMvcConfigurer {

	private final EntitlementInterceptor entitlementInterceptor;

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(entitlementInterceptor).addPathPatterns("/**");
	}
}
