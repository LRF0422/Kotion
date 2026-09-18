package com.knowledge.system.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.knowledge.system.domain.UserSubscription;
import com.knowledge.system.domain.enums.SubscriptionStatus;
import com.knowledge.system.mapper.UserSubscriptionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 订阅到期任务：把已过期订阅标记为 EXPIRED，便于报表统计。
 *
 * <p>权益解析本身已按 end_time 动态判定过期，因此本任务只维护状态列。</p>
 *
 * @author Kotion
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SubscriptionExpiryJob {

	private final UserSubscriptionMapper userSubscriptionMapper;

	@Scheduled(cron = "0 10 0 * * ?")
	public void expire() {
		List<UserSubscription> expired = userSubscriptionMapper.selectList(
				new LambdaQueryWrapper<UserSubscription>()
						.eq(UserSubscription::getStatus, SubscriptionStatus.ACTIVE.getCode())
						.isNotNull(UserSubscription::getEndTime)
						.lt(UserSubscription::getEndTime, LocalDateTime.now()));
		for (UserSubscription subscription : expired) {
			subscription.setStatus(SubscriptionStatus.EXPIRED.getCode());
			userSubscriptionMapper.updateById(subscription);
		}
		if (!expired.isEmpty()) {
			log.info("Subscription expiry job marked {} subscriptions expired", expired.size());
		}
	}
}
