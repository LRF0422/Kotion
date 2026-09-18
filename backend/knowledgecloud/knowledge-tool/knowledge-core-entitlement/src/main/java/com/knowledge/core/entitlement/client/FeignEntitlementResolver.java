package com.knowledge.core.entitlement.client;

import com.knowledge.core.entitlement.EntitlementResolver;
import com.knowledge.core.entitlement.model.EntitlementSnapshot;
import com.knowledge.core.tool.api.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;

/**
 * 默认解析器：通过 {@link IEntitlementClient} 调用权益权威源。
 *
 * <p>这里刻意持有 {@link ObjectProvider} 而不是直接注入客户端：Feign 代理的创建会牵出
 * Web MVC 基础设施（HttpMessageConverters / EnableWebMvcConfiguration），若在启动阶段
 * 与 {@code WebMvcConfigurer -> Interceptor -> Gate -> Resolver} 形成回路就会触发
 * Spring 循环依赖。惰性获取把客户端创建推迟到首次解析（此时 MVC 已就绪）。</p>
 *
 * <p>解析失败时回退免费版（fail-closed，取最小权益），避免下游服务把故障放大成放行。</p>
 *
 * @author Kotion
 */
@Slf4j
public class FeignEntitlementResolver implements EntitlementResolver {

	private final ObjectProvider<IEntitlementClient> entitlementClientProvider;

	public FeignEntitlementResolver(ObjectProvider<IEntitlementClient> entitlementClientProvider) {
		this.entitlementClientProvider = entitlementClientProvider;
	}

	@Override
	public EntitlementSnapshot resolve(Long userId) {
		if (userId == null) {
			return EntitlementSnapshot.free();
		}
		try {
			IEntitlementClient entitlementClient = entitlementClientProvider.getIfAvailable();
			if (entitlementClient == null) {
				log.warn("Entitlement client unavailable for user {}, fallback to FREE", userId);
				return EntitlementSnapshot.free();
			}
			R<EntitlementSnapshot> result = entitlementClient.snapshot(userId);
			if (result != null && result.isSuccess() && result.getData() != null) {
				return result.getData();
			}
			log.warn("Entitlement resolve returned no data for user {}, fallback to FREE", userId);
		} catch (Exception e) {
			log.warn("Entitlement resolve failed for user {}, fallback to FREE: {}", userId, e.getMessage());
		}
		return EntitlementSnapshot.free();
	}
}
