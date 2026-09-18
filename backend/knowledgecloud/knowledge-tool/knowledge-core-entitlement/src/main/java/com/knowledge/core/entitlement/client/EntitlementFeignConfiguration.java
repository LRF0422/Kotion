package com.knowledge.core.entitlement.client;

import com.knowledge.core.cloud.auth.ServiceTokenProvider;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.springframework.context.annotation.Bean;

/**
 * 为 {@link IEntitlementClient} 附带内部服务令牌。
 *
 * <p>令牌放在自定义头 {@code Knowledge-Internal-Token}，不覆盖 {@code Authorization}：
 * 默认的 {@code KnowledgeFeignRequestHeaderInterceptor} 会透传调用方用户令牌且顺序不可控，
 * 内部身份用独立头更确定。服务端按同名头校验。</p>
 *
 * <p>本类不带 {@code @Configuration}，不会被组件扫描，只作为该 Feign 客户端的局部配置。</p>
 *
 * @author Kotion
 */
public class EntitlementFeignConfiguration {

	/** 内部服务令牌请求头；knowledge-system 侧按同名头校验。 */
	public static final String INTERNAL_TOKEN_HEADER = "Knowledge-Internal-Token";

	@Bean
	public RequestInterceptor entitlementServiceTokenInterceptor(ServiceTokenProvider serviceTokenProvider) {
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
