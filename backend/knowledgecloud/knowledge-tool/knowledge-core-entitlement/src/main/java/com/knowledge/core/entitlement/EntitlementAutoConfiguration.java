package com.knowledge.core.entitlement;

import com.knowledge.core.entitlement.client.FeignEntitlementResolver;
import com.knowledge.core.entitlement.client.IEntitlementClient;
import com.knowledge.core.entitlement.config.EntitlementWebMvcConfiguration;
import com.knowledge.core.entitlement.interceptor.EntitlementInterceptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 权益门禁自动装配。
 *
 * <p>业务服务只要依赖 `knowledge-core-entitlement`，无需任何额外配置即可获得
 * `EntitlementGate` / `EntitlementInterceptor` 与基于 Feign 的默认 resolver；
 * 权益权威源可自行提供 resolver Bean 覆盖默认实现。</p>
 *
 * @author Kotion
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "knowledge.entitlement", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(EntitlementProperties.class)
public class EntitlementAutoConfiguration {

	@Bean
	@ConditionalOnMissingBean(EntitlementResolver.class)
	public EntitlementResolver entitlementResolver(IEntitlementClient entitlementClient) {
		return new FeignEntitlementResolver(entitlementClient);
	}

	@Bean
	@ConditionalOnMissingBean
	public EntitlementGate entitlementGate(EntitlementResolver entitlementResolver,
			EntitlementProperties properties, ObjectProvider<StringRedisTemplate> redisProvider) {
		return new EntitlementGate(entitlementResolver, properties.getCacheTtlSeconds(), redisProvider);
	}

	@Bean
	@ConditionalOnMissingBean
	public EntitlementInterceptor entitlementInterceptor(EntitlementGate entitlementGate) {
		return new EntitlementInterceptor(entitlementGate);
	}

	@Bean
	public WebMvcConfigurer entitlementWebMvcConfiguration(EntitlementInterceptor entitlementInterceptor) {
		return new EntitlementWebMvcConfiguration(entitlementInterceptor);
	}
}
