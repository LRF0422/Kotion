package com.knowledge.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.knowledge.system.domain.SubscriptionPlan;
import com.knowledge.system.domain.vo.SubscriptionCatalogVO;
import com.knowledge.system.domain.vo.SubscriptionPlanVO;

import java.util.Map;

/**
 * 订阅方案与权益目录服务。
 *
 * @author Kotion
 */
public interface ISubscriptionPlanService extends IService<SubscriptionPlan> {

	/** 权益定义 + 启用方案的完整目录（前端对比表的数据源）。 */
	SubscriptionCatalogVO getCatalog();

	/** 按编码取启用中的方案；不存在返回 null。 */
	SubscriptionPlan getByCode(String planCode);

	/** 某方案的能力开关。 */
	Map<String, Boolean> getFeatures(String planCode);

	/** 某方案的数值配额（-1 表示不限）。 */
	Map<String, Long> getQuotas(String planCode);

	/** 某方案的详情视图（含权益）。 */
	SubscriptionPlanVO getPlanDetail(String planCode);
}
