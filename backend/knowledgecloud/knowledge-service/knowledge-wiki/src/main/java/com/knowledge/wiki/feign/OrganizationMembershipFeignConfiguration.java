package com.knowledge.wiki.feign;

import org.springframework.cloud.openfeign.clientconfig.FeignClientConfigurer;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;

import com.knowledge.core.cloud.auth.ServiceTokenProvider;

import feign.RequestInterceptor;
import feign.RequestTemplate;

/**
 * Feign 配置：让 {@link IOrganizationMembershipClient} 以内部服务账号调用
 * knowledge-system，而不是透传当前用户的令牌（该内部接口只允许服务账号访问）。
 *
 * <p>默认的 {@code KnowledgeFeignRequestHeaderInterceptor} 会转发调用方的
 * Authorization 头；这里关闭父配置继承并显式写入服务令牌，避免普通用户拿到
 * 授予组织成员的权限。
 *
 * <p>注意：本类刻意放在 {@code com.knowledge.wiki.service} 组件扫描根之外，
 * 否则其中的 {@link RequestInterceptor} Bean 会变成全局 Bean，影响本服务所有
 * Feign 调用（例如用户维度的鉴权透传）。
 */
public class OrganizationMembershipFeignConfiguration {

	@Bean
	public FeignClientConfigurer organizationMembershipFeignClientConfigurer() {
		return new FeignClientConfigurer() {
			@Override
			public boolean inheritParentConfiguration() {
				return false;
			}
		};
	}

	@Bean
	public RequestInterceptor organizationMembershipServiceTokenInterceptor(ServiceTokenProvider serviceTokenProvider) {
		return new ServiceTokenRequestInterceptor(serviceTokenProvider);
	}

	private static final class ServiceTokenRequestInterceptor implements RequestInterceptor, Ordered {

		private final ServiceTokenProvider serviceTokenProvider;

		private ServiceTokenRequestInterceptor(ServiceTokenProvider serviceTokenProvider) {
			this.serviceTokenProvider = serviceTokenProvider;
		}

		@Override
		public void apply(RequestTemplate template) {
			template.removeHeader(HttpHeaders.AUTHORIZATION);
			template.header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceTokenProvider.getServiceToken());
		}

		@Override
		public int getOrder() {
			return Ordered.LOWEST_PRECEDENCE;
		}
	}
}
