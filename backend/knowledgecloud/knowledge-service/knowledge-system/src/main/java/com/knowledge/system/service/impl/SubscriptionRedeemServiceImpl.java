package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.knowledge.system.domain.SubscriptionRedeemCode;
import com.knowledge.system.domain.enums.SubscriptionSource;
import com.knowledge.system.domain.vo.UserSubscriptionVO;
import com.knowledge.system.mapper.SubscriptionRedeemCodeMapper;
import com.knowledge.system.service.ISubscriptionRedeemService;
import com.knowledge.system.service.IUserSubscriptionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 兑换码服务实现。
 *
 * @author Kotion
 */
@Service
@RequiredArgsConstructor
public class SubscriptionRedeemServiceImpl implements ISubscriptionRedeemService {

	private final SubscriptionRedeemCodeMapper redeemCodeMapper;
	private final IUserSubscriptionService userSubscriptionService;

	@Override
	@Transactional(rollbackFor = Exception.class)
	public UserSubscriptionVO redeem(Long userId, String code) {
		if (userId == null) {
			throw new IllegalArgumentException("用户未登录");
		}
		if (!StringUtils.hasText(code)) {
			throw new IllegalArgumentException("兑换码不能为空");
		}
		SubscriptionRedeemCode row = redeemCodeMapper.selectOne(new LambdaQueryWrapper<SubscriptionRedeemCode>()
				.eq(SubscriptionRedeemCode::getCode, code.trim())
				.last("limit 1"));
		if (row == null) {
			throw new IllegalArgumentException("兑换码无效");
		}
		if (row.getStatus() == null || row.getStatus() != 1) {
			throw new IllegalArgumentException("兑换码已停用");
		}
		if (row.getExpiresAt() != null && row.getExpiresAt().isBefore(LocalDateTime.now())) {
			throw new IllegalArgumentException("兑换码已过期");
		}
		int maxUses = row.getMaxUses() == null ? 1 : row.getMaxUses();
		int used = row.getUsedCount() == null ? 0 : row.getUsedCount();
		if (used >= maxUses) {
			throw new IllegalArgumentException("兑换码已被使用完");
		}
		if (redeemCodeMapper.consume(row.getId()) != 1) {
			throw new IllegalArgumentException("兑换码已被使用完");
		}
		userSubscriptionService.grant(userId, row.getPlanCode(), row.getDays(),
				SubscriptionSource.REDEEM, null, "兑换码 " + row.getCode());
		return userSubscriptionService.getEffective(userId);
	}

	@Override
	@Transactional(rollbackFor = Exception.class)
	public SubscriptionRedeemCode create(SubscriptionRedeemCode input, Long operatorId) {
		if (input == null || !StringUtils.hasText(input.getCode())) {
			throw new IllegalArgumentException("兑换码不能为空");
		}
		if (!StringUtils.hasText(input.getPlanCode())) {
			throw new IllegalArgumentException("planCode 不能为空");
		}
		String code = input.getCode().trim();
		Long existing = redeemCodeMapper.selectCount(new LambdaQueryWrapper<SubscriptionRedeemCode>()
				.eq(SubscriptionRedeemCode::getCode, code));
		if (existing != null && existing > 0) {
			throw new IllegalArgumentException("兑换码已存在");
		}
		SubscriptionRedeemCode row = new SubscriptionRedeemCode();
		row.setCode(code);
		row.setPlanCode(input.getPlanCode());
		row.setDays(input.getDays());
		row.setMaxUses(input.getMaxUses() == null || input.getMaxUses() <= 0 ? 1 : input.getMaxUses());
		row.setUsedCount(0);
		row.setExpiresAt(input.getExpiresAt());
		row.setStatus(input.getStatus() == null ? 1 : input.getStatus());
		row.setRemark(input.getRemark());
		row.setCreateUser(operatorId);
		redeemCodeMapper.insert(row);
		return row;
	}

	@Override
	public List<SubscriptionRedeemCode> list() {
		return redeemCodeMapper.selectList(new LambdaQueryWrapper<SubscriptionRedeemCode>()
				.orderByDesc(SubscriptionRedeemCode::getCreateTime));
	}
}
