package com.knowledge.agent.controller;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.agent.store.entity.AgentModelPriceEntity;
import com.knowledge.agent.store.mapper.AgentModelPriceMapper;
import com.knowledge.agent.store.mapper.AgentUsageRecordMapper;
import com.knowledge.agent.store.vo.UsageStatsVO;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Platform-admin endpoints for AI token usage analytics and model pricing.
 *
 * <p>
 * Aggregates {@code agent_usage_record} written by
 * {@link com.knowledge.agent.store.AgentUsageRecorder} and manages the
 * {@code agent_model_price} table used for cost estimation.
 */
@Api(tags = "Admin AI Usage")
@RestController
@RequestMapping("/admin/ai")
@RequiredArgsConstructor
public class AdminAiUsageController {

    private static final int MAX_DAYS = 366;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final AgentUsageRecordMapper usageRecordMapper;
    private final AgentModelPriceMapper modelPriceMapper;

    /**
     * Daily token consumption trend (zero-filled for chart continuity).
     */
    @ApiOperation("Daily token usage trend")
    @GetMapping("/usage/trend")
    public R<List<UsageStatsVO.DailyTokens>> usageTrend(@RequestParam(defaultValue = "30") Integer days) {
        int range = clampDays(days);
        String startDate = LocalDate.now().minusDays(range - 1L).format(DAY);
        List<UsageStatsVO.DailyTokens> rows = usageRecordMapper.selectDailyTokens(startDate);
        Map<String, UsageStatsVO.DailyTokens> byDate = rows.stream()
                .collect(Collectors.toMap(UsageStatsVO.DailyTokens::getDate, Function.identity(), (a, b) -> a));
        List<UsageStatsVO.DailyTokens> result = new ArrayList<>(range);
        for (int i = range - 1; i >= 0; i--) {
            String date = LocalDate.now().minusDays(i).format(DAY);
            result.add(byDate.getOrDefault(date, emptyDay(date)));
        }
        return R.data(result);
    }

    /**
     * Top users ranked by total token consumption.
     */
    @ApiOperation("Token usage ranking by user")
    @GetMapping("/usage/by-user")
    public R<List<UsageStatsVO.ByUser>> usageByUser(@RequestParam(defaultValue = "30") Integer days,
            @RequestParam(defaultValue = "20") Integer limit) {
        String startDate = LocalDate.now().minusDays(clampDays(days) - 1L).format(DAY);
        int top = Math.max(1, Math.min(limit == null ? 20 : limit, 100));
        return R.data(usageRecordMapper.selectUsageByUser(startDate, top));
    }

    /**
     * Usage grouped by model with estimated cost.
     */
    @ApiOperation("Token usage and cost by model")
    @GetMapping("/usage/by-model")
    public R<List<UsageStatsVO.ByModel>> usageByModel(@RequestParam(defaultValue = "30") Integer days) {
        String startDate = LocalDate.now().minusDays(clampDays(days) - 1L).format(DAY);
        return R.data(usageRecordMapper.selectUsageByModel(startDate));
    }

    /**
     * Overall usage summary: total tokens, sessions and estimated cost.
     */
    @ApiOperation("Usage summary")
    @GetMapping("/usage/summary")
    public R<Map<String, Object>> usageSummary(@RequestParam(defaultValue = "30") Integer days) {
        String startDate = LocalDate.now().minusDays(clampDays(days) - 1L).format(DAY);
        List<UsageStatsVO.ByModel> byModel = usageRecordMapper.selectUsageByModel(startDate);
        long totalTokens = 0L;
        long sessions = 0L;
        java.math.BigDecimal totalCost = java.math.BigDecimal.ZERO;
        for (UsageStatsVO.ByModel m : byModel) {
            totalTokens += m.getTotalTokens() == null ? 0L : m.getTotalTokens();
            sessions += m.getSessions() == null ? 0L : m.getSessions();
            if (m.getCost() != null) {
                totalCost = totalCost.add(m.getCost());
            }
        }
        Map<String, Object> summary = new HashMap<>();
        summary.put("totalTokens", totalTokens);
        summary.put("sessions", sessions);
        summary.put("totalCost", totalCost);
        summary.put("models", byModel.size());
        return R.data(summary);
    }

    // ---- model price CRUD ----

    /**
     * List all configured model prices.
     */
    @ApiOperation("List model prices")
    @GetMapping("/model-price/list")
    public R<List<AgentModelPriceEntity>> listModelPrices() {
        return R.data(modelPriceMapper.selectList(
                Wrappers.<AgentModelPriceEntity>lambdaQuery().orderByAsc(AgentModelPriceEntity::getModelName)));
    }

    /**
     * Create or update a model price (updates when id is present).
     */
    @ApiOperation("Save model price")
    @PostMapping("/model-price/submit")
    public R<Void> submitModelPrice(@RequestBody AgentModelPriceEntity entity) {
        if (entity.getModelName() == null || entity.getModelName().trim().isEmpty()) {
            return R.fail("modelName is required");
        }
        entity.setModelName(entity.getModelName().trim());
        entity.setUpdateTime(LocalDateTime.now());
        if (entity.getId() == null) {
            entity.setCreateTime(LocalDateTime.now());
            modelPriceMapper.insert(entity);
        } else {
            modelPriceMapper.updateById(entity);
        }
        return R.success("操作成功");
    }

    /**
     * Delete a model price entry.
     */
    @ApiOperation("Delete model price")
    @DeleteMapping("/model-price/{id}")
    public R<Void> deleteModelPrice(@PathVariable Long id) {
        modelPriceMapper.deleteById(id);
        return R.success("操作成功");
    }

    private int clampDays(Integer days) {
        int value = days == null ? 30 : days;
        return Math.max(1, Math.min(value, MAX_DAYS));
    }

    private UsageStatsVO.DailyTokens emptyDay(String date) {
        UsageStatsVO.DailyTokens vo = new UsageStatsVO.DailyTokens();
        vo.setDate(date);
        vo.setPromptTokens(0L);
        vo.setCompletionTokens(0L);
        vo.setTotalTokens(0L);
        vo.setSessions(0L);
        return vo;
    }
}
