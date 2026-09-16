package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingGoal;
import com.knowledge.system.mapper.LandingGoalMapper;
import com.knowledge.system.mapper.LandingOpsMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 转化目标（P0-6）。
 *
 * <p>目标把「事件或路径」变成有名有姓的转化口径，看板据此展示转化数与转化率，
 * 也让「环比」有了统一的比较基准。</p>
 */
@Service
@AllArgsConstructor
public class LandingGoalService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";
	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

	private final LandingGoalMapper goalMapper;
	private final LandingOpsMapper opsMapper;

	public List<LandingGoal> list() {
		return goalMapper.selectList(Wrappers.<LandingGoal>lambdaQuery()
			.orderByAsc(LandingGoal::getPosition)
			.orderByAsc(LandingGoal::getId));
	}

	public LandingGoal create(LandingGoal payload) {
		LandingGoal row = new LandingGoal();
		row.setSiteId(DEFAULT_SITE_ID);
		apply(row, payload, true);
		long count = goalMapper.selectCount(Wrappers.<LandingGoal>lambdaQuery()
			.eq(LandingGoal::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingGoal::getGoalKey, row.getGoalKey()));
		if (count > 0) {
			throw new ServiceException("目标标识已存在：" + row.getGoalKey());
		}
		java.time.LocalDateTime now = java.time.LocalDateTime.now();
		row.setCreateTime(now);
		row.setUpdateTime(now);
		goalMapper.insert(row);
		return row;
	}

	public LandingGoal update(Long id, LandingGoal payload) {
		LandingGoal row = goalMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("转化目标不存在");
		}
		apply(row, payload, false);
		row.setUpdateTime(java.time.LocalDateTime.now());
		goalMapper.updateById(row);
		return row;
	}

	public void delete(Long id) {
		goalMapper.deleteById(id);
	}

	/**
	 * 目标效果：当前区间 vs 上一区间，含转化率与环比。
	 */
	public List<Map<String, Object>> stats(int days) {
		int window = Math.max(days, 1);
		LocalDate today = LocalDate.now();
		String currentStart = today.minusDays(window - 1L).format(DAY);
		String currentEnd = today.format(DAY);
		String previousStart = today.minusDays(window * 2L - 1L).format(DAY);
		String previousEnd = today.minusDays(window).format(DAY);

		Map<String, Object> totalRow = opsMapper.selectTotalVisitors(DEFAULT_SITE_ID, currentStart, currentEnd);
		long totalVisitors = toLong(totalRow == null ? null : totalRow.get("visitors"));

		List<Map<String, Object>> result = new ArrayList<>();
		for (LandingGoal goal : list()) {
			Map<String, Object> current = countGoal(goal, currentStart, currentEnd);
			Map<String, Object> previous = countGoal(goal, previousStart, previousEnd);
			long conversions = toLong(current.get("conversions"));
			long visitors = toLong(current.get("visitors"));
			long sessions = toLong(current.get("sessions"));
			long previousConversions = toLong(previous.get("conversions"));

			Map<String, Object> item = new LinkedHashMap<>();
			item.put("goalKey", goal.getGoalKey());
			item.put("name", goal.getName());
			item.put("conversions", conversions);
			item.put("visitors", visitors);
			item.put("sessions", sessions);
			item.put("totalVisitors", totalVisitors);
			item.put("conversionRate", rate(visitors, totalVisitors));
			item.put("previousConversions", previousConversions);
			item.put("changePct", changePct(conversions, previousConversions));
			result.add(item);
		}
		return result;
	}

	private Map<String, Object> countGoal(LandingGoal goal, String startDay, String endDay) {
		if ("PATH".equalsIgnoreCase(goal.getStepType())) {
			return opsMapper.selectPathConversions(DEFAULT_SITE_ID, goal.getStepValue(), startDay, endDay);
		}
		return opsMapper.selectEventConversions(DEFAULT_SITE_ID, goal.getStepValue(), startDay, endDay);
	}

	private void apply(LandingGoal row, LandingGoal payload, boolean creating) {
		if (creating || StrUtil.isNotBlank(payload.getGoalKey())) {
			String key = StrUtil.trimToEmpty(payload.getGoalKey());
			if (key.isEmpty()) {
				throw new ServiceException("目标标识不能为空");
			}
			row.setGoalKey(StrUtil.sub(key.replaceAll("[^a-zA-Z0-9_.-]", "-"), 0, 64));
		}
		if (StrUtil.isNotBlank(payload.getName())) {
			row.setName(StrUtil.sub(payload.getName(), 0, 128));
		}
		row.setStepType("PATH".equalsIgnoreCase(payload.getStepType()) ? "PATH" : "EVENT");
		if (StrUtil.isNotBlank(payload.getStepValue())) {
			row.setStepValue(StrUtil.sub(payload.getStepValue().trim(), 0, 255));
		}
		if (payload.getDescription() != null) {
			row.setDescription(StrUtil.sub(payload.getDescription(), 0, 255));
		}
		row.setEnabled(payload.getEnabled() == null ? Boolean.TRUE : payload.getEnabled());
		row.setPosition(payload.getPosition() == null ? 0 : payload.getPosition());
		if (StrUtil.isBlank(row.getName()) || StrUtil.isBlank(row.getStepValue())) {
			throw new ServiceException("目标名称与匹配值不能为空");
		}
	}

	private static long toLong(Object value) {
		if (value == null) {
			return 0L;
		}
		if (value instanceof Number) {
			return ((Number) value).longValue();
		}
		try {
			return Long.parseLong(String.valueOf(value));
		} catch (NumberFormatException e) {
			return 0L;
		}
	}

	private static double rate(long numerator, long denominator) {
		if (denominator <= 0) {
			return 0d;
		}
		return BigDecimal.valueOf(numerator * 100d / denominator).setScale(4, RoundingMode.HALF_UP).doubleValue();
	}

	private static double changePct(long current, long previous) {
		if (previous <= 0) {
			return current > 0 ? 100d : 0d;
		}
		return BigDecimal.valueOf((current - previous) * 100d / previous).setScale(2, RoundingMode.HALF_UP).doubleValue();
	}
}
