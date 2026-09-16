package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.vo.LandingOverviewVO;
import com.knowledge.system.mapper.LandingOpsMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 运营报表（P2-5 / P2-8）。
 *
 * <p>工作台把散落在各处的待办聚合成一屏；导出统一走同一套 CSV 规则
 * （UTF-8 BOM + CRLF + 全字段加引号），保证 Excel 直接打开不乱码。</p>
 */
@Service
@AllArgsConstructor
public class LandingOpsReportService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";
	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
	private static final int EXPORT_LIMIT = 5000;

	private static final List<String> EVENTS_HEADERS = Arrays.asList(
		"time", "event", "path", "visitorId", "sessionId", "referrer",
		"utmSource", "utmCampaign", "device", "browser", "os", "props");
	private static final List<String> SESSIONS_HEADERS = Arrays.asList(
		"firstSeen", "lastSeen", "landingPath", "referrer", "utmSource", "utmMedium",
		"utmCampaign", "device", "browser", "os", "language", "visitorId");
	private static final List<String> SUBSCRIBERS_HEADERS = Arrays.asList(
		"email", "status", "sourcePath", "referrer", "utmSource", "utmMedium",
		"utmCampaign", "tags", "createTime");
	private static final List<String> LINKS_HEADERS = Arrays.asList(
		"slug", "target", "channel", "groupName", "clicks", "enabled", "createTime");
	private static final List<String> GOALS_HEADERS = Arrays.asList(
		"goalKey", "name", "stepType", "stepValue", "enabled");
	private static final List<String> AUDIT_HEADERS = Arrays.asList(
		"time", "operator", "action", "targetType", "targetKey", "summary", "clientIp");

	private final LandingOpsMapper opsMapper;
	private final LandingStatsService statsService;
	private final LandingGoalService goalService;
	private final LandingSettingService settingService;
	private final LandingFilterRuleService filterRuleService;

	/**
	 * 运营工作台：待办计数 + 核心转化总量。
	 */
	public Map<String, Object> workbench(int days) {
		int window = days <= 0 ? 7 : days;
		java.time.LocalDateTime now = java.time.LocalDateTime.now();

		Map<String, Object> result = new LinkedHashMap<>(7);
		result.put("pendingDrafts", opsMapper.countPendingDrafts());
		result.put("newSubscribers", opsMapper.countNewSubscribers(now.minusDays(window)));
		result.put("runningExperiments", opsMapper.countRunningExperiments());
		result.put("openAlerts", opsMapper.countRecentAlerts(now.minusHours(24)));
		result.put("expiringPromotions", opsMapper.countExpiringPromotions(now.plusDays(7)));
		result.put("unreviewedChangelog", opsMapper.countRecentChangelog(now.minusDays(7)));

		LandingOverviewVO overview = statsService.overview(DEFAULT_SITE_ID, window);
		long visitors = overview == null || overview.getVisitors() == null ? 0L : overview.getVisitors();
		List<Map<String, Object>> goals = goalService.stats(window);
		long conversions = 0L;
		double changeSum = 0d;
		for (Map<String, Object> goal : goals) {
			if (goal == null) {
				continue;
			}
			conversions += toLong(goal.get("conversions"));
			changeSum += toDouble(goal.get("changePct"));
		}

		Map<String, Object> totals = new LinkedHashMap<>(4);
		totals.put("visitors", visitors);
		totals.put("conversions", conversions);
		totals.put("conversionRate", visitors <= 0 ? 0d : round2(conversions * 100d / visitors));
		totals.put("changePct", goals.isEmpty() ? 0d : round2(changeSum / goals.size()));
		result.put("totals", totals);
		return result;
	}

	/**
	 * 导出 CSV 文本（带 UTF-8 BOM，CRLF 换行，所有单元格加引号）。
	 *
	 * <p>表头显式声明而不依赖结果集顺序；缺失字段输出空单元格。</p>
	 */
	public String exportCsv(String dataset, int days) {
		String key = StrUtil.trimToEmpty(dataset).toLowerCase();
		int window = days <= 0 ? 30 : days;
		String startDay = LocalDate.now().minusDays(window - 1L).format(DAY);
		List<String> headers;
		List<Map<String, Object>> rows;
		if ("events".equals(key)) {
			headers = EVENTS_HEADERS;
			rows = opsMapper.exportEvents(DEFAULT_SITE_ID, startDay, EXPORT_LIMIT);
		} else if ("sessions".equals(key)) {
			headers = SESSIONS_HEADERS;
			rows = opsMapper.exportSessions(DEFAULT_SITE_ID,
				LocalDate.now().minusDays(window - 1L).atStartOfDay(), EXPORT_LIMIT);
		} else if ("subscribers".equals(key)) {
			headers = SUBSCRIBERS_HEADERS;
			rows = opsMapper.exportSubscribers(EXPORT_LIMIT);
		} else if ("links".equals(key)) {
			headers = LINKS_HEADERS;
			rows = opsMapper.exportLinks(EXPORT_LIMIT);
		} else if ("goals".equals(key)) {
			headers = GOALS_HEADERS;
			rows = opsMapper.exportGoals();
		} else if ("audit".equals(key)) {
			headers = AUDIT_HEADERS;
			rows = opsMapper.exportAudit(EXPORT_LIMIT);
		} else {
			throw new ServiceException("不支持的导出数据集：" + dataset);
		}

		StringBuilder sb = new StringBuilder();
		sb.append('\uFEFF');
		appendRow(sb, headers);
		if (rows != null) {
			for (Map<String, Object> row : rows) {
				List<String> cells = new ArrayList<>(headers.size());
				for (String header : headers) {
					Object value = row == null ? null : row.get(header);
					cells.add(value == null ? "" : String.valueOf(value));
				}
				appendRow(sb, cells);
			}
		}
		return sb.toString();
	}

	/**
	 * 数据口径：采样率 / 过滤开关 / 数据说明 + 过滤规则列表。
	 */
	public Map<String, Object> dataQuality() {
		Map<String, String> settings = settingService.all();
		int sampleRate = LandingFilterRuleService.normalizeSampleRate(settings.get("public.ops.sample-rate"));
		String filterRaw = settings.get("public.ops.filter-enabled");
		boolean filterEnabled = filterRaw == null || !"false".equalsIgnoreCase(filterRaw.trim());

		Map<String, Object> result = new LinkedHashMap<>(6);
		result.put("sampleRate", sampleRate);
		result.put("filterEnabled", filterEnabled);
		// 目前没有独立的「被过滤事件数」计数器，先固定为 0 以保持前端契约稳定。
		result.put("excludedEvents", 0);
		result.put("dataNote", settings.get("public.ops.data-note"));
		result.put("filters", filterRuleService.list());
		return result;
	}

	public Map<String, Object> saveDataQuality(Map<String, Object> body) {
		Map<String, Object> entries = new LinkedHashMap<>();
		if (body != null) {
			if (body.get("sampleRate") != null) {
				int sampleRate = toInt(body.get("sampleRate"), 100);
				entries.put("public.ops.sample-rate", String.valueOf(Math.max(0, Math.min(100, sampleRate))));
			}
			if (body.get("filterEnabled") != null) {
				boolean enabled = Boolean.parseBoolean(String.valueOf(body.get("filterEnabled")));
				entries.put("public.ops.filter-enabled", enabled ? "true" : "false");
			}
			if (body.get("dataNote") != null) {
				entries.put("public.ops.data-note", String.valueOf(body.get("dataNote")));
			}
		}
		if (!entries.isEmpty()) {
			settingService.put(entries);
		}
		return dataQuality();
	}

	private static void appendRow(StringBuilder sb, List<String> cells) {
		for (int i = 0; i < cells.size(); i++) {
			if (i > 0) {
				sb.append(',');
			}
			sb.append(quote(cells.get(i)));
		}
		sb.append("\r\n");
	}

	/** 所有单元格都加引号，内部引号翻倍。 */
	private static String quote(String value) {
		String text = value == null ? "" : value;
		return '"' + text.replace("\"", "\"\"") + '"';
	}

	private static long toLong(Object value) {
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

	private static double toDouble(Object value) {
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

	private static int toInt(Object value, int fallback) {
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

	private static double round2(double value) {
		return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
	}
}
