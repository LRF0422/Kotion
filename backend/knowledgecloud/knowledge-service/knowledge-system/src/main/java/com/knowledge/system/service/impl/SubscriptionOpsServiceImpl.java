package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.knowledge.system.domain.SubscriptionGrantLog;
import com.knowledge.system.domain.SubscriptionPlan;
import com.knowledge.system.domain.SubscriptionRedeemCode;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.UserSubscription;
import com.knowledge.system.domain.enums.SubscriptionSource;
import com.knowledge.system.domain.enums.SubscriptionStatus;
import com.knowledge.system.domain.vo.AdminUserSubscriptionVO;
import com.knowledge.system.domain.vo.SubscriptionGrantVO;
import com.knowledge.system.domain.vo.SubscriptionOverviewVO;
import com.knowledge.system.mapper.SubscriptionGrantLogMapper;
import com.knowledge.system.mapper.UserMapper;
import com.knowledge.system.mapper.UserSubscriptionMapper;
import com.knowledge.system.service.ISubscriptionOpsService;
import com.knowledge.system.service.ISubscriptionPlanService;
import com.knowledge.system.service.ISubscriptionRedeemService;
import com.knowledge.system.service.IUserSubscriptionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 订阅运营能力实现。
 *
 * @author Kotion
 */
@Service
@RequiredArgsConstructor
public class SubscriptionOpsServiceImpl implements ISubscriptionOpsService {

	private final UserSubscriptionMapper userSubscriptionMapper;
	private final SubscriptionGrantLogMapper grantLogMapper;
	private final UserMapper userMapper;
	private final IUserSubscriptionService userSubscriptionService;
	private final ISubscriptionRedeemService redeemService;
	private final ISubscriptionPlanService planService;

	@Override
	public SubscriptionOverviewVO overview() {
		SubscriptionOverviewVO vo = new SubscriptionOverviewVO();
		Long total = userSubscriptionMapper.selectCount(null);
		vo.setTotalSubscriptions(total == null ? 0L : total);

		for (Map<String, Object> row : userSubscriptionMapper.selectPlanCounts()) {
			String code = Objects.toString(row.get("planCode"), "");
			long count = row.get("total") == null ? 0L : ((Number) row.get("total")).longValue();
			vo.getPlanCounts().put(code, count);
			if (!"FREE".equals(code)) {
				vo.setPaidSubscriptions(vo.getPaidSubscriptions() + count);
			}
		}

		LocalDateTime now = LocalDateTime.now();
		vo.setExpiring7(countExpiring(now, now.plusDays(7)));
		vo.setExpiring30(countExpiring(now, now.plusDays(30)));
		Long expired = userSubscriptionMapper.selectCount(new LambdaQueryWrapper<UserSubscription>()
				.eq(UserSubscription::getStatus, SubscriptionStatus.EXPIRED.getCode()));
		vo.setExpired(expired == null ? 0L : expired);

		long codes = 0L;
		long used = 0L;
		for (SubscriptionRedeemCode code : redeemService.list()) {
			codes++;
			used += code.getUsedCount() == null ? 0L : code.getUsedCount();
		}
		vo.setRedeemCodes(codes);
		vo.setRedeemUsed(used);
		return vo;
	}

	private long countExpiring(LocalDateTime now, LocalDateTime until) {
		Long count = userSubscriptionMapper.selectCount(new LambdaQueryWrapper<UserSubscription>()
				.eq(UserSubscription::getStatus, SubscriptionStatus.ACTIVE.getCode())
				.isNotNull(UserSubscription::getEndTime)
				.gt(UserSubscription::getEndTime, now)
				.le(UserSubscription::getEndTime, until));
		return count == null ? 0L : count;
	}

	@Override
	public List<AdminUserSubscriptionVO> expiring(int days, int limit) {
		int safeDays = Math.max(1, Math.min(days, 365));
		int safeLimit = Math.max(1, Math.min(limit, 500));
		LocalDateTime now = LocalDateTime.now();
		List<UserSubscription> rows = userSubscriptionMapper.selectList(new LambdaQueryWrapper<UserSubscription>()
				.eq(UserSubscription::getStatus, SubscriptionStatus.ACTIVE.getCode())
				.isNotNull(UserSubscription::getEndTime)
				.gt(UserSubscription::getEndTime, now)
				.le(UserSubscription::getEndTime, now.plusDays(safeDays))
				.orderByAsc(UserSubscription::getEndTime)
				.last("limit " + safeLimit));
		return toAdminRows(rows);
	}

