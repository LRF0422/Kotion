package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import com.knowledge.system.domain.vo.LandingBreakdownVO;
import com.knowledge.system.domain.vo.LandingChannelVO;
import com.knowledge.system.domain.vo.LandingDailyTrendVO;
import com.knowledge.system.domain.vo.LandingEventRankVO;
import com.knowledge.system.domain.vo.LandingFunnelEventVO;
import com.knowledge.system.domain.vo.LandingFunnelStepVO;
import com.knowledge.system.domain.vo.LandingOverviewVO;
import com.knowledge.system.domain.vo.LandingPageRankVO;
import com.knowledge.system.domain.vo.LandingPropCountVO;
import com.knowledge.system.domain.vo.LandingReferrerVO;
import com.knowledge.system.domain.vo.LandingSessionStatsVO;
import com.knowledge.system.domain.vo.LandingSessionVO;
import com.knowledge.system.mapper.LandingStatsMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 落地页运营统计服务
 */
@Service
@AllArgsConstructor
public class LandingStatsService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";
	private static final List<String> BREAKDOWN_COLUMNS = Arrays.asList("device", "browser", "os");

	private final LandingStatsMapper statsMapper;

	private static String startDay(int days) {
		return LocalDate.now().minusDays(Math.max(1, Math.min(days, 365)) - 1L).toString();
	}

	private static int clamp(int value, int min, int max, int fallback) {
		if (value <= 0) {
			return fallback;
		}
		return Math.max(min, Math.min(max, value));
	}

	public LandingOverviewVO overview(String siteId, int days) {
		int range = clamp(days, 1, 365, 30);
		String from = startDay(range);
		LandingOverviewVO totals = statsMapper.selectTotals(siteId, from);
		if (totals == null) {
			totals = new LandingOverviewVO();
		}
		LandingSessionStatsVO sessionStats = statsMapper.selectSessionStats(siteId, from);
		Long newVisitors = statsMapper.selectNewVisitors(siteId,
			LocalDate.now().minusDays(range - 1L).atStartOfDay());
		long sessions = totals.getSessions() == null ? 0L : totals.getSessions();
		long bounces = sessionStats == null || sessionStats.getBounces() == null ? 0L : sessionStats.getBounces();
		double avgSeconds = sessionStats == null || sessionStats.getAvgDurationMs() == null
			? 0d : sessionStats.getAvgDurationMs();

		totals.setNewVisitors(newVisitors == null ? 0L : newVisitors);
		totals.setBounces(bounces);
		totals.setBounceRate(sessions > 0 ? (double) bounces / sessions : 0d);
		totals.setAvgDurationMs(avgSeconds * 1000d);
		totals.setDays(range);
		return totals;
	}

	public List<LandingDailyTrendVO> timeseries(String siteId, int days) {
		int range = clamp(days, 1, 365, 30);
		List<LandingDailyTrendVO> rows = statsMapper.selectDailyTrend(siteId, startDay(range));
		Map<String, LandingDailyTrendVO> byDate = new HashMap<>();
		for (LandingDailyTrendVO row : rows) {
			byDate.put(row.getDate(), row);
		}
		List<LandingDailyTrendVO> result = new ArrayList<>();
		for (int i = range - 1; i >= 0; i--) {
			String date = LocalDate.now().minusDays(i).toString();
			LandingDailyTrendVO row = byDate.get(date);
			result.add(row == null ? new LandingDailyTrendVO(date, 0L, 0L, 0L, 0L) : row);
		}
		return result;
	}

	public List<LandingPageRankVO> topPages(String siteId, int days, int limit) {
		return statsMapper.selectTopPages(siteId, startDay(clamp(days, 1, 365, 30)), clamp(limit, 1, 200, 20));
	}

	public List<LandingEventRankVO> topEvents(String siteId, int days, int limit) {
		return statsMapper.selectTopEvents(siteId, startDay(clamp(days, 1, 365, 30)), clamp(limit, 1, 200, 30));
	}

	public List<LandingChannelVO> channels(String siteId, int days, int limit) {
		return statsMapper.selectChannels(siteId, startDay(clamp(days, 1, 365, 30)), clamp(limit, 1, 200, 20));
	}

	public List<LandingReferrerVO> referrers(String siteId, int days, int limit) {
		return statsMapper.selectReferrers(siteId, startDay(clamp(days, 1, 365, 30)), clamp(limit, 1, 200, 20));
	}

	public Map<String, List<LandingBreakdownVO>> tech(String siteId, int days) {
		String from = startDay(clamp(days, 1, 365, 30));
		Map<String, List<LandingBreakdownVO>> result = new LinkedHashMap<>();
		for (String column : BREAKDOWN_COLUMNS) {
			result.put(column, statsMapper.selectBreakdown(siteId, from, column));
		}
		return result;
	}

	public List<LandingPropCountVO> eventProps(String siteId, String eventName, String key, int days, int limit) {
		if (StrUtil.isBlank(eventName) || key == null || !key.matches("[A-Za-z0-9_.-]{1,64}")) {
			return new ArrayList<>();
		}
		return statsMapper.selectEventProps(siteId, startDay(clamp(days, 1, 365, 30)),
			eventName, "$." + key, clamp(limit, 1, 200, 30));
	}

	public Map<String, Object> realtime(String siteId, int minutes) {
		int window = clamp(minutes, 1, 1440, 30);
		LocalDateTime since = LocalDateTime.now().minusMinutes(window);
		LandingOverviewVO summary = statsMapper.selectRealtime(siteId, since);
		List<LandingPageRankVO> pages = statsMapper.selectRealtimePages(siteId, since, 10);
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("minutes", window);
		result.put("visitors", summary == null || summary.getVisitors() == null ? 0L : summary.getVisitors());
		result.put("sessions", summary == null || summary.getSessions() == null ? 0L : summary.getSessions());
		result.put("pageviews", summary == null || summary.getPageviews() == null ? 0L : summary.getPageviews());
		result.put("paths", pages);
		return result;
	}

	public List<LandingSessionVO> sessions(String siteId, int limit) {
		return statsMapper.selectRecentSessions(siteId, clamp(limit, 1, 500, 50));
	}

	/**
	 * 漏斗：steps 为 [{type:event|path, value}]，按同一会话内时间顺序去重计数。
	 */
	@SuppressWarnings("unchecked")
	public Map<String, Object> funnel(String siteId, int days, List<Map<String, String>> steps) {
		List<Map<String, String>> normalized = new ArrayList<>();
		List<String> eventNames = new ArrayList<>();
		List<String> paths = new ArrayList<>();
		if (steps != null) {
			for (Map<String, String> step : steps) {
				if (step == null || StrUtil.isBlank(step.get("value"))) {
					continue;
				}
				String type = "path".equals(step.get("type")) ? "path" : "event";
				String value = step.get("value");
				Map<String, String> item = new HashMap<>(2);
				item.put("type", type);
				item.put("value", value);
				normalized.add(item);
				if ("path".equals(type)) {
					paths.add(value);
				} else {
					eventNames.add(value);
				}
				if (normalized.size() >= 12) {
					break;
				}
			}
		}

		Map<String, Object> payload = new LinkedHashMap<>();
		payload.put("steps", normalized);
		if (normalized.isEmpty()) {
			payload.put("result", new ArrayList<>());
			return payload;
		}

		List<LandingFunnelEventVO> rows = statsMapper.selectFunnelEvents(siteId,
			startDay(clamp(days, 1, 365, 30)), eventNames, paths);
		Map<String, List<LandingFunnelEventVO>> bySession = new LinkedHashMap<>();
		for (LandingFunnelEventVO row : rows) {
			bySession.computeIfAbsent(row.getSessionId(), key -> new ArrayList<>()).add(row);
		}

		int size = normalized.size();
		long[] reached = new long[size];
		Set<String>[] visitorSets = new Set[size];
		for (int i = 0; i < size; i++) {
			visitorSets[i] = new HashSet<>();
		}

		for (List<LandingFunnelEventVO> sessionRows : bySession.values()) {
			int cursor = 0;
			for (int stepIndex = 0; stepIndex < size; stepIndex++) {
				Map<String, String> step = normalized.get(stepIndex);
				LandingFunnelEventVO found = null;
				for (int j = cursor; j < sessionRows.size(); j++) {
					LandingFunnelEventVO candidate = sessionRows.get(j);
					boolean match = "path".equals(step.get("type"))
						? step.get("value").equals(candidate.getPath())
						: step.get("value").equals(candidate.getEventName());
					if (match) {
						found = candidate;
						cursor = j + 1;
						break;
					}
				}
				if (found == null) {
					break;
				}
				reached[stepIndex]++;
				if (found.getVisitorId() != null) {
					visitorSets[stepIndex].add(found.getVisitorId());
				}
			}
		}

		List<LandingFunnelStepVO> result = new ArrayList<>();
		for (int i = 0; i < size; i++) {
			Map<String, String> step = normalized.get(i);
			long previous = i == 0 ? reached[0] : reached[i - 1];
			result.add(new LandingFunnelStepVO(
				i,
				step.get("value"),
				step.get("type"),
				reached[i],
				(long) visitorSets[i].size(),
				reached[0] > 0 ? (double) reached[i] / reached[0] : 0d,
				i == 0 ? 1d : (previous > 0 ? (double) reached[i] / previous : 0d)));
		}
		payload.put("result", result);
		return payload;
	}
}
