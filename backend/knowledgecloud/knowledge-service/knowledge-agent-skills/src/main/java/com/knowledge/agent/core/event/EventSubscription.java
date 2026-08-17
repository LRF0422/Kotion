package com.knowledge.agentcore.event;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * One live subscriber on a run's event tail. Events are delivered through a
 * bounded blocking queue (drop-oldest when a slow consumer falls behind); the
 * SSE transport polls with a timeout so heartbeats can interleave.
 */
public class EventSubscription implements AutoCloseable {

    static final int QUEUE_CAPACITY = 4096;

    private final String runId;

    private final BlockingQueue<RunEvent> queue = new LinkedBlockingQueue<>(QUEUE_CAPACITY);

    private final AtomicLong dropped = new AtomicLong();

    private volatile boolean closed;

    EventSubscription(String runId) {
        this.runId = runId;
    }

    public String getRunId() {
        return runId;
    }

    /** Called by the event log on the producer side. Never blocks. */
    void offer(RunEvent event) {
        if (closed) {
            return;
        }
        if (!queue.offer(event)) {
            // Slow consumer: drop the oldest event to make room, keep the tail.
            queue.poll();
            dropped.incrementAndGet();
            queue.offer(event);
        }
    }

    /**
     * Blocking poll; returns {@code null} on timeout or after close.
     */
    public RunEvent poll(long timeoutMs) throws InterruptedException {
        if (closed) {
            return null;
        }
        return queue.poll(timeoutMs, TimeUnit.MILLISECONDS);
    }

    public long droppedCount() {
        return dropped.get();
    }

    @Override
    public void close() {
        closed = true;
        queue.clear();
    }
}
