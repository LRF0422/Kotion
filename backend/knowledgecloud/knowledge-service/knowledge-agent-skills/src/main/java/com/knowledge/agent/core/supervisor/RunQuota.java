package com.knowledge.agent.core.supervisor;

import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.mapper.AgentRunMapper;
import com.knowledge.core.entitlement.EntitlementGate;
import com.knowledge.core.entitlement.constant.EntitlementCodes;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.concurrent.TimeUnit;

/**
 * Quotas that gate run creation, in two layers:
 *
 * <ul>
 *   <li><b>tenant/platform</b> — create rate (sliding minute window) and
 *       concurrent active runs (DB count, cross-restart safe);</li>
 *   <li><b>subscription entitlement</b> — per-user daily token budget and
 *       concurrent runs, resolved through {@link EntitlementGate}.</li>
 * </ul>
 */
@Slf4j
@Component
public class RunQuota {

    private static final String RATE_KEY_PREFIX = "agent:quota:create:";

    private final StringRedisTemplate redis;
    private final AgentRunMapper runMapper;
    private final AgentCoreProperties properties;
    private final EntitlementGate entitlementGate;

    public RunQuota(StringRedisTemplate redis, AgentRunMapper runMapper,
                    AgentCoreProperties properties, EntitlementGate entitlementGate) {
        this.redis = redis;
        this.runMapper = runMapper;
        this.properties = properties;
        this.entitlementGate = entitlementGate;
    }

    /** Throws {@link QuotaExceededException} when a quota blocks the create. */
    public void checkCreateAllowed(Long userId, Long tenantId) {
        checkTenantQuota(tenantId);
        checkEntitlementQuota(userId);
    }

    private void checkTenantQuota(Long tenantId) {
        if (!properties.getQuota().isEnabled() || tenantId == null) {
            return;
        }
        int perMinute = properties.getQuota().getCreatePerMinute();
        if (perMinute > 0) {
            try {
                String key = RATE_KEY_PREFIX + tenantId;
                Long count = redis.opsForValue().increment(key);
                if (count != null && count == 1) {
                    redis.expire(key, 60, TimeUnit.SECONDS);
                }
                if (count != null && count > perMinute) {
                    throw new QuotaExceededException("创建过于频繁，请稍后再试");
                }
            } catch (QuotaExceededException e) {
                throw e;
            } catch (Exception e) {
                log.warn("Quota rate check failed for tenant {}: {}", tenantId, e.getMessage());
            }
        }
        int maxConcurrent = properties.getQuota().getMaxConcurrentPerTenant();
        if (maxConcurrent > 0) {
            try {
                long active = runMapper.countActiveByTenant(tenantId);
                if (active >= maxConcurrent) {
                    throw new QuotaExceededException("并发任务已达上限，请等待当前任务结束");
                }
            } catch (QuotaExceededException e) {
                throw e;
            } catch (Exception e) {
                log.warn("Quota concurrency check failed for tenant {}: {}", tenantId, e.getMessage());
            }
        }
    }

    /** 套餐权益：当日 token 总量与并发 run 数（按用户）。 */
    private void checkEntitlementQuota(Long userId) {
        if (userId == null || entitlementGate == null) {
            return;
        }
        try {
            checkUserDailyTokenBudget(userId);
            long active = runMapper.countActiveByUser(userId);
            entitlementGate.requireQuota(userId, EntitlementCodes.AI_RUNS_CONCURRENT, active, 1,
                    "并发任务数已达套餐上限，请等待当前任务结束");
        } catch (com.knowledge.core.entitlement.error.EntitlementException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Entitlement quota check failed for user {}: {}", userId, e.getMessage());
        }
    }

    /** 当日 token 额度校验；run 执行途中也会调用（熔断）。 */
    public void checkUserDailyTokenBudget(Long userId) {
        if (userId == null || entitlementGate == null) {
            return;
        }
        long used = runMapper.sumDailyTokensByUser(userId, startOfDayMillis());
        entitlementGate.requireQuota(userId, EntitlementCodes.AI_TOKENS_DAILY, used, 0,
                "今日 AI 用量已达套餐上限，请升级套餐或明天再试");
    }

    private long startOfDayMillis() {
        return LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    public static class QuotaExceededException extends IllegalArgumentException {
        public QuotaExceededException(String message) {
            super(message);
        }
    }
}
