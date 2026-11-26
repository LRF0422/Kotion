package com.knowledge.agent.core.state;

import com.knowledge.agent.core.supervisor.DefaultRunSupervisor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Kick a reconcile pass immediately after boot.
 *
 * <p>The scheduled reconcile only looks at rows older than a cutoff, so a
 * process restart could leave the UI waiting tens of seconds before a stale
 * run is rebuilt. Doing one pass on {@link ApplicationReadyEvent} (daemon
 * thread, never blocking startup) closes that window. The reconcile itself is
 * idempotent and conditional, so running it in addition to the timer is safe.
 */
@Slf4j
@Component
public class AgentRunStartupReconciler {

    private final DefaultRunSupervisor supervisor;

    public AgentRunStartupReconciler(DefaultRunSupervisor supervisor) {
        this.supervisor = supervisor;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        Thread thread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    supervisor.reconcile();
                } catch (Exception e) {
                    // A failed boot reconcile must not take the app down; the
                    // scheduled pass will retry.
                    log.warn("agent boot reconcile failed: {}", e.toString());
                }
            }
        }, "agent-boot-reconcile");
        thread.setDaemon(true);
        thread.start();
    }
}