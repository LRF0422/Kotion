package com.knowledge.agent.core.web;

import com.knowledge.agent.core.mapper.AgentRunMapper;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;

/**
 * 当前用户的 AI 用量（自服务展示，非管理端）。
 *
 * @author Kotion
 */
@Api(tags = "Agent Usage (self)")
@RestController
@RequestMapping("/api/agent/v1/usage")
@RequiredArgsConstructor
public class AgentUsageController {

    private final AgentRunMapper runMapper;

    @ApiOperation("Current user's token usage today")
    @GetMapping("/ai-tokens")
    public R<Long> aiTokensToday() {
        Long userId = SecurityContextUtil.getUserId();
        if (userId == null) {
            return R.data(0L);
        }
        long startMs = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
        return R.data(runMapper.sumDailyTokensByUser(userId, startMs));
    }
}
