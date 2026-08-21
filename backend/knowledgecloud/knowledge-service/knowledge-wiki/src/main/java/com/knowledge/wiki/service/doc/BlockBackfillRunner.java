package com.knowledge.wiki.service.doc;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.RedisTemplate;
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
@ConditionalOnProperty(value = "knowledge.wiki.block-backfill.enabled", havingValue = "true")
public class BlockBackfillRunner implements ApplicationRunner {

    private static final String LOCK_KEY = "wiki:block-backfill:lock";

    /**
     * Long enough for a full sweep of a large instance. If the holder dies the
     * lock expires and the next boot picks up where it left off, because migration
     * is per-page and idempotent.
     */
    private static final Duration LOCK_TTL = Duration.ofHours(2);

    @Autowired
    private BlockBackfillService blockBackfillService;

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    /** Reassemble and verify without writing. Defaults to the safe direction. */
    @Value("${knowledge.wiki.block-backfill.dry-run:true}")
    private boolean dryRun;

    /** Re-migrate pages that already have a head row. */
    @Value("${knowledge.wiki.block-backfill.force:false}")
    private boolean force;

    @Override
    public void run(ApplicationArguments args) {
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(LOCK_KEY, String.valueOf(System.currentTimeMillis()),
                LOCK_TTL);
        if (!Boolean.TRUE.equals(acquired)) {
            log.info("block backfill: another instance holds the lock, skipping");
            return;
        }
        try {
            blockBackfillService.backfillAll(dryRun, force);
        } catch (Exception e) {
            // Never let a migration failure stop the application from starting: the
            // old read path still works, so a failed backfill is a blocked
            // deployment step, not an outage.
            log.error("block backfill sweep aborted", e);
        } finally {
            redisTemplate.delete(LOCK_KEY);
        }
    }

}
