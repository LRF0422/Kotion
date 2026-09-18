package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.system.domain.SubscriptionGrantLog;
import com.knowledge.system.domain.SubscriptionPlan;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.UserSubscription;
import com.knowledge.system.domain.dto.SubscriptionGrantDTO;
import com.knowledge.system.domain.enums.PlanCode;
import com.knowledge.system.domain.enums.SubscriptionSource;
import com.knowledge.system.domain.enums.SubscriptionStatus;
import com.knowledge.system.domain.vo.AdminUserSubscriptionVO;
import com.knowledge.system.domain.vo.SubscriptionGrantVO;
import com.knowledge.system.domain.vo.UserSubscriptionVO;
import com.knowledge.system.mapper.SubscriptionGrantLogMapper;
import com.knowledge.system.mapper.UserMapper;
import com.knowledge.system.mapper.UserSubscriptionMapper;
import com.knowledge.system.service.IEntitlementService;
import com.knowledge.system.service.ISubscriptionPlanService;
import com.knowledge.system.service.IUserSubscriptionService;
import com.knowledge.core.entitlement.EntitlementGate;
import lombok.AllArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 用户订阅状态服务实现。
 *
 * @author Kotion
 */
@Service
@AllArgsConstructor
public class UserSubscriptionServiceImpl extends ServiceImpl<UserSubscriptionMapper, UserSubscription>
	implements IUserSubscriptionService {

	private final ISubscriptionPlanService planService;
	private final SubscriptionGrantLogMapper grantLogMapper;
	private final UserMapper userMapper;
	private final IEntitlementService entitlementService;
	private final ObjectProvider<EntitlementGate> entitlementGateProvider;

	@Override
	public UserSubscriptionVO getEffective(Long userId) {
		UserSubscription subscription = findRow(userId);
		PlanCode code = effectiveCode(subscription);
		SubscriptionPlan plan = planService.getByCode(code.getCode());
		boolean expired = subscription != null && subscription.getEndTime() != null
			&& subscription.getEndTime().isBefore(LocalDateTime.now());

		UserSubscriptionVO vo = new UserSubscriptionVO();
		vo.setUserId(userId);
		vo.setPlanCode(code.getCode());
		vo.setPlanName(plan != null ? plan.getPlanName() : code.getLabel());
		vo.setTier(code.getTier());
		vo.setStatus(expired ? SubscriptionStatus.EXPIRED.getCode() : SubscriptionStatus.ACTIVE.getCode());
		vo.setStartTime(subscription != null ? subscription.getStartTime() : null);
		vo.setEndTime(subscription != null ? subscription.getEndTime() : null);
		vo.setPermanent(subscription == null || subscription.getEndTime() == null);
		if (subscription != null && subscription.getEndTime() != null && !expired) {
			long days = Duration.between(LocalDateTime.now(), subscription.getEndTime()).toDays();
			vo.setRemainingDays((int) Math.max(0, days));
		}
		vo.setSource(subscription != null ? subscription.getSource() : SubscriptionSource.SYSTEM.getCode());
		return vo;
	}

	@Override
	@Transactional(rollbackFor = Exception.class)
	public void grant(SubscriptionGrantDTO dto, Long operatorId) {
		if (dto == null || dto.getUserId() == null) {
			throw new IllegalArgumentException("userId 不能为空");
		}
		SubscriptionPlan plan = planService.getByCode(dto.getPlanCode());
		if (plan == null) {
			throw new IllegalArgumentException("方案不存在：" + dto.getPlanCode());
		}
		PlanCode code = PlanCode.fromCode(plan.getPlanCode());
		LocalDateTime now = LocalDateTime.now();
		LocalDateTime end = dto.getDays() != null && dto.getDays() > 0 ? now.plusDays(dto.getDays()) : null;

		UserSubscription subscription = findRow(dto.getUserId());
		PlanCode from = effectiveCode(subscription);
		if (subscription == null) {
			subscription = new UserSubscription();
			subscription.setUserId(dto.getUserId());
		}
		subscription.setPlanCode(code.getCode());
		subscription.setStatus(SubscriptionStatus.ACTIVE.getCode());
		subscription.setStartTime(now);
		subscription.setEndTime(end);
		subscription.setSource(SubscriptionSource.ADMIN.getCode());
		subscription.setOperatorId(operatorId);
		subscription.setRemark(dto.getRemark());
		saveOrUpdate(subscription);

		writeLog(dto.getUserId(), from, code, SubscriptionSource.ADMIN, operatorId, now, end, dto.getRemark());
		entitlementService.evict(dto.getUserId());
		evictGate(dto.getUserId());
	}

	@Override
	@Transactional(rollbackFor = Exception.class)
	public void revoke(Long userId, String remark, Long operatorId) {
		if (userId == null) {
			throw new IllegalArgumentException("userId 不能为空");
		}
		UserSubscription subscription = findRow(userId);
		if (subscription == null) {
			return;
		}
		PlanCode from = effectiveCode(subscription);
		LocalDateTime now = LocalDateTime.now();
		subscription.setPlanCode(PlanCode.FREE.getCode());
		subscription.setStatus(SubscriptionStatus.ACTIVE.getCode());
		subscription.setStartTime(now);
		subscription.setEndTime(null);
		subscription.setSource(SubscriptionSource.ADMIN.getCode());
		subscription.setOperatorId(operatorId);
		subscription.setRemark(remark);
		saveOrUpdate(subscription);

		writeLog(userId, from, PlanCode.FREE, SubscriptionSource.ADMIN, operatorId, now, null, remark);
		entitlementService.evict(userId);
		evictGate(userId);
	}

	@Override
	public IPage<AdminUserSubscriptionVO> adminList(long current, long size, String keyword, String planCode) {
		Page<AdminUserSubscriptionVO> page = new Page<>(current, size);
		IPage<AdminUserSubscriptionVO> result = baseMapper.selectAdminUserSubscriptions(page, keyword, planCode);
		Map<String, SubscriptionPlan> byCode = new HashMap<>();
		for (SubscriptionPlan plan : planService.list()) {
			byCode.put(plan.getPlanCode(), plan);
		}
		for (AdminUserSubscriptionVO row : result.getRecords()) {
			SubscriptionPlan plan = byCode.get(row.getPlanCode());
			PlanCode code = PlanCode.fromCode(row.getPlanCode());
			row.setPlanName(plan != null ? plan.getPlanName() : code.getLabel());
			row.setTier(plan != null ? plan.getTier() : code.getTier());
		}
		return result;
	}

	@Override
	public List<SubscriptionGrantVO> listGrants(Long userId, int limit) {
		int safeLimit = Math.max(1, Math.min(limit, 200));
		List<SubscriptionGrantLog> logs = grantLogMapper.selectList(new LambdaQueryWrapper<SubscriptionGrantLog>()
			.eq(userId != null, SubscriptionGrantLog::getUserId, userId)
			.orderByDesc(SubscriptionGrantLog::getCreateTime)
			.last("limit " + safeLimit));
		return enrich(logs);
	}

	private List<SubscriptionGrantVO> enrich(List<SubscriptionGrantLog> logs) {
		List<SubscriptionGrantVO> result = new ArrayList<>();
		if (logs.isEmpty()) {
			return result;
		}
		Set<Long> userIds = logs.stream()
			.map(SubscriptionGrantLog::getUserId)
			.filter(Objects::nonNull)
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

	private void writeLog(Long userId, PlanCode from, PlanCode to, SubscriptionSource source, Long operatorId,
			LocalDateTime start, LocalDateTime end, String remark) {
		SubscriptionGrantLog log = new SubscriptionGrantLog();
		log.setUserId(userId);
		log.setFromPlan(from == null ? null : from.getCode());
		log.setToPlan(to == null ? null : to.getCode());
		log.setSource(source.getCode());
		log.setOperatorId(operatorId);
		log.setStartTime(start);
		log.setEndTime(end);
		log.setRemark(remark);
		grantLogMapper.insert(log);
	}

	private void evictGate(Long userId) {
		EntitlementGate gate = entitlementGateProvider.getIfAvailable();
		if (gate != null) {
			gate.evict(userId);
		}
	}

	private UserSubscription findRow(Long userId) {
		if (userId == null) {
			return null;
		}
		return getOne(new LambdaQueryWrapper<UserSubscription>()
			.eq(UserSubscription::getUserId, userId)
			.last("limit 1"));
	}

	private PlanCode effectiveCode(UserSubscription subscription) {
		if (subscription == null || !StringUtils.hasText(subscription.getPlanCode())) {
			return PlanCode.FREE;
		}
		if (subscription.getEndTime() != null && subscription.getEndTime().isBefore(LocalDateTime.now())) {
			return PlanCode.FREE;
		}
		return PlanCode.fromCode(subscription.getPlanCode());
	}
}
