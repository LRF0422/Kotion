package com.knowledge.agent.core.context;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * Redis-backed {@link CompactionSummaryStore}. Fail-open: any Redis error is a
 * cache miss, so a flaky cache can never fail a run.
 */
@Slf4j
@Component
public class RedisCompactionSummaryStore implements CompactionSummaryStore {

    private static final String KEY_PREFIX = "agent:compaction:summary:";
    private static final long TTL_DAYS = 30;

    private final StringRedisTemplate redis;

    public RedisCompactionSummaryStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public String find(String scope, String key) {
        if (redis == null || key == null) {
            return null;
        }
        try {
            return redis.opsForValue().get(redisKey(scope, key));
        } catch (Exception e) {
            log.warn("Compaction summary read failed: {}", e.getMessage());
            return null;
        }
    }

    @Override
    public void save(String scope, String key, String summary) {
        if (redis == null || key == null || summary == null || summary.isEmpty()) {
            return;
        }
        try {
            redis.opsForValue().set(redisKey(scope, key), summary, TTL_DAYS, TimeUnit.DAYS);
        } catch (Exception e) {
            log.warn("Compaction summary write failed: {}", e.getMessage());
        }
    }

    private String redisKey(String scope, String key) {
        return KEY_PREFIX + (scope == null || scope.isEmpty() ? "global" : scope) + ":" + key;
    }
}
