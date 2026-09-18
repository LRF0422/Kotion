package com.knowledge.core.entitlement;

import com.knowledge.core.entitlement.model.EntitlementSnapshot;

/**
 * 权益解析 SPI。宿主服务提供实现：
 *
 * <ul>
 *   <li>权益权威源（如 knowledge-system）用本地服务实现，避免自调用；</li>
 *   <li>其他服务无需实现，自动装配会提供基于 Feign 的默认实现。</li>
 * </ul>
 *
 * @author Kotion
 */
public interface EntitlementResolver {

	/** 解析用户权益，永不返回 null；未知用户返回免费版。 */
	EntitlementSnapshot resolve(Long userId);
}
