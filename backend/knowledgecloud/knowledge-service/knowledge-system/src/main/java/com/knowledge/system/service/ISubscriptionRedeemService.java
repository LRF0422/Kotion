package com.knowledge.system.service;

import com.knowledge.system.domain.SubscriptionRedeemCode;
import com.knowledge.system.domain.vo.UserSubscriptionVO;

import java.util.List;

/**
 * 兑换码服务。
 *
 * @author Kotion
 */
public interface ISubscriptionRedeemService {

	/** 使用兑换码，成功返回最新订阅。 */
	UserSubscriptionVO redeem(Long userId, String code);

	/** 管理端创建兑换码。 */
	SubscriptionRedeemCode create(SubscriptionRedeemCode input, Long operatorId);

	/** 管理端列表。 */
	List<SubscriptionRedeemCode> list();
}
