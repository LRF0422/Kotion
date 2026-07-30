package com.knowledge.wiki.service.controller;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.entity.vo.DailyCountVO;
import com.knowledge.wiki.service.entity.vo.TopSpaceVO;
import com.knowledge.wiki.service.mapper.AdminWikiStatsMapper;

/**
 * 后台运营统计接口（wiki 内容维度）
 */
@RestController
@RequestMapping("/admin/stats")
public class AdminWikiStatsController {

    private static final DateTimeFormatter DAY_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final int MAX_DAYS = 366;

    @Autowired
    private AdminWikiStatsMapper adminWikiStatsMapper;

    /**
     * 内容创建趋势（每日新建页面数）
     * GET /knowledge-wiki/admin/stats/content-trend?days=30
     */
    @GetMapping("/content-trend")
    public R<List<DailyCountVO>> contentTrend(@RequestParam(value = "days", defaultValue = "30") Integer days) {
        LocalDate startDate = startDate(days);
        return R.data(fillMissingDays(
                adminWikiStatsMapper.selectDailyNewPages(startDate.format(DAY_FORMATTER)), startDate));
    }

    /**
     * 空间创建趋势（每日新建空间数）
     * GET /knowledge-wiki/admin/stats/space-trend?days=30
     */
    @GetMapping("/space-trend")
    public R<List<DailyCountVO>> spaceTrend(@RequestParam(value = "days", defaultValue = "30") Integer days) {
        LocalDate startDate = startDate(days);
        return R.data(fillMissingDays(
                adminWikiStatsMapper.selectDailyNewSpaces(startDate.format(DAY_FORMATTER)), startDate));
    }

    /**
     * TOP 空间（按有效页面数排序）
     * GET /knowledge-wiki/admin/stats/top-spaces?limit=10
     */
    @GetMapping("/top-spaces")
    public R<List<TopSpaceVO>> topSpaces(@RequestParam(value = "limit", defaultValue = "10") Integer limit) {
        int safeLimit = limit == null ? 10 : Math.min(Math.max(limit, 1), 100);
        return R.data(adminWikiStatsMapper.selectTopSpaces(safeLimit));
    }

    /**
     * 内容总量概览（空间总数/页面总数）
     * GET /knowledge-wiki/admin/stats/summary
     */
    @GetMapping("/summary")
    public R<Map<String, Long>> summary() {
        Map<String, Long> result = new LinkedHashMap<>();
        result.put("totalSpaces", adminWikiStatsMapper.selectTotalSpaces());
        result.put("totalPages", adminWikiStatsMapper.selectTotalPages());
        return R.data(result);
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
