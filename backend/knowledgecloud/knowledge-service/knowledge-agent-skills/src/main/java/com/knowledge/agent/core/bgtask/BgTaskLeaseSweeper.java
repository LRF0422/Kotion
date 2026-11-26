package com.knowledge.agent.core.bgtask;

import com.knowledge.agent.core.config.AgentCoreProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Periodic lease/cancel sweep for background tasks.
 *
 * <p>A running task whose lease expired is marked {@code disconnected} (the
 * client is gone, but external work may still be running). A cancelling task
 * whose client never acknowledged is force-closed after the grace period.
 *
 * <p>All state transitions are conditional updates in {@link BgTaskStore}, so
 * multiple application instances can run this safely.
 */
@Slf4j
@Component
public class BgTaskLeaseSweeper {

    private final BgTaskStore store;
    private final AgentCoreProperties properties;

    public BgTaskLeaseSweeper(BgTaskStore store, AgentCoreProperties properties) {
        this.store = store;
        this.properties = properties;
    }

    @Scheduled(fixedDelayString = "${agent.bg-task.sweep-ms:10000}")
    public void sweep() {
        if (!properties.getBgTask().isEnabled()) {
            return;
        }
        try {
            BgTaskStore.SweepResult result = store.sweep(System.currentTimeMillis());
            if (result.getDisconnected() > 0 || result.getCancelled() > 0) {
                log.info("bg-task sweep: {} disconnected, {} cancelled",
                        result.getDisconnected(), result.getCancelled());
            }
        } catch (Exception e) {
            // One bad sweep must not stop the timer for the rest of the run.
            log.warn("bg-task sweep failed: {}", e.toString());
        }
    }
}