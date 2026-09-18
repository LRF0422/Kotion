package com.knowledge.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.core.entitlement.EntitlementCacheKeys;
import com.knowledge.system.domain.SubscriptionRedeemCode;
import com.knowledge.system.domain.dto.SubscriptionGrantDTO;
import com.knowledge.system.domain.dto.SubscriptionPlanEntitlementsDTO;
import com.knowledge.system.domain.dto.SubscriptionRevokeDTO;
import com.knowledge.system.domain.vo.AdminUserSubscriptionVO;
import com.knowledge.system.domain.vo.SubscriptionCatalogVO;
import com.knowledge.system.domain.vo.SubscriptionGrantVO;
import com.knowledge.system.domain.vo.SubscriptionPlanVO;
import com.knowledge.system.service.ISubscriptionPlanService;
import com.knowledge.system.service.ISubscriptionRedeemService;
import com.knowledge.system.service.IUserSubscriptionService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.AllArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 平台端订阅管理。本期用管理员授予替代支付。
 *
 * @author Kotion
 */
@Api(tags = "订阅管理（平台）")
@RestController
@RequestMapping("/subscription/admin")
@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
@AllArgsConstructor
public class AdminSubscriptionController {

	private final IUserSubscriptionService userSubscriptionService;
	private final ISubscriptionPlanService planService;
	private final ISubscriptionRedeemService subscriptionRedeemService;
	private final ObjectProvider<StringRedisTemplate> redisProvider;

	@ApiOperation("用户订阅列表")
	@GetMapping("/users")
	public R<IPage<AdminUserSubscriptionVO>> users(@RequestParam(value = "current", defaultValue = "1") long current,
			@RequestParam(value = "size", defaultValue = "20") long size,
			@RequestParam(value = "keyword", required = false) String keyword,
			@RequestParam(value = "planCode", required = false) String planCode) {
		return R.data(userSubscriptionService.adminList(current, size, keyword, planCode));
	}

	@ApiOperation("授予/调整方案")
	@PostMapping("/grant")
	public R<Void> grant(@RequestBody SubscriptionGrantDTO dto) {
		try {
			userSubscriptionService.grant(dto, SecurityContextUtil.getUserId());
			return R.success("已更新订阅");
		} catch (IllegalArgumentException e) {
			return R.fail(e.getMessage());
		}
	}

	@ApiOperation("撤销订阅（降回免费版）")
	@PostMapping("/revoke")
	public R<Void> revoke(@RequestBody SubscriptionRevokeDTO dto) {
		try {
			userSubscriptionService.revoke(dto.getUserId(), dto.getRemark(), SecurityContextUtil.getUserId());
			return R.success("已撤销");
		} catch (IllegalArgumentException e) {
			return R.fail(e.getMessage());
		}
	}

	@ApiOperation("授予日志")
	@GetMapping("/grants")
	public R<List<SubscriptionGrantVO>> grants(@RequestParam(value = "userId", required = false) Long userId,
			@RequestParam(value = "limit", defaultValue = "50") int limit) {
		return R.data(userSubscriptionService.listGrants(userId, limit));
	}

	@ApiOperation("方案目录")
	@GetMapping("/catalog")
	public R<SubscriptionCatalogVO> catalog() {
		return R.data(planService.getCatalog());
	}

	@ApiOperation("方案详情（含权益）")
	@GetMapping("/plan/{planCode}")
	public R<SubscriptionPlanVO> planDetail(@PathVariable("planCode") String planCode) {
		SubscriptionPlanVO detail = planService.getPlanDetail(planCode);
		return detail == null ? R.fail("方案不存在：" + planCode) : R.data(detail);
	}

	@ApiOperation("保存方案权益")
	@PostMapping("/plan/{planCode}/entitlements")
	public R<Void> savePlanEntitlements(@PathVariable("planCode") String planCode,
			@RequestBody SubscriptionPlanEntitlementsDTO dto) {
		try {
			planService.saveEntitlements(planCode, dto.getFeatures(), dto.getQuotas());
			bumpGlobalVersion();
			return R.success("已保存方案权益");
		} catch (IllegalArgumentException e) {
			return R.fail(e.getMessage());
		}
	}

	@ApiOperation("兑换码列表")
	@GetMapping("/redeem/list")
	public R<List<SubscriptionRedeemCode>> redeemList() {
		return R.data(subscriptionRedeemService.list());
	}

	@ApiOperation("创建兑换码")
	@PostMapping("/redeem/create")
	public R<SubscriptionRedeemCode> createRedeem(@RequestBody SubscriptionRedeemCode input) {
		try {
			return R.data(subscriptionRedeemService.create(input, SecurityContextUtil.getUserId()));
		} catch (IllegalArgumentException e) {
			return R.fail(e.getMessage());
		}
	}

	/** 递增全局版本号，让所有实例的权益缓存失效。 */
	private void bumpGlobalVersion() {
		StringRedisTemplate redis = redisProvider == null ? null : redisProvider.getIfAvailable();
		if (redis == null) {
			return;
		}
		try {
			redis.opsForValue().increment(EntitlementCacheKeys.GLOBAL_VERSION);
		} catch (Exception ignored) {
			// best-effort invalidation; TTL still bounds staleness
		}
	}
}
