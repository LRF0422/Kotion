package com.knowledge.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.system.domain.dto.SubscriptionGrantDTO;
import com.knowledge.system.domain.dto.SubscriptionRevokeDTO;
import com.knowledge.system.domain.vo.AdminUserSubscriptionVO;
import com.knowledge.system.domain.vo.SubscriptionCatalogVO;
import com.knowledge.system.domain.vo.SubscriptionGrantVO;
import com.knowledge.system.service.ISubscriptionPlanService;
import com.knowledge.system.service.IUserSubscriptionService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.AllArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
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
}
