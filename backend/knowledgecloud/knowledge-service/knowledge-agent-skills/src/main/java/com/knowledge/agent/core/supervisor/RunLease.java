package com.knowledge.agent.core.supervisor;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Distributed run lease — Redis {@code SET NX EX} fencing so at most one
 * instance drives a run (reconcile may only take over an expired lease).
 */
@Slf4j
@Component
public class RunLease {

    private static final String KEY_PREFIX = "agent:run:lease:";

    private final StringRedisTemplate redis;

    /** This JVM's owner id — renew only touches leases we hold. */
    private final String instanceId = UUID.randomUUID().toString();

    public RunLease(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** Try to acquire; false when another owner holds a live lease. */
    public boolean acquire(String runId, int ttlSeconds) {
        try {
            Boolean ok = redis.opsForValue().setIfAbsent(KEY_PREFIX + runId, instanceId,
                    ttlSeconds, TimeUnit.SECONDS);
            return Boolean.TRUE.equals(ok);
        } catch (Exception e) {
            log.warn("Lease acquire failed for {}: {}", runId, e.getMessage());
            return false;
        }
    }

    /** Renew if (and only if) we are the owner. */
    public boolean renew(String runId, int ttlSeconds) {
        try {
            String owner = redis.opsForValue().get(KEY_PREFIX + runId);
            if (!instanceId.equals(owner)) {
                return false;
            }
            redis.expire(KEY_PREFIX + runId, ttlSeconds, TimeUnit.SECONDS);
            return true;
        } catch (Exception e) {
            log.warn("Lease renew failed for {}: {}", runId, e.getMessage());
            return false;
        }
    }

    /** Whether anyone currently holds a live lease. */
    public boolean isHeld(String runId) {
        try {
            return Boolean.TRUE.equals(redis.hasKey(KEY_PREFIX + runId));
        } catch (Exception e) {
            log.warn("Lease check failed for {}: {}", runId, e.getMessage());
            return false;
        }
    }

    public void release(String runId) {
        try {
            String owner = redis.opsForValue().get(KEY_PREFIX + runId);
            if (instanceId.equals(owner)) {
                redis.delete(KEY_PREFIX + runId);
            }
        } catch (Exception e) {
            log.warn("Lease release failed for {}: {}", runId, e.getMessage());
        }
    }
}
