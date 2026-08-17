package com.knowledge.agentcore.supervisor;

import com.knowledge.agentcore.config.AgentCoreProperties;
import com.knowledge.agentcore.mapper.AgentRunMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * Tenant quotas: create rate (sliding minute window) and concurrent active
 * runs (DB count — cross-restart safe).
 */
@Slf4j
@Component
public class RunQuota {

    private static final String RATE_KEY_PREFIX = "agent:quota:create:";

    private final StringRedisTemplate redis;
    private final AgentRunMapper runMapper;
    private final AgentCoreProperties properties;

    public RunQuota(StringRedisTemplate redis, AgentRunMapper runMapper,
                    AgentCoreProperties properties) {
        this.redis = redis;
        this.runMapper = runMapper;
        this.properties = properties;
    }

    /** Throws {@link QuotaExceededException} when a quota blocks the create. */
    public void checkCreateAllowed(Long tenantId) {
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

    public static class QuotaExceededException extends IllegalArgumentException {
        public QuotaExceededException(String message) {
            super(message);
        }
    }
}
