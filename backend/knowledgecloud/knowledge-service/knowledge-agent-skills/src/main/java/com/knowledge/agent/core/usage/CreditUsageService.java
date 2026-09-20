package com.knowledge.agent.core.usage;

import com.knowledge.agent.core.entity.AgentModelPriceEntity;
import com.knowledge.agent.core.mapper.AgentModelPriceMapper;
import com.knowledge.agent.core.mapper.AgentRunMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 用量口径：每日次数（面向用户）与月度积分（按模型单价折算成本）。
 *
 * <p>积分 = Σ(有效输入 token × 输入单价 + 缓存输入 token × 缓存单价
 * + 输出 token × 输出单价) / 1000，向上取整。未配置单价的模型按 0 计（不惩罚用户），
 * 由管理端在「AI 用量」页维护模型单价后积分才会消耗。</p>
 *
 * @author Kotion
 */
@Service
@RequiredArgsConstructor
public class CreditUsageService {

    private final AgentRunMapper runMapper;
    private final AgentModelPriceMapper modelPriceMapper;

    /** 本月（自然月）已消耗积分。 */
    public long monthlyCreditsUsed(Long userId) {
        if (userId == null) {
            return 0L;
        }
        Map<String, AgentModelPriceEntity> prices = new HashMap<>();
        for (AgentModelPriceEntity price : modelPriceMapper.selectList(null)) {
            if (price.getModelName() != null) {
                prices.put(price.getModelName(), price);
            }
        }
        List<Map<String, Object>> rows = runMapper.selectTokenRowsByUser(userId, firstDayOfMonthMillis());
        double credits = 0.0;
        for (Map<String, Object> row : rows) {
            String model = row.get("model") == null ? null : String.valueOf(row.get("model"));
            long prompt = number(row.get("promptTokens"));
            long cached = number(row.get("cachedPromptTokens"));
            long completion = number(row.get("completionTokens"));
            AgentModelPriceEntity price = model == null ? null : prices.get(model);
            double promptPrice = decimal(price == null ? null : price.getPromptPrice());
            double cachePrice = price == null || price.getCachePromptPrice() == null
                    ? promptPrice : price.getCachePromptPrice().doubleValue();
            double completionPrice = decimal(price == null ? null : price.getCompletionPrice());
            long freshPrompt = Math.max(0L, prompt - cached);
            credits += (freshPrompt * promptPrice + cached * cachePrice + completion * completionPrice) / 1000.0;
        }
        return (long) Math.ceil(credits);
    }

    /** 今日根 run 数（一次用户消息触发的完整 run 算一次，子 agent 不计）。 */
    public long todayRootRuns(Long userId) {
        if (userId == null) {
            return 0L;
        }
        return runMapper.countDailyRootRunsByUser(userId, startOfDayMillis());
    }

    private long number(Object value) {
        return value == null ? 0L : ((Number) value).longValue();
    }

    private double decimal(java.math.BigDecimal value) {
        return value == null ? 0.0 : value.doubleValue();
    }

    private long startOfDayMillis() {
        return LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private long firstDayOfMonthMillis() {
        return LocalDate.now().withDayOfMonth(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }
}
