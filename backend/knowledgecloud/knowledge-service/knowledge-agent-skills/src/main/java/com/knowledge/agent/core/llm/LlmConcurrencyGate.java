package com.knowledge.agent.core.llm;

import lombok.extern.slf4j.Slf4j;

import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;

/**
 * Concurrency gate for LLM provider calls.
 *
 * <p>Every in-flight inference holds one provider connection for the whole
 * streaming response. With one loop thread per run (root pool + child pool) an
 * unguarded fan-out of agents opens as many provider streams at once; the
 * provider then throttles all of them and the symptom is "many agents running,
 * every interface times out". This gate bounds that fan-out.
 *
 * <p>Slots are acquired in a fixed order — per-provider first, then global — so
 * two gates can never deadlock. All semaphores are fair, so a burst of later
 * callers cannot starve an earlier one. Waiting is sliced so a caller observes
 * its cancellation flag even while parked.
 *
 * <p>A gate with no global limit and no provider overrides is disabled and
 * {@link #acquire} returns a no-op permit.
 */
@Slf4j
public class LlmConcurrencyGate {

    /** A held provider slot. {@link #close()} is idempotent. */
    public interface Permit extends AutoCloseable {
        @Override
        void close();
    }

    /** Provider slot unavailable within the timeout. */
    public static class BusyException extends RuntimeException {
        private final String provider;

        BusyException(String provider, long timeoutMillis) {
            super("LLM provider '" + provider + "' is saturated; waited "
                    + timeoutMillis + "ms for a free slot");
            this.provider = provider;
        }

        public String getProvider() {
            return provider;
        }
    }

    private static final Permit NOOP_PERMIT = () -> { };
    /** Cancellation is checked at least this often while waiting. */
    private static final long POLL_SLICE_MILLIS = 200L;

    private final int globalLimit;
    private final Semaphore global;
    private final Map<String, Integer> providerLimits;
    private final Map<String, Semaphore> providerGates = new ConcurrentHashMap<>();

    public LlmConcurrencyGate(int globalLimit, Map<String, Integer> providerLimits) {
        this.globalLimit = Math.max(0, globalLimit);
        this.global = this.globalLimit > 0 ? new Semaphore(this.globalLimit, true) : null;
        this.providerLimits = providerLimits == null ? Collections.emptyMap() : providerLimits;
    }

    /** Whether any limit is configured (a disabled gate is a no-op). */
    public boolean isEnabled() {
        return global != null || !providerLimits.isEmpty();
    }

    /**
     * Wait for a slot for {@code provider}.
     *
     * @return the held permit, or {@code null} when {@code cancelled} became true
     *         while waiting (the caller should stop, not fail)
     * @throws BusyException       the timeout elapsed before a slot was free
     * @throws InterruptedException the waiting thread was interrupted
     */
    public Permit acquire(String provider, BooleanSupplier cancelled, long timeoutMillis)
            throws InterruptedException {
        if (!isEnabled()) {
            return NOOP_PERMIT;
        }
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(Math.max(0L, timeoutMillis));
        Semaphore providerGate = providerGate(provider);
        if (providerGate != null && !tryAcquire(providerGate, cancelled, deadline)) {
            if (isCancelled(cancelled)) {
                return null;
            }
            throw new BusyException(provider, timeoutMillis);
        }
        if (global != null && !tryAcquire(global, cancelled, deadline)) {
            if (providerGate != null) {
                providerGate.release();
            }
            if (isCancelled(cancelled)) {
                return null;
            }
            throw new BusyException(provider, timeoutMillis);
        }
        return new PermitImpl(providerGate, global);
    }

    /** Free global slots, for diagnostics and tests. */
    public int availableGlobalSlots() {
        return global == null ? Integer.MAX_VALUE : global.availablePermits();
    }

    private Semaphore providerGate(String provider) {
        if (provider == null) {
            return null;
        }
        Integer limit = providerLimits.get(provider);
        if (limit == null || limit <= 0) {
            return null;
        }
        return providerGates.computeIfAbsent(provider, key -> new Semaphore(limit, true));
    }

    private static boolean isCancelled(BooleanSupplier cancelled) {
        return cancelled != null && cancelled.getAsBoolean();
    }

    private boolean tryAcquire(Semaphore semaphore, BooleanSupplier cancelled, long deadline)
            throws InterruptedException {
        while (true) {
            // Always attempt a non-blocking acquire first: a free slot must be
            // granted even when the caller's timeout is 0 (fail-fast only when
            // the semaphore is actually exhausted).
            if (semaphore.tryAcquire()) {
                return true;
            }
            if (isCancelled(cancelled)) {
                return false;
            }
            long remaining = deadline - System.nanoTime();
            if (remaining <= 0) {
                return false;
            }
            long slice = Math.min(remaining, TimeUnit.MILLISECONDS.toNanos(POLL_SLICE_MILLIS));
            if (semaphore.tryAcquire(slice, TimeUnit.NANOSECONDS)) {
                return true;
            }
        }
    }

    private final class PermitImpl implements Permit {
        private final Semaphore providerGate;
        private final Semaphore globalGate;
        private final AtomicBoolean released = new AtomicBoolean(false);

        private PermitImpl(Semaphore providerGate, Semaphore globalGate) {
            this.providerGate = providerGate;
            this.globalGate = globalGate;
        }

        @Override
        public void close() {
            if (!released.compareAndSet(false, true)) {
                return;
            }
            // Release in reverse acquisition order (global, then provider).
            if (globalGate != null) {
                globalGate.release();
            }
            if (providerGate != null) {
                providerGate.release();
            }
        }
    }
}
