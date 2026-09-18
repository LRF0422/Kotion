package com.knowledge.core.entitlement.client;

import com.knowledge.core.entitlement.EntitlementResolver;
import com.knowledge.core.entitlement.model.EntitlementSnapshot;
import com.knowledge.core.tool.api.R;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 默认解析器：通过 {@link IEntitlementClient} 调用权益权威源。
 *
 * <p>解析失败时回退免费版（fail-closed，取最小权益），避免下游服务把故障放大成放行。</p>
 *
 * @author Kotion
 */
@Slf4j
@RequiredArgsConstructor
public class FeignEntitlementResolver implements EntitlementResolver {

	private final IEntitlementClient entitlementClient;

	@Override
	public EntitlementSnapshot resolve(Long userId) {
		if (userId == null) {
			return EntitlementSnapshot.free();
		}
		try {
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
