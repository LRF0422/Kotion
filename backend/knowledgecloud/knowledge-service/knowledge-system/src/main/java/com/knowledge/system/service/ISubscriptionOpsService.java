package com.knowledge.system.service;

import com.knowledge.system.domain.vo.AdminUserSubscriptionVO;
import com.knowledge.system.domain.vo.SubscriptionGrantVO;
import com.knowledge.system.domain.vo.SubscriptionOverviewVO;

import java.util.List;

/**
 * 订阅运营能力（看板 / 临期 / 批量 / 审计）。
 *
 * @author Kotion
 */
public interface ISubscriptionOpsService {

	SubscriptionOverviewVO overview();

	List<AdminUserSubscriptionVO> expiring(int days, int limit);

	void batchGrant(List<Long> userIds, String planCode, Integer days, Long operatorId, String remark);

	void batchRevoke(List<Long> userIds, String remark, Long operatorId);

	List<SubscriptionGrantVO> audit(Long operatorId, Long userId, int limit);
}
