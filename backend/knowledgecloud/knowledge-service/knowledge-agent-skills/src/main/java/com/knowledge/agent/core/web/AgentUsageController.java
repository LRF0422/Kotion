package com.knowledge.agent.core.web;

import com.knowledge.agent.core.usage.CreditUsageService;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 当前用户的 AI 用量（自服务展示）：每日次数 + 本月积分。
 *
 * @author Kotion
 */
@Api(tags = "Agent Usage (self)")
@RestController
@RequestMapping("/api/agent/v1/usage")
@RequiredArgsConstructor
public class AgentUsageController {

    private final CreditUsageService creditUsageService;

    @ApiOperation("Current user's AI runs today")
    @GetMapping("/ai-runs")
    public R<Long> aiRunsToday() {
        return R.data(creditUsageService.todayRootRuns(SecurityContextUtil.getUserId()));
    }

    @ApiOperation("Current user's AI credits used this month")
    @GetMapping("/ai-credits")
    public R<Long> aiCreditsThisMonth() {
        return R.data(creditUsageService.monthlyCreditsUsed(SecurityContextUtil.getUserId()));
    }
}
