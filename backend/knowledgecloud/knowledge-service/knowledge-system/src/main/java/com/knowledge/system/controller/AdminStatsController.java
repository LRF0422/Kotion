package com.knowledge.system.controller;

import com.github.xiaoymin.knife4j.annotations.ApiOperationSupport;
import com.knowledge.core.boot.ctrl.KnowledgeController;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.system.domain.vo.DailyCountVO;
import com.knowledge.system.mapper.AdminStatsMapper;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.AllArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 后台运营统计接口
 */
@RestController
@AllArgsConstructor
@RequestMapping("/admin/stats")
@PreAuthorize("(hasRole('platform.dashboard.read') or " + RoleConstant.HAS_ROLE_ADMIN
		+ ") and principal.clientId == 'kotion-platform-admin'")
@Api(value = "后台运营统计", tags = "后台运营统计")
public class AdminStatsController extends KnowledgeController {

	private static final DateTimeFormatter DAY_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
	private static final int MAX_DAYS = 366;

	private final AdminStatsMapper adminStatsMapper;

	/**
	 * 每日新增注册用户趋势
	 */
	@GetMapping("/user-registrations")
	@ApiOperationSupport(order = 1)
	@ApiOperation(value = "注册用户趋势", notes = "传入统计天数 days，默认30")
	public R<List<DailyCountVO>> userRegistrations(@RequestParam(value = "days", defaultValue = "30") Integer days) {
		LocalDate startDate = startDate(days);
		List<DailyCountVO> rows = adminStatsMapper.selectDailyRegistrations(startDate.format(DAY_FORMATTER));
		return R.data(fillMissingDays(rows, startDate));
	}

	/**
	 * 每日活跃用户趋势（DAU）
	 */
	@GetMapping("/dau")
	@ApiOperationSupport(order = 2)
	@ApiOperation(value = "日活趋势", notes = "传入统计天数 days，默认30")
	public R<List<DailyCountVO>> dau(@RequestParam(value = "days", defaultValue = "30") Integer days) {
		LocalDate startDate = startDate(days);
		List<DailyCountVO> rows = adminStatsMapper.selectDailyActiveUsers(startDate.format(DAY_FORMATTER));
		return R.data(fillMissingDays(rows, startDate));
	}

	/**
	 * 用户总数
	 */
	@GetMapping("/total-users")
	@ApiOperationSupport(order = 3)
	@ApiOperation(value = "用户总数")
	public R<Long> totalUsers() {
		return R.data(adminStatsMapper.selectTotalUsers());
	}

	private LocalDate startDate(Integer days) {
		int safeDays = days == null ? 30 : Math.min(Math.max(days, 1), MAX_DAYS);
		return LocalDate.now().minusDays(safeDays - 1L);
	}

	/**
	 * 补齐无数据的日期为 0，保证前端图表横轴连续
	 */
	private List<DailyCountVO> fillMissingDays(List<DailyCountVO> rows, LocalDate startDate) {
		Map<String, Long> valueByDate = rows.stream()
			.collect(Collectors.toMap(DailyCountVO::getDate, DailyCountVO::getValue, (a, b) -> b));
		List<DailyCountVO> result = new ArrayList<>();
		LocalDate today = LocalDate.now();
		for (LocalDate day = startDate; !day.isAfter(today); day = day.plusDays(1)) {
			String key = day.format(DAY_FORMATTER);
			result.add(new DailyCountVO(key, valueByDate.getOrDefault(key, 0L)));
		}
		return result;
	}
}
