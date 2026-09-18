package com.knowledge.system.service;

import com.knowledge.system.domain.vo.PlanEntitlementsVO;

/**
 * 权益解析：把「用户 -> 方案 -> 权益」收敛成唯一入口，并做短时缓存。
 *
 * @author Kotion
 */
public interface IEntitlementService {

	/** 解析用户当前生效的权益；未订阅或已过期按免费版处理，永不返回 null。 */
	PlanEntitlementsVO resolve(Long userId);

	/** 是否具备某能力（未知编码按 false）。 */
	boolean hasFeature(Long userId, String entCode);

	/** 取某数值配额；-1 表示不限，未知编码按 0。 */
	Long getQuota(Long userId, String entCode);

	/** 订阅变更后主动失效缓存。 */
	void evict(Long userId);

	/** 方案权益配置变更后清空全部缓存。 */
	void evictAll();
}
