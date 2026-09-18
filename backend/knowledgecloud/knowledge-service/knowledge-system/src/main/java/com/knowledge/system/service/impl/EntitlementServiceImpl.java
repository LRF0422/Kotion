package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.knowledge.system.domain.SubscriptionPlan;
import com.knowledge.system.domain.UserSubscription;
import com.knowledge.system.domain.enums.PlanCode;
import com.knowledge.system.domain.vo.PlanEntitlementsVO;
import com.knowledge.system.mapper.UserSubscriptionMapper;
import com.knowledge.system.service.IEntitlementService;
import com.knowledge.system.service.ISubscriptionPlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 权益解析实现。
 *
 * <p>缓存为进程内短 TTL（单实例安全）；订阅变更走 {@link #evict(Long)}。
 * 多实例部署时最多 60 秒陈旧窗口，可接受；若需强一致再换 Redis。</p>
 *
 * @author Kotion
 */
@Service
@RequiredArgsConstructor
public class EntitlementServiceImpl implements IEntitlementService {

	private static final long CACHE_TTL_MILLIS = 60_000L;

	private final ISubscriptionPlanService planService;
	private final UserSubscriptionMapper userSubscriptionMapper;
	private final ConcurrentHashMap<Long, Cached> cache = new ConcurrentHashMap<>();

	@Override
	public PlanEntitlementsVO resolve(Long userId) {
		if (userId == null) {
			return build(null, PlanCode.FREE);
		}
		long now = System.currentTimeMillis();
		Cached cached = cache.get(userId);
		if (cached != null && now - cached.at < CACHE_TTL_MILLIS) {
			return cached.value;
		}
		PlanEntitlementsVO value = build(userId, resolvePlanCode(userId));
		cache.put(userId, new Cached(value, now));
		return value;
	}

	private PlanCode resolvePlanCode(Long userId) {
		UserSubscription subscription = userSubscriptionMapper.selectOne(new LambdaQueryWrapper<UserSubscription>()
			.eq(UserSubscription::getUserId, userId)
			.orderByDesc(UserSubscription::getUpdateTime)
			.last("limit 1"));
		if (subscription == null || subscription.getPlanCode() == null) {
			return PlanCode.FREE;
		}
		if (subscription.getEndTime() != null && subscription.getEndTime().isBefore(LocalDateTime.now())) {
			return PlanCode.FREE;
		}
		return PlanCode.fromCode(subscription.getPlanCode());
	}

	private PlanEntitlementsVO build(Long userId, PlanCode code) {
		SubscriptionPlan plan = planService.getByCode(code.getCode());
		PlanEntitlementsVO vo = new PlanEntitlementsVO();
		vo.setUserId(userId);
		vo.setPlanCode(code.getCode());
		vo.setPlanName(plan != null ? plan.getPlanName() : code.getLabel());
		vo.setTier(code.getTier());
		Map<String, Boolean> features = planService.getFeatures(code.getCode());
		Map<String, Long> quotas = planService.getQuotas(code.getCode());
		vo.setFeatures(features);
		vo.setQuotas(quotas);
		vo.setResolvedAt(System.currentTimeMillis());
		return vo;
	}

	@Override
	public boolean hasFeature(Long userId, String entCode) {
		return Boolean.TRUE.equals(resolve(userId).getFeatures().get(entCode));
	}

	@Override
	public Long getQuota(Long userId, String entCode) {
		Long value = resolve(userId).getQuotas().get(entCode);
		return value == null ? 0L : value;
	}

	@Override
	public void evict(Long userId) {
		if (userId != null) {
			cache.remove(userId);
		}
	}

	@Override
	public void evictAll() {
		cache.clear();
	}

	private static final class Cached {
		private final PlanEntitlementsVO value;
		private final long at;

		private Cached(PlanEntitlementsVO value, long at) {
			this.value = value;
			this.at = at;
		}
	}
}
