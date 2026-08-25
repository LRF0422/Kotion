package com.knowledge.agent.core.loop;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Blocking rendezvous between a paused loop (WAITING_TOOLS / SUSPENDED) and
 * resume requests arriving from the supervisor. Cancellation is delivered as
 * a marker payload so the loop exits its wait deterministically.
 */
public class ResumeGate {

    private static final ResumePayload CANCEL_MARKER = ResumePayload.cancelMarker();

    private final BlockingQueue<ResumePayload> queue = new LinkedBlockingQueue<>(8);

    private volatile boolean cancelled;

    /** Block until a payload arrives, the poll interval elapses, or cancel. */
    public ResumePayload await(long pollMs) throws InterruptedException {
        if (cancelled) {
            return CANCEL_MARKER;
        }
        ResumePayload payload = queue.poll(pollMs, TimeUnit.MILLISECONDS);
        if (cancelled) {
            return CANCEL_MARKER;
        }
        return payload;
    }

    /**
     * Offer a resume payload without blocking.
     *
     * @return whether the bounded queue accepted the payload
     */
    public synchronized boolean offer(ResumePayload payload) {
        if (payload == null || cancelled) {
            return false;
        }
        return queue.offer(payload);
    }

    public synchronized void cancel() {
        if (cancelled) {
            return;
        }
        cancelled = true;
        // Cancellation supersedes queued resume requests. Clearing while holding
        // the same monitor as offer guarantees space for the wake-up marker.
        queue.clear();
        queue.offer(CANCEL_MARKER);
    }

    public boolean isCancelled() {
        return cancelled;
    }
}
