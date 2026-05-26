package com.knowledge.agent.channel;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages channels per session. Auto-cleanup on completion.
 *
 * <p>
 * Includes a scheduled cleanup task that removes channels that have been
 * idle for too long (e.g., due to a DelegateTool crash that failed to
 * call {@link #remove(String)}).
 */
@Slf4j
@Component
public class ChannelHub {

    private final Map<String, AgentChannel> channels = new ConcurrentHashMap<>();

    /** Maximum age of a channel before scheduled cleanup evicts it (ms). */
    private static final long MAX_CHANNEL_AGE_MS = 300_000L; // 5 minutes

    /** Track when each channel was created for age-based cleanup. */
    private final Map<String, Long> channelCreationTimes = new ConcurrentHashMap<>();

    /**
     * Create or get a channel for the given ID.
     */
    public AgentChannel create(String channelId) {
        channelCreationTimes.putIfAbsent(channelId, System.currentTimeMillis());
        return channels.computeIfAbsent(channelId, AgentChannel::new);
    }

    /**
     * Get an existing channel by ID.
     */
    public AgentChannel get(String channelId) {
        return channels.get(channelId);
    }

    /**
     * Remove and complete a channel.
     */
    public void remove(String channelId) {
        AgentChannel channel = channels.remove(channelId);
        channelCreationTimes.remove(channelId);
        if (channel != null) {
            channel.complete();
        }
    }

    /**
     * Get active channel count.
     */
    public int activeCount() {
        return channels.size();
    }

    /**
     * Scheduled cleanup: remove channels older than MAX_CHANNEL_AGE_MS.
     * Runs every 60 seconds. This prevents resource leaks when a
     * DelegateTool fails to clean up its channel (e.g., due to an
     * unhandled exception).
     */
    @Scheduled(fixedRate = 60_000L)
    public void cleanupStaleChannels() {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, Long> entry : channelCreationTimes.entrySet()) {
            String channelId = entry.getKey();
            long age = now - entry.getValue();
            if (age > MAX_CHANNEL_AGE_MS) {
                log.warn("Removing stale channel {} (age={}ms)", channelId, age);
                remove(channelId);
            }
        }
    }
}
