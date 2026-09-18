package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.system.domain.SubscriptionEntitlement;
import com.knowledge.system.domain.SubscriptionPlan;
import com.knowledge.system.domain.SubscriptionPlanEntitlement;
import com.knowledge.system.domain.vo.EntitlementDefinitionVO;
import com.knowledge.system.domain.vo.SubscriptionCatalogVO;
import com.knowledge.system.domain.vo.SubscriptionPlanVO;
import com.knowledge.system.mapper.SubscriptionEntitlementMapper;
import com.knowledge.system.mapper.SubscriptionPlanEntitlementMapper;
import com.knowledge.system.mapper.SubscriptionPlanMapper;
import com.knowledge.system.service.ISubscriptionPlanService;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 订阅方案与权益目录服务实现。
 *
 * @author Kotion
 */
@Service
@AllArgsConstructor
public class SubscriptionPlanServiceImpl extends ServiceImpl<SubscriptionPlanMapper, SubscriptionPlan>
	implements ISubscriptionPlanService {

	private final SubscriptionEntitlementMapper entitlementMapper;
	private final SubscriptionPlanEntitlementMapper planEntitlementMapper;

	@Override
	public SubscriptionCatalogVO getCatalog() {
		List<SubscriptionPlan> plans = list(enabledPlanQuery());
		List<SubscriptionEntitlement> definitions = entitlementMapper.selectList(
			new LambdaQueryWrapper<SubscriptionEntitlement>()
				.eq(SubscriptionEntitlement::getStatus, 1)
				.orderByAsc(SubscriptionEntitlement::getSort));
		Map<String, List<SubscriptionPlanEntitlement>> valuesByPlan = planEntitlementMapper.selectList(null)
			.stream()
			.collect(Collectors.groupingBy(SubscriptionPlanEntitlement::getPlanCode));

		SubscriptionCatalogVO catalog = new SubscriptionCatalogVO();
		catalog.setEntitlements(definitions.stream().map(this::toDefinitionVO).collect(Collectors.toList()));
		List<SubscriptionPlanVO> planVOs = new ArrayList<>();
		for (SubscriptionPlan plan : plans) {
			planVOs.add(toPlanVO(plan, valuesByPlan.getOrDefault(plan.getPlanCode(), new ArrayList<>())));
		}
		catalog.setPlans(planVOs);
		return catalog;
	}

	@Override
	public SubscriptionPlan getByCode(String planCode) {
		if (!StringUtils.hasText(planCode)) {
			return null;
		}
		return getOne(new LambdaQueryWrapper<SubscriptionPlan>()
			.eq(SubscriptionPlan::getPlanCode, planCode)
			.eq(SubscriptionPlan::getStatus, 1)
			.last("limit 1"));
	}

	@Override
	public Map<String, Boolean> getFeatures(String planCode) {
		Map<String, Boolean> features = new LinkedHashMap<>();
		for (SubscriptionPlanEntitlement value : valuesOf(planCode)) {
			if (value.getBoolValue() != null) {
				features.put(value.getEntCode(), value.getBoolValue());
			}
		}
		return features;
	}

	@Override
	public Map<String, Long> getQuotas(String planCode) {
		Map<String, Long> quotas = new LinkedHashMap<>();
		for (SubscriptionPlanEntitlement value : valuesOf(planCode)) {
			if (value.getNumValue() != null) {
				quotas.put(value.getEntCode(), value.getNumValue());
			}
		}
		return quotas;
	}

	@Override
	public SubscriptionPlanVO getPlanDetail(String planCode) {
		SubscriptionPlan plan = getByCode(planCode);
		if (plan == null) {
			return null;
		}
		return toPlanVO(plan, valuesOf(planCode));
	}

	@Override
	@Transactional(rollbackFor = Exception.class)
	public void saveEntitlements(String planCode, Map<String, Boolean> features, Map<String, Long> quotas) {
		if (!StringUtils.hasText(planCode)) {
			throw new IllegalArgumentException("planCode 不能为空");
		}
		if (getByCode(planCode) == null) {
			throw new IllegalArgumentException("方案不存在：" + planCode);
		}
		java.util.Map<String, SubscriptionPlanEntitlement> existing = new java.util.HashMap<>();
		for (SubscriptionPlanEntitlement value : valuesOf(planCode)) {
			existing.put(value.getEntCode(), value);
		}
		if (features != null) {
			for (Map.Entry<String, Boolean> entry : features.entrySet()) {
				upsertEntitlement(existing, planCode, entry.getKey(), entry.getValue(), null);
			}
		}
		if (quotas != null) {
			for (Map.Entry<String, Long> entry : quotas.entrySet()) {
				upsertEntitlement(existing, planCode, entry.getKey(), null, entry.getValue());
			}
		}
	}

	private void upsertEntitlement(java.util.Map<String, SubscriptionPlanEntitlement> existing,
			String planCode, String entCode, Boolean boolValue, Long numValue) {
		if (!StringUtils.hasText(entCode)) {
			return;
		}
		SubscriptionPlanEntitlement row = existing.get(entCode);
		if (row == null) {
			row = new SubscriptionPlanEntitlement();
			row.setPlanCode(planCode);
			row.setEntCode(entCode);
			row.setBoolValue(boolValue);
			row.setNumValue(numValue);
			planEntitlementMapper.insert(row);
			existing.put(entCode, row);
			return;
		}
		if (boolValue != null) {
			row.setBoolValue(boolValue);
		}
		if (numValue != null) {
			row.setNumValue(numValue);
		}
		planEntitlementMapper.updateById(row);
	}

	private List<SubscriptionPlanEntitlement> valuesOf(String planCode) {
		if (!StringUtils.hasText(planCode)) {
			return new ArrayList<>();
		}
		return planEntitlementMapper.selectList(new LambdaQueryWrapper<SubscriptionPlanEntitlement>()
			.eq(SubscriptionPlanEntitlement::getPlanCode, planCode));
	}

	private LambdaQueryWrapper<SubscriptionPlan> enabledPlanQuery() {
		return new LambdaQueryWrapper<SubscriptionPlan>()
			.eq(SubscriptionPlan::getStatus, 1)
			.orderByAsc(SubscriptionPlan::getSort);
	}

	private SubscriptionPlanVO toPlanVO(SubscriptionPlan plan, List<SubscriptionPlanEntitlement> values) {
		SubscriptionPlanVO vo = new SubscriptionPlanVO();
		vo.setPlanCode(plan.getPlanCode());
		vo.setPlanName(plan.getPlanName());
		vo.setDescription(plan.getDescription());
		vo.setTier(plan.getTier());
		vo.setMonthlyPrice(plan.getMonthlyPrice());
		vo.setYearlyPrice(plan.getYearlyPrice());
		vo.setHighlight(plan.getHighlight());
		vo.setSort(plan.getSort());
		for (SubscriptionPlanEntitlement value : values) {
			if (value.getBoolValue() != null) {
				vo.getFeatures().put(value.getEntCode(), value.getBoolValue());
			}
			if (value.getNumValue() != null) {
				vo.getQuotas().put(value.getEntCode(), value.getNumValue());
			}
		}
		return vo;
	}

	private EntitlementDefinitionVO toDefinitionVO(SubscriptionEntitlement definition) {
		EntitlementDefinitionVO vo = new EntitlementDefinitionVO();
		vo.setCode(definition.getEntCode());
		vo.setName(definition.getEntName());
		vo.setCategory(definition.getCategory());
		vo.setValueType(definition.getValueType());
		vo.setUnit(definition.getUnit());
		vo.setDescription(definition.getDescription());
		vo.setSort(definition.getSort());
		return vo;
	}
}
