package com.knowledge.system.entitlement;

import com.knowledge.core.entitlement.EntitlementResolver;
import com.knowledge.core.entitlement.model.EntitlementSnapshot;
import com.knowledge.system.domain.vo.PlanEntitlementsVO;
import com.knowledge.system.service.IEntitlementService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 权益权威源的本地解析器：直接读本服务数据，避免自我 Feign 调用。
 *
 * @author Kotion
 */
@Component
@RequiredArgsConstructor
public class SystemEntitlementResolver implements EntitlementResolver {

	private final IEntitlementService entitlementService;

	@Override
	public EntitlementSnapshot resolve(Long userId) {
		PlanEntitlementsVO vo = entitlementService.resolve(userId);
		EntitlementSnapshot snapshot = new EntitlementSnapshot();
		if (vo == null) {
			return snapshot;
		}
		snapshot.setUserId(vo.getUserId());
		snapshot.setPlanCode(vo.getPlanCode());
		snapshot.setPlanName(vo.getPlanName());
		snapshot.setTier(vo.getTier());
		if (vo.getFeatures() != null) {
			snapshot.setFeatures(vo.getFeatures());
		}
		if (vo.getQuotas() != null) {
			snapshot.setQuotas(vo.getQuotas());
		}
		return snapshot;
	}
}