	@Override
	@Transactional(rollbackFor = Exception.class)
	public void batchGrant(List<Long> userIds, String planCode, Integer days, Long operatorId, String remark) {
		if (userIds == null || userIds.isEmpty()) {
			throw new IllegalArgumentException("userIds 不能为空");
		}
		if (!StringUtils.hasText(planCode)) {
			throw new IllegalArgumentException("planCode 不能为空");
		}
		for (Long userId : userIds) {
			if (userId != null) {
				userSubscriptionService.grant(userId, planCode, days, SubscriptionSource.ADMIN, operatorId, remark);
			}
		}
	}

	@Override
	@Transactional(rollbackFor = Exception.class)
	public void batchRevoke(List<Long> userIds, String remark, Long operatorId) {
		if (userIds == null || userIds.isEmpty()) {
			throw new IllegalArgumentException("userIds 不能为空");
		}
		for (Long userId : userIds) {
			if (userId != null) {
				userSubscriptionService.revoke(userId, remark, operatorId);
			}
		}
	}

	@Override
	public List<SubscriptionGrantVO> audit(Long operatorId, Long userId, int limit) {
		int safeLimit = Math.max(1, Math.min(limit, 200));
		List<SubscriptionGrantLog> logs = grantLogMapper.selectList(new LambdaQueryWrapper<SubscriptionGrantLog>()
				.eq(operatorId != null, SubscriptionGrantLog::getOperatorId, operatorId)
				.eq(userId != null, SubscriptionGrantLog::getUserId, userId)
				.orderByDesc(SubscriptionGrantLog::getCreateTime)
				.last("limit " + safeLimit));
		return toGrantRows(logs);
	}

	private List<AdminUserSubscriptionVO> toAdminRows(List<UserSubscription> rows) {
		List<AdminUserSubscriptionVO> result = new ArrayList<>();
		if (rows == null || rows.isEmpty()) {
			return result;
		}
		Set<Long> userIds = rows.stream().map(UserSubscription::getUserId).filter(Objects::nonNull)
				.collect(Collectors.toSet());
		Map<Long, User> users = new HashMap<>();
		if (!userIds.isEmpty()) {
			for (User user : userMapper.selectBatchIds(userIds)) {
				users.put(user.getId(), user);
			}
		}
		Map<String, SubscriptionPlan> plans = new HashMap<>();
		for (SubscriptionPlan plan : planService.list()) {
			plans.put(plan.getPlanCode(), plan);
		}
		for (UserSubscription row : rows) {
			AdminUserSubscriptionVO vo = new AdminUserSubscriptionVO();
			vo.setUserId(row.getUserId());
			User user = users.get(row.getUserId());
			if (user != null) {
				vo.setAccount(user.getAccount());
				vo.setUserName(user.getName());
				vo.setAvatar(user.getAvatar());
			}
			vo.setPlanCode(row.getPlanCode());
			SubscriptionPlan plan = plans.get(row.getPlanCode());
			vo.setPlanName(plan != null ? plan.getPlanName() : row.getPlanCode());
			vo.setTier(plan != null ? plan.getTier() : null);
			vo.setStatus(row.getStatus());
			vo.setEndTime(row.getEndTime());
			vo.setSource(row.getSource());
			result.add(vo);
		}
		return result;
	}

	private List<SubscriptionGrantVO> toGrantRows(List<SubscriptionGrantLog> logs) {
		List<SubscriptionGrantVO> result = new ArrayList<>();
		if (logs == null || logs.isEmpty()) {
			return result;
		}
		Set<Long> userIds = logs.stream().map(SubscriptionGrantLog::getUserId).filter(Objects::nonNull)
				.collect(Collectors.toSet());
		Map<Long, User> users = new HashMap<>();
		if (!userIds.isEmpty()) {
			for (User user : userMapper.selectBatchIds(userIds)) {
				users.put(user.getId(), user);
			}
		}
		for (SubscriptionGrantLog log : logs) {
			SubscriptionGrantVO vo = new SubscriptionGrantVO();
			vo.setId(log.getId());
			vo.setUserId(log.getUserId());
			User user = users.get(log.getUserId());
			if (user != null) {
				vo.setAccount(user.getAccount());
				vo.setUserName(user.getName());
			}
			vo.setFromPlan(log.getFromPlan());
			vo.setToPlan(log.getToPlan());
			vo.setSource(log.getSource());
			vo.setOperatorId(log.getOperatorId());
			vo.setStartTime(log.getStartTime());
			vo.setEndTime(log.getEndTime());
			vo.setRemark(log.getRemark());
			vo.setCreateTime(log.getCreateTime());
			result.add(vo);
		}
		return result;
	}
}
