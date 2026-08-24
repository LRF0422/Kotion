package com.knowledge.wiki.service.doc;

import java.time.Duration;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Runs the legacy block backfill at startup, when explicitly asked to.
 * <p>
 * <b>Off unless switched on.</b> The bean is not even created without
 * {@code knowledge.wiki.block-backfill.enabled=true}, so a normal boot cannot
 * migrate anything by accident. It is a startup runner rather than an HTTP
 * endpoint because the operation is a deployment step, not a feature: it needs no
 * caller identity, no permission model, and no request that can time out halfway
 * through a large database.
 * </p>
 * <p>
 * <b>Dry run first.</b> {@code dry-run} defaults to true, so the documented way
 * to use this is: boot once with the flag on and see the verification report,
 * then boot again with {@code dry-run=false} to actually write.
 * </p>
 * <p>
 * The Redis lock stops two instances of a horizontally scaled deployment from
 * migrating the same pages at once. Per-page skipping already makes a repeat run
 * safe, but two concurrent runs could still interleave inside one page's
 * delete-then-insert, and a lock is cheaper than reasoning about that.
 * </p>
 */
@Slf4j
@Component
@Order(0)
@ConditionalOnProperty(value = "knowledge.wiki.block-backfill.enabled", havingValue = "true")
public class BlockBackfillRunner implements ApplicationRunner {

    private static final String LOCK_KEY = "wiki:block-backfill:lock";

    private static final Duration LOCK_TTL = Duration.ofMinutes(5);

    private static final DefaultRedisScript<Long> RENEW_LOCK = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then "
                    + "return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
            Long.class);

    private static final DefaultRedisScript<Long> RELEASE_LOCK = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then "
                    + "return redis.call('del', KEYS[1]) else return 0 end",
            Long.class);

    @Autowired
    private BlockBackfillService blockBackfillService;

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    /** Reassemble and verify without writing. Defaults to the safe direction. */
    @Value("${knowledge.wiki.block-backfill.dry-run:true}")
    private boolean dryRun;

    @Override
    public void run(ApplicationArguments args) {
        String owner = UUID.randomUUID().toString();
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(LOCK_KEY, owner, LOCK_TTL);
        if (!Boolean.TRUE.equals(acquired)) {
            log.info("block backfill: another instance holds the lock, skipping");
            return;
        }

        AtomicBoolean lockLost = new AtomicBoolean(false);
        ScheduledExecutorService renewer = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "wiki-block-backfill-lock-renewer");
            thread.setDaemon(true);
            return thread;
        });
        renewer.scheduleAtFixedRate(() -> renew(owner, lockLost), 60, 60, TimeUnit.SECONDS);

        try {
            BlockBackfillService.SweepReport report = blockBackfillService.backfillAll(dryRun, lockLost::get);
            if (lockLost.get()) {
                throw new IllegalStateException("block backfill lock was lost during the sweep");
            }
            if (report.getMismatch() > 0 || report.getFailed() > 0 || !report.getNeedsReview().isEmpty()) {
                throw new IllegalStateException("block backfill requires review: mismatch=" + report.getMismatch()
                        + " failed=" + report.getFailed() + " review=" + report.getNeedsReview().size());
            }
        } finally {
            renewer.shutdownNow();
            redisTemplate.execute(RELEASE_LOCK, Collections.singletonList(LOCK_KEY), owner);
        }
    }

    private void renew(String owner, AtomicBoolean lockLost) {
        try {
            Long renewed = redisTemplate.execute(RENEW_LOCK, Collections.singletonList(LOCK_KEY), owner,
                    String.valueOf(LOCK_TTL.toMillis()));
            if (!Long.valueOf(1L).equals(renewed)) {
                lockLost.set(true);
                log.error("block backfill lock was lost; stopping before the next page");
            }
        } catch (Exception e) {
            lockLost.set(true);
            log.error("block backfill lock renewal failed; stopping before the next page", e);
        }
    }

}
