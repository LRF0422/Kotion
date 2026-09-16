package com.knowledge.wiki.feign;

import org.springframework.context.annotation.Bean;

import com.knowledge.core.cloud.auth.ServiceTokenProvider;

import feign.RequestInterceptor;
import feign.RequestTemplate;

/**
 * Feign 配置：为 {@link IOrganizationMembershipClient} 附带内部服务令牌。
 *
 * <p>令牌放在自定义请求头 {@link #INTERNAL_TOKEN_HEADER} 中，而不是覆盖
 * {@code Authorization}：
 * <ul>
 *   <li>默认的 {@code KnowledgeFeignRequestHeaderInterceptor} 会透传调用方的
 *       Authorization（本服务其它 Feign 调用正是依赖它），拦截器执行顺序不可控，
 *       因此内部身份不能依赖 Authorization；</li>
 *   <li>自定义头不会被任何平台拦截器改写，服务端可以确定性地校验；</li>
 *   <li>Authorization 仍然透传，服务端的安全过滤器照常把调用方识别为登录用户，
 *       不会因为缺少凭证直接 401。</li>
 * </ul>
 *
 * <p>本类不携带 {@code @Configuration}/{@code @Component} 注解，因此不会被组件扫描
 * 注册为全局 Bean（否则会污染本服务所有 Feign 调用）。
 */
public class OrganizationMembershipFeignConfiguration {

	/** 内部服务令牌请求头；knowledge-system 侧按同名头校验。 */
	public static final String INTERNAL_TOKEN_HEADER = "Knowledge-Internal-Token";

	@Bean
	public RequestInterceptor organizationMembershipServiceTokenInterceptor(
			ServiceTokenProvider serviceTokenProvider) {
		return new ServiceTokenRequestInterceptor(serviceTokenProvider);
	}

	private static final class ServiceTokenRequestInterceptor implements RequestInterceptor {

		private final ServiceTokenProvider serviceTokenProvider;

		private ServiceTokenRequestInterceptor(ServiceTokenProvider serviceTokenProvider) {
			this.serviceTokenProvider = serviceTokenProvider;
		}

		@Override
		public void apply(RequestTemplate template) {
			template.header(INTERNAL_TOKEN_HEADER, serviceTokenProvider.getServiceToken());
		}
	}
}
