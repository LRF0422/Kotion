package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingAlertEvent;
import com.knowledge.system.domain.LandingAlertRule;
import com.knowledge.system.domain.vo.LandingOverviewVO;
import com.knowledge.system.mapper.LandingAlertEventMapper;
import com.knowledge.system.mapper.LandingAlertRuleMapper;
import com.knowledge.system.mapper.LandingOpsMapper;
import com.knowledge.system.mapper.LandingStatsMapper;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 指标告警（P2-4）。
 *
 * <p>规则由人工维护，巡检由调用方触发（后台「立即巡检」按钮），不做定时任务，
 * 这样避免了多实例重复告警，也便于验证阈值。命中后写
 * {@code landing_alert_event}，并按 {@code channels} 推送。</p>
 */
@Slf4j
@Service
@AllArgsConstructor
public class LandingAlertService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";
	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
	private static final String METRIC_CONVERSIONS = "CONVERSIONS";
	private static final String METRIC_VISITORS = "VISITORS";
	private static final String METRIC_PAGEVIEWS = "PAGEVIEWS";
	private static final String METRIC_COLLECT_SILENCE = "COLLECT_SILENCE";
	private static final String METRIC_LINK_CLICKS = "LINK_CLICKS";
	private static final String METRIC_GOAL_RATE = "GOAL_RATE";
	private static final String COMPARATOR_DROP_PCT = "DROP_PCT";

	private static final RestTemplate REST_TEMPLATE = new RestTemplate();

	private final LandingAlertRuleMapper ruleMapper;
	private final LandingAlertEventMapper eventMapper;
	private final LandingOpsMapper opsMapper;
	private final LandingStatsMapper statsMapper;
	private final LandingGoalService goalService;

	public List<LandingAlertRule> list() {
		return ruleMapper.selectList(Wrappers.<LandingAlertRule>lambdaQuery()
			.eq(LandingAlertRule::getSiteId, DEFAULT_SITE_ID)
			.orderByDesc(LandingAlertRule::getId));
	}

	public Map<String, Object> create(Map<String, Object> body) {
		LandingAlertRule row = new LandingAlertRule();
		row.setSiteId(DEFAULT_SITE_ID);
		apply(row, body, true);
		LocalDateTime now = LocalDateTime.now();
		row.setCreateTime(now);
		row.setUpdateTime(now);
		ruleMapper.insert(row);
		return toMap(row);
	}

	public Map<String, Object> update(Long id, Map<String, Object> body) {
		LandingAlertRule row = ruleMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("告警规则不存在");
		}
		apply(row, body, false);
		row.setUpdateTime(LocalDateTime.now());
		ruleMapper.updateById(row);
		return toMap(row);
	}

	public void delete(Long id) {
		ruleMapper.deleteById(id);
	}

	public IPage<LandingAlertEvent> events(long current, long size) {
		return eventMapper.selectPage(new Page<>(current, size), Wrappers.<LandingAlertEvent>lambdaQuery()
			.eq(LandingAlertEvent::getSiteId, DEFAULT_SITE_ID)
			.orderByDesc(LandingAlertEvent::getId));
	}

	/**
	 * 巡检所有启用中的规则，返回 {@code { evaluated, triggered }}。
	 */
	public Map<String, Object> check() {
		List<LandingAlertRule> rules = ruleMapper.selectList(Wrappers.<LandingAlertRule>lambdaQuery()
			.eq(LandingAlertRule::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingAlertRule::getEnabled, true));
		int evaluated = 0;
		int triggered = 0;
		for (LandingAlertRule rule : rules) {
			evaluated++;
			try {
				if (evaluate(rule)) {
					triggered++;
				}
			} catch (Exception e) {
				log.warn("告警规则评估失败: id={}, name={}", rule.getId(), rule.getName(), e);
			}
		}
		Map<String, Object> result = new LinkedHashMap<>(2);
		result.put("evaluated", evaluated);
		result.put("triggered", triggered);
		return result;
	}

	// ---------- 内部：评估 ----------

	private boolean evaluate(LandingAlertRule rule) {
		int lookback = rule.getLookbackDays() == null || rule.getLookbackDays() <= 0 ? 1 : rule.getLookbackDays();
		LocalDate today = LocalDate.now();
		String currentStart = today.minusDays(lookback - 1L).format(DAY);
		String currentEnd = today.format(DAY);
		String metric = normalizeMetric(rule.getMetric());
		String comparator = normalizeComparator(rule.getComparator());
		BigDecimal threshold = rule.getThreshold() == null ? BigDecimal.ZERO : rule.getThreshold();

		BigDecimal metricValue;
		boolean shouldTrigger;
		if (METRIC_COLLECT_SILENCE.equals(metric)) {
			// 采集静默单独处理：从未有过数据时视为触发。
			Integer minutes = opsMapper.selectMinutesSinceLastEvent(DEFAULT_SITE_ID);
			if (minutes == null) {
				metricValue = threshold.add(BigDecimal.ONE);
				shouldTrigger = true;
			} else {
				metricValue = BigDecimal.valueOf(minutes);
				shouldTrigger = metricValue.compareTo(threshold) > 0;
			}
		} else if (COMPARATOR_DROP_PCT.equals(comparator)) {
			metricValue = dropPct(rule, metric, currentStart, currentEnd);
			shouldTrigger = metricValue.compareTo(threshold) > 0;
		} else {
			metricValue = metricValue(rule, metric, currentStart, currentEnd);
			shouldTrigger = compare(metricValue, comparator, threshold);
		}
		if (!shouldTrigger) {
			return false;
		}
		trigger(rule, metric, metricValue, threshold);
		return true;
	}

	/** 当前窗口的指标值。 */
	private BigDecimal metricValue(LandingAlertRule rule, String metric, String startDay, String endDay) {
		if (METRIC_LINK_CLICKS.equals(metric)) {
			return BigDecimal.valueOf(opsMapper.countLinkClicks(startDay));
		}
		if (METRIC_GOAL_RATE.equals(metric)) {
			Map<String, Object> stat = goalStat(rule);
			return stat == null ? BigDecimal.ZERO : decimal(stat.get("conversionRate"));
		}
		LandingOverviewVO totals = statsMapper.selectTotals(DEFAULT_SITE_ID, startDay);
		if (totals == null) {
			return BigDecimal.ZERO;
		}
		if (METRIC_PAGEVIEWS.equals(metric)) {
			return BigDecimal.valueOf(longValue(totals.getPageviews()));
		}
		if (METRIC_VISITORS.equals(metric)) {
			return BigDecimal.valueOf(longValue(totals.getVisitors()));
		}
		// CONVERSIONS：pageview 之外的事件数
		return BigDecimal.valueOf(longValue(totals.getEvents()));
	}

	/**
	 * 与上一个等长窗口相比的下降百分比。
	 *
	 * <p>{@code selectTotals} 只有下界，因此对「计数类」指标用
	 * {@code 上一窗口起点累计 - 当前窗口起点累计} 得到上一窗口的精确值；
	 * 访客数是去重值不能相减，改用带上下界的 {@code selectTotalVisitors}。</p>
	 */
	private BigDecimal dropPct(LandingAlertRule rule, String metric, String currentStart, String currentEnd) {
		int lookback = rule.getLookbackDays() == null || rule.getLookbackDays() <= 0 ? 1 : rule.getLookbackDays();
		LocalDate today = LocalDate.now();
		String previousStart = today.minusDays(lookback * 2L - 1L).format(DAY);
		String previousEnd = today.minusDays(lookback).format(DAY);

		if (METRIC_GOAL_RATE.equals(metric)) {
			Map<String, Object> stat = goalStat(rule);
			if (stat == null) {
				return BigDecimal.ZERO;
			}
			double changePct = doubleValue(stat.get("changePct"));
			return changePct >= 0d ? BigDecimal.ZERO : round2(BigDecimal.valueOf(-changePct));
		}

		BigDecimal current = metricValue(rule, metric, currentStart, currentEnd);
		BigDecimal previous;
		if (METRIC_VISITORS.equals(metric)) {
			Map<String, Object> row = opsMapper.selectTotalVisitors(DEFAULT_SITE_ID, previousStart, previousEnd);
			previous = BigDecimal.valueOf(row == null ? 0L : longValue(row.get("visitors")));
		} else if (METRIC_LINK_CLICKS.equals(metric)) {
			long previousAll = opsMapper.countLinkClicks(previousStart);
			long currentAll = opsMapper.countLinkClicks(currentStart);
			previous = BigDecimal.valueOf(Math.max(0L, previousAll - currentAll));
		} else {
			LandingOverviewVO previousAll = statsMapper.selectTotals(DEFAULT_SITE_ID, previousStart);
			LandingOverviewVO currentAll = statsMapper.selectTotals(DEFAULT_SITE_ID, currentStart);
			long previousField = overviewField(previousAll, metric);
			long currentField = overviewField(currentAll, metric);
			previous = BigDecimal.valueOf(Math.max(0L, previousField - currentField));
		}
		if (previous.compareTo(BigDecimal.ZERO) <= 0) {
			return BigDecimal.ZERO;
		}
		// 全部用 BigDecimal 运算，避免 double 与 BigDecimal 互转带来的精度与类型问题
		BigDecimal drop = previous.subtract(current)
			.multiply(BigDecimal.valueOf(100L))
			.divide(previous, 4, RoundingMode.HALF_UP);
		return round2(drop);
	}

	private long overviewField(LandingOverviewVO overview, String metric) {
		if (overview == null) {
			return 0L;
		}
		if (METRIC_PAGEVIEWS.equals(metric)) {
			return longValue(overview.getPageviews());
		}
		if (METRIC_VISITORS.equals(metric)) {
			return longValue(overview.getVisitors());
		}
		return longValue(overview.getEvents());
	}

	/** GOAL_RATE：复用目标统计，取同名目标的那一行。 */
	private Map<String, Object> goalStat(LandingAlertRule rule) {
		String goalKey = StrUtil.trimToEmpty(rule.getGoalKey());
		if (goalKey.isEmpty()) {
			return null;
		}
		int days = rule.getLookbackDays() == null || rule.getLookbackDays() <= 0 ? 1 : rule.getLookbackDays();
		for (Map<String, Object> item : goalService.stats(days)) {
			if (item != null && goalKey.equals(String.valueOf(item.get("goalKey")))) {
				return item;
			}
		}
		return null;
	}

	private boolean compare(BigDecimal value, String comparator, BigDecimal threshold) {
		int result = value.compareTo(threshold);
		if ("LT".equals(comparator)) {
			return result < 0;
		}
		if ("LTE".equals(comparator)) {
			return result <= 0;
		}
		if ("GT".equals(comparator)) {
			return result > 0;
		}
		if ("GTE".equals(comparator)) {
			return result >= 0;
		}
		return result < 0;
	}

	private void trigger(LandingAlertRule rule, String metric, BigDecimal metricValue, BigDecimal threshold) {
		boolean critical = COMPARATOR_DROP_PCT.equals(normalizeComparator(rule.getComparator()))
			|| METRIC_COLLECT_SILENCE.equals(metric);
		LocalDateTime now = LocalDateTime.now();

		LandingAlertEvent event = new LandingAlertEvent();
		event.setRuleId(rule.getId());
		event.setSiteId(DEFAULT_SITE_ID);
		event.setRuleName(rule.getName());
		event.setMetric(metric);
		event.setMetricValue(round4(metricValue));
		event.setThreshold(threshold);
		event.setLevel(critical ? "CRITICAL" : "WARN");
		event.setMessage(message(rule, metric, metricValue, threshold));
		event.setNotified(false);
		event.setCreateTime(now);
		event.setUpdateTime(now);
		eventMapper.insert(event);

		rule.setLastTriggeredAt(now);
		rule.setUpdateTime(now);
		ruleMapper.updateById(rule);

		dispatch(rule, event);
	}

	private String message(LandingAlertRule rule, String metric, BigDecimal metricValue, BigDecimal threshold) {
		String label = metricLabel(metric);
		if (COMPARATOR_DROP_PCT.equals(normalizeComparator(rule.getComparator()))) {
			return label + "较上一周期下降 " + round2(metricValue) + "%，超过阈值 " + threshold + "%";
		}
		return label + "为 " + round2(metricValue) + "，触发阈值 " + threshold;
	}

	/**
	 * 通知渠道：{@code log} 只记日志；含 {@code email}/{@code webhook} 时额外记一条 warn，
	 * 并在配置了 webhookUrl 时 POST 一份 JSON。推送失败只记日志，不影响巡检结果。
	 */
	private void dispatch(LandingAlertRule rule, LandingAlertEvent event) {
		String channels = StrUtil.trimToEmpty(rule.getChannels()).toLowerCase();
		boolean wantsEmail = channels.contains("email");
		boolean wantsWebhook = channels.contains("webhook");
		if (wantsEmail || wantsWebhook) {
			log.warn("[landing-alert] {} {} channels={} message={}", event.getLevel(), rule.getName(), channels,
				event.getMessage());
		} else {
			log.info("[landing-alert] {} {} message={}", event.getLevel(), rule.getName(), event.getMessage());
		}
		if (!wantsWebhook || StrUtil.isBlank(rule.getWebhookUrl())) {
			return;
		}
		try {
			Map<String, Object> payload = new LinkedHashMap<>(7);
			payload.put("ruleId", rule.getId());
			payload.put("ruleName", rule.getName());
			payload.put("metric", event.getMetric());
			payload.put("metricValue", event.getMetricValue());
			payload.put("threshold", event.getThreshold());
			payload.put("level", event.getLevel());
			payload.put("message", event.getMessage());
			HttpHeaders headers = new HttpHeaders();
			headers.setContentType(MediaType.APPLICATION_JSON);
			HttpEntity<String> entity = new HttpEntity<>(JSONUtil.toJsonStr(payload), headers);
			REST_TEMPLATE.postForEntity(rule.getWebhookUrl(), entity, String.class);
		} catch (Exception e) {
			log.warn("告警 webhook 推送失败: rule={}, url={}", rule.getName(), rule.getWebhookUrl(), e);
		}
	}

	// ---------- 内部：序列化 ----------

	private Map<String, Object> toMap(LandingAlertRule row) {
		Map<String, Object> item = new LinkedHashMap<>(16);
		item.put("id", row.getId());
		item.put("name", row.getName());
		item.put("metric", row.getMetric());
		item.put("goalKey", row.getGoalKey());
		item.put("comparator", row.getComparator());
		item.put("threshold", row.getThreshold());
		item.put("windowMinutes", row.getWindowMinutes());
		item.put("lookbackDays", row.getLookbackDays());
		item.put("channels", row.getChannels());
		item.put("webhookUrl", row.getWebhookUrl());
		item.put("enabled", row.getEnabled());
		item.put("lastTriggeredAt", row.getLastTriggeredAt());
		return item;
	}

	private void apply(LandingAlertRule row, Map<String, Object> body, boolean creating) {
		Map<String, Object> safe = body == null ? new LinkedHashMap<String, Object>() : body;
		if (safe.get("name") != null) {
			row.setName(StrUtil.sub(stringValue(safe.get("name")), 0, 128));
		}
		if (creating || safe.get("metric") != null) {
			row.setMetric(normalizeMetric(stringValue(safe.get("metric"))));
		}
		if (safe.get("goalKey") != null) {
			row.setGoalKey(StrUtil.sub(stringValue(safe.get("goalKey")), 0, 64));
		}
		if (creating || safe.get("comparator") != null) {
			row.setComparator(normalizeComparator(stringValue(safe.get("comparator"))));
		}
		if (safe.get("threshold") != null) {
			row.setThreshold(decimal(safe.get("threshold")));
		} else if (row.getThreshold() == null) {
			row.setThreshold(BigDecimal.ZERO);
		}
		if (safe.get("windowMinutes") != null) {
			row.setWindowMinutes(intValue(safe.get("windowMinutes"), 60));
		} else if (row.getWindowMinutes() == null) {
			row.setWindowMinutes(60);
		}
		if (safe.get("lookbackDays") != null) {
			row.setLookbackDays(Math.max(1, intValue(safe.get("lookbackDays"), 1)));
		} else if (row.getLookbackDays() == null) {
			row.setLookbackDays(1);
		}
		if (safe.get("channels") != null) {
			row.setChannels(StrUtil.sub(StrUtil.blankToDefault(stringValue(safe.get("channels")), "log"), 0, 255));
		} else if (StrUtil.isBlank(row.getChannels())) {
			row.setChannels("log");
		}
		if (safe.get("webhookUrl") != null) {
			row.setWebhookUrl(StrUtil.sub(stringValue(safe.get("webhookUrl")), 0, 512));
		}
		if (safe.get("enabled") != null) {
			row.setEnabled(Boolean.valueOf(stringValue(safe.get("enabled"))));
		} else if (row.getEnabled() == null) {
			row.setEnabled(Boolean.TRUE);
		}
		row.setSiteId(DEFAULT_SITE_ID);
		if (StrUtil.isBlank(row.getName())) {
			throw new ServiceException("规则名称不能为空");
		}
	}

	private static String normalizeMetric(String raw) {
		String value = StrUtil.trimToEmpty(raw).toUpperCase();
		if (METRIC_CONVERSIONS.equals(value) || METRIC_VISITORS.equals(value) || METRIC_PAGEVIEWS.equals(value)
			|| METRIC_COLLECT_SILENCE.equals(value) || METRIC_LINK_CLICKS.equals(value)
			|| METRIC_GOAL_RATE.equals(value)) {
			return value;
		}
		return METRIC_CONVERSIONS;
	}

	private static String normalizeComparator(String raw) {
		String value = StrUtil.trimToEmpty(raw).toUpperCase();
		if ("LT".equals(value) || "LTE".equals(value) || "GT".equals(value) || "GTE".equals(value)
			|| COMPARATOR_DROP_PCT.equals(value)) {
			return value;
		}
		return "LT";
	}

	private static String metricLabel(String metric) {
		if (METRIC_VISITORS.equals(metric)) {
			return "访客数";
		}
		if (METRIC_PAGEVIEWS.equals(metric)) {
			return "浏览量";
		}
		if (METRIC_COLLECT_SILENCE.equals(metric)) {
			return "采集静默分钟数";
		}
		if (METRIC_LINK_CLICKS.equals(metric)) {
			return "短链点击数";
		}
		if (METRIC_GOAL_RATE.equals(metric)) {
			return "目标转化率(%)";
		}
		return "转化数";
	}

	private static BigDecimal decimal(Object value) {
		if (value == null) {
			return BigDecimal.ZERO;
		}
		if (value instanceof BigDecimal) {
			return (BigDecimal) value;
		}
		if (value instanceof Number) {
			return BigDecimal.valueOf(((Number) value).doubleValue());
		}
		try {
			return new BigDecimal(String.valueOf(value).trim());
		} catch (NumberFormatException e) {
			return BigDecimal.ZERO;
		}
	}

	private static BigDecimal round2(BigDecimal value) {
		return value == null ? BigDecimal.ZERO : value.setScale(2, RoundingMode.HALF_UP);
	}

	private static BigDecimal round4(BigDecimal value) {
		return value == null ? BigDecimal.ZERO : value.setScale(4, RoundingMode.HALF_UP);
	}

	private static int intValue(Object value, int fallback) {
		if (value == null) {
			return fallback;
		}
		if (value instanceof Number) {
			return ((Number) value).intValue();
		}
		try {
			return Integer.parseInt(String.valueOf(value).trim());
		} catch (NumberFormatException e) {
			return fallback;
		}
	}

	private static long longValue(Object value) {
		if (value == null) {
			return 0L;
		}
		if (value instanceof Number) {
			return ((Number) value).longValue();
		}
		try {
			return Long.parseLong(String.valueOf(value).trim());
		} catch (NumberFormatException e) {
			return 0L;
		}
	}

	private static double doubleValue(Object value) {
		if (value == null) {
			return 0d;
		}
		if (value instanceof Number) {
			return ((Number) value).doubleValue();
		}
		try {
			return Double.parseDouble(String.valueOf(value).trim());
		} catch (NumberFormatException e) {
			return 0d;
		}
	}

	private static String stringValue(Object value) {
		return value == null ? "" : String.valueOf(value);
	}
}
