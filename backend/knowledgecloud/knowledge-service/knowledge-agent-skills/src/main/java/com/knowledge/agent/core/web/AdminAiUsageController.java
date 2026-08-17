package com.knowledge.agentcore.web;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.knowledge.agentcore.entity.AgentModelPriceEntity;
import com.knowledge.agentcore.mapper.AgentModelPriceMapper;
import com.knowledge.agentcore.mapper.AgentRunMapper;
import com.knowledge.agentcore.web.vo.UsageStatsVO;
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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Platform-admin AI usage analytics + model pricing (AgentCore).
 *
 * <p>Usage now aggregates the {@code agent_run} table (the rewritten agent's
 * durable runs) instead of the deleted {@code agent_usage_record} hot path;
 * the API contract is unchanged for the admin frontend.
 */
@Api(tags = "Admin AI Usage (AgentCore)")
@RestController
@RequestMapping("/admin/ai")
@RequiredArgsConstructor
public class AdminAiUsageController {

    private static final int MAX_DAYS = 366;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final AgentRunMapper runMapper;
    private final AgentModelPriceMapper modelPriceMapper;

    @ApiOperation("Daily token usage trend")
    @GetMapping("/usage/trend")
    public R<List<UsageStatsVO.DailyTokens>> usageTrend(@RequestParam(defaultValue = "30") Integer days) {
        int range = clampDays(days);
        long startMs = startOfDayMillis(range - 1);
        List<UsageStatsVO.DailyTokens> rows = runMapper.selectDailyTokens(startMs);
        Map<String, UsageStatsVO.DailyTokens> byDate = rows.stream()
                .collect(Collectors.toMap(UsageStatsVO.DailyTokens::getDate, Function.identity(), (a, b) -> a));
        List<UsageStatsVO.DailyTokens> result = new ArrayList<>(range);
        for (int i = range - 1; i >= 0; i--) {
            String date = LocalDate.now().minusDays(i).format(DAY);
            UsageStatsVO.DailyTokens empty = new UsageStatsVO.DailyTokens();
            empty.setDate(date);
            empty.setPromptTokens(0L);
            empty.setCompletionTokens(0L);
            empty.setTotalTokens(0L);
            empty.setSessions(0L);
            result.add(byDate.getOrDefault(date, empty));
        }
        return R.data(result);
    }

    @ApiOperation("Token usage ranking by user")
    @GetMapping("/usage/by-user")
    public R<List<UsageStatsVO.ByUser>> usageByUser(@RequestParam(defaultValue = "30") Integer days,
            @RequestParam(defaultValue = "20") Integer limit) {
        long startMs = startOfDayMillis(clampDays(days) - 1);
        int top = Math.max(1, Math.min(limit == null ? 20 : limit, 100));
        return R.data(runMapper.selectUsageByUser(startMs, top));
    }

    @ApiOperation("Token usage and cost by model")
    @GetMapping("/usage/by-model")
    public R<List<UsageStatsVO.ByModel>> usageByModel(@RequestParam(defaultValue = "30") Integer days) {
        long startMs = startOfDayMillis(clampDays(days) - 1);
        return R.data(runMapper.selectUsageByModel(startMs));
    }

    @ApiOperation("Usage summary")
    @GetMapping("/usage/summary")
    public R<Map<String, Object>> usageSummary(@RequestParam(defaultValue = "30") Integer days) {
        long startMs = startOfDayMillis(clampDays(days) - 1);
        List<UsageStatsVO.ByModel> byModel = runMapper.selectUsageByModel(startMs);
        long totalTokens = 0L;
        long sessions = 0L;
        BigDecimal totalCost = BigDecimal.ZERO;
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

    @ApiOperation("List model prices")
    @GetMapping("/model-price/list")
    public R<List<AgentModelPriceEntity>> listPrices() {
        return R.data(modelPriceMapper.selectList(new LambdaQueryWrapper<AgentModelPriceEntity>()
                .orderByAsc(AgentModelPriceEntity::getModelName)));
    }

    @ApiOperation("Submit (insert or update) a model price")
    @PostMapping("/model-price/submit")
    public R<AgentModelPriceEntity> submitPrice(@RequestBody AgentModelPriceEntity price) {
        if (price.getModelName() == null || price.getModelName().trim().isEmpty()) {
            return R.fail("modelName is required");
        }
        if (price.getId() == null) {
            modelPriceMapper.insert(price);
        } else {
            modelPriceMapper.updateById(price);
        }
        return R.data(price);
    }

    @ApiOperation("Delete a model price")
    @DeleteMapping("/model-price/{id}")
    public R<Void> deletePrice(@PathVariable Long id) {
        modelPriceMapper.deleteById(id);
        return R.data(null);
    }

    private int clampDays(Integer days) {
        int range = days == null ? 30 : days;
        return Math.max(1, Math.min(range, MAX_DAYS));
    }

    private long startOfDayMillis(int daysAgo) {
        return LocalDate.now().minusDays(daysAgo).atStartOfDay(ZoneId.systemDefault())
                .toInstant().toEpochMilli();
    }
}
