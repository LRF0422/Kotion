package com.knowledge.agent.core.run;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * Cross-instance cancellation marker for a run.
 *
 * <p>A run may be cancelled through an instance that does not own its loop
 * (gateway round-robin, failover). The owning loop cannot see the local
 * {@code ResumeGate} signal, so cancellation is also published to Redis. The
 * loop polls this flag (throttled) and, once set, stops persisting so the
 * durable {@code CANCELLED} status is never clobbered by a late
 * {@code WAITING_TOOLS}/{@code SUSPENDED}/RUNNING write.
 *
 * <p>Fail-open: a Redis error must never make a live run think it was
 * cancelled, so lookups return false when storage is unavailable.
 */
@Slf4j
@Component
public class RunCancelFlag {

    private static final String KEY_PREFIX = "agent:run:cancel:";
    private static final long TTL_HOURS = 24;

    private final StringRedisTemplate redis;

    public RunCancelFlag(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void mark(String runId) {
        if (runId == null || runId.isEmpty()) {
            return;
        }
        try {
            redis.opsForValue().set(KEY_PREFIX + runId, "1", TTL_HOURS, TimeUnit.HOURS);
        } catch (Exception e) {
            log.warn("RunCancelFlag mark failed for {}: {}", runId, e.getMessage());
        }
    }

    public boolean isMarked(String runId) {
        if (runId == null || runId.isEmpty()) {
            return false;
        }
        try {
            return Boolean.TRUE.equals(redis.hasKey(KEY_PREFIX + runId));
        } catch (Exception e) {
            log.warn("RunCancelFlag check failed for {}: {}", runId, e.getMessage());
            return false;
        }
    }

    public void clear(String runId) {
        if (runId == null || runId.isEmpty()) {
            return;
        }
        try {
            redis.delete(KEY_PREFIX + runId);
        } catch (Exception e) {
            log.warn("RunCancelFlag clear failed for {}: {}", runId, e.getMessage());
        }
    }
}
