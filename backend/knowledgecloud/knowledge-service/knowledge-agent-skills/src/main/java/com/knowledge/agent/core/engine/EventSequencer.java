package com.knowledge.agent.core.engine;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Per-turn monotonic sequence generator for {@link StreamEvent}s.
 *
 * <p>One instance is created per chat request. Each event sent to the client is
 * stamped via {@link #stamp(StreamEvent)} just before transport, assigning a
 * gap-free, increasing {@code seq} and a send timestamp.
 *
 * <p>The {@code seq} doubles as the SSE {@code id:} so a reconnecting client can
 * send {@code Last-Event-ID} and the server can replay everything after it
 * (used by the resumable-streaming work; harmless to clients that ignore it).
 *
 * <p>Not thread-safe across instances by design — events for a single turn are
 * emitted on a single reactive chain. The {@link AtomicLong} guards against
 * accidental concurrent stamping.
 */
public class EventSequencer {

    private final AtomicLong counter = new AtomicLong(0L);

    /**
     * Stamp the event with the next sequence number and current timestamp,
     * then return it for fluent use.
     */
    public StreamEvent stamp(StreamEvent event) {
        if (event == null) {
            return null;
        }
        event.setSeq(counter.getAndIncrement());
        event.setTs(System.currentTimeMillis());
        return event;
    }

    /** The next seq that would be assigned (for diagnostics). */
    public long peek() {
        return counter.get();
    }
}
