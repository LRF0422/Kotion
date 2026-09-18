package com.knowledge.system.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.knowledge.system.domain.UserSubscription;
import com.knowledge.system.domain.dto.SubscriptionGrantDTO;
import com.knowledge.system.domain.vo.AdminUserSubscriptionVO;
import com.knowledge.system.domain.vo.SubscriptionGrantVO;
import com.knowledge.system.domain.vo.UserSubscriptionVO;

import java.util.List;

/**
 * 用户订阅状态服务。
 *
 * @author Kotion
 */
public interface IUserSubscriptionService extends IService<UserSubscription> {

	/** 当前生效订阅；未订阅返回免费版视图，永不返回 null。 */
	UserSubscriptionVO getEffective(Long userId);

	/** 管理端授予/调整方案。 */
	void grant(SubscriptionGrantDTO dto, Long operatorId);

	/** 管理端撤销，降回免费版。 */
	void revoke(Long userId, String remark, Long operatorId);

	/** 管理端用户订阅分页列表。 */
	IPage<AdminUserSubscriptionVO> adminList(long current, long size, String keyword, String planCode);

	/** 某用户的授予日志（倒序）。 */
	List<SubscriptionGrantVO> listGrants(Long userId, int limit);
}
