package com.knowledge.system.controller;

import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.entitlement.annotation.RequireEntitlement;
import com.knowledge.core.entitlement.constant.EntitlementCodes;
import com.knowledge.system.domain.vo.PlanEntitlementsVO;
import com.knowledge.system.domain.vo.SubscriptionCatalogVO;
import com.knowledge.system.domain.vo.UserSubscriptionVO;
import com.knowledge.system.domain.dto.SubscriptionRedeemDTO;
import com.knowledge.system.service.IEntitlementService;
import com.knowledge.system.service.ISubscriptionPlanService;
import com.knowledge.system.service.ISubscriptionRedeemService;
import com.knowledge.system.service.IUserSubscriptionService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.AllArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * C 端订阅方案接口。本期不做支付，仅暴露方案、当前订阅与权益。
 *
 * @author Kotion
 */
@Api(tags = "订阅方案")
@RestController
@RequestMapping("/subscription")
@AllArgsConstructor
public class SubscriptionController {

	private final ISubscriptionPlanService planService;
	private final IUserSubscriptionService userSubscriptionService;
	private final IEntitlementService entitlementService;
	private final ISubscriptionRedeemService subscriptionRedeemService;

	@org.springframework.beans.factory.annotation.Value("${knowledge.subscription.trial-days:7}")
	private int trialDays;

	@ApiOperation("方案目录（含权益定义与三档取值）")
	@GetMapping("/catalog")
	public R<SubscriptionCatalogVO> catalog() {
		return R.data(planService.getCatalog());
	}

	@ApiOperation("当前用户订阅信息")
	@GetMapping("/me")
	public R<UserSubscriptionVO> me() {
		return R.data(userSubscriptionService.getEffective(SecurityContextUtil.getUserId()));
	}

	@ApiOperation("当前用户生效权益")
	@GetMapping("/me/entitlements")
	public R<PlanEntitlementsVO> entitlements() {
		return R.data(entitlementService.resolve(SecurityContextUtil.getUserId()));
	}

	@ApiOperation("校验单个权益")
	@GetMapping("/me/check")
	public R<Boolean> check(@RequestParam("code") String code) {
		return R.data(entitlementService.hasFeature(SecurityContextUtil.getUserId(), code));
	}

	@ApiOperation("高级模型示例接口（权益门禁演示）")
	@GetMapping("/features/advanced-ai")
	@RequireEntitlement(value = EntitlementCodes.AI_ADVANCED_MODELS, message = "高级模型需要专业版及以上")
	public R<String> advancedAi() {
		return R.data("ok");
	}

	@ApiOperation("使用兑换码")
	@PostMapping("/redeem")
	public R<UserSubscriptionVO> redeem(@RequestBody SubscriptionRedeemDTO dto) {
		try {
			return R.data(subscriptionRedeemService.redeem(SecurityContextUtil.getUserId(), dto.getCode()));
		} catch (IllegalArgumentException e) {
			return R.fail(e.getMessage());
		}
	}

	@ApiOperation("开通试用")
	@PostMapping("/trial")
	public R<Boolean> trial() {
		try {
			return R.data(userSubscriptionService.startTrial(SecurityContextUtil.getUserId(), trialDays));
		} catch (IllegalArgumentException e) {
			return R.fail(e.getMessage());
		}
	}
}
