package com.knowledge.agent.channel;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

/**
 * Per-session pub/sub channel for inter-agent communication.
 * Built on Sinks.Many — non-blocking, backpressure-aware.
 */
public class AgentChannel {

    /**
     * Bounded per-channel buffer: an unbounded buffer let one slow/disconnected
     * subscriber grow memory without limit until the 5-minute cleanup ran.
     * When the buffer is full the OLDEST buffered message is dropped — channel
     * traffic is progress reporting, not durable state.
     */
    private static final int BUFFER_SIZE = 256;

    private final String channelId;
    private final Sinks.Many<AgentMessage> sink;

    public AgentChannel(String channelId) {
        this.channelId = channelId;
        this.sink = Sinks.many().multicast().onBackpressureBuffer(BUFFER_SIZE, false);
    }

    /**
     * Post a message to the channel.
     */
    public void post(AgentMessage message) {
        sink.tryEmitNext(message);
    }

    /**
     * Subscribe to messages on this channel.
     */
    public Flux<AgentMessage> flux() {
        return sink.asFlux();
    }

    /**
     * Get the channel ID.
     */
    public String getChannelId() {
        return channelId;
    }

    /**
     * Complete the channel (no more messages).
     */
    public void complete() {
        sink.tryEmitComplete();
    }
}
