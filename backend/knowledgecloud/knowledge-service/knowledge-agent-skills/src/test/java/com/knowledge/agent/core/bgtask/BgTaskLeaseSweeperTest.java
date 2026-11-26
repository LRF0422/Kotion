package com.knowledge.agent.core.bgtask;

import com.knowledge.agent.core.config.AgentCoreProperties;
import org.junit.jupiter.api.Test;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The sweep timer is gated by the rollout switch and never throws out of the job. */
class BgTaskLeaseSweeperTest {

    private final BgTaskStore store = mock(BgTaskStore.class);
    private final AgentCoreProperties properties = new AgentCoreProperties();

    @Test
    void sweepRunsWhenEnabled() {
        properties.getBgTask().setEnabled(true);
        when(store.sweep(anyLong())).thenReturn(new BgTaskStore.SweepResult(1, 2));
        BgTaskLeaseSweeper sweeper = new BgTaskLeaseSweeper(store, properties);

        sweeper.sweep();

        verify(store).sweep(anyLong());
    }

    @Test
    void sweepIsANoOpWhenDisabled() {
        properties.getBgTask().setEnabled(false);
        BgTaskLeaseSweeper sweeper = new BgTaskLeaseSweeper(store, properties);

        sweeper.sweep();

        verify(store, never()).sweep(anyLong());
    }

    @Test
    void aBrokenSweepDoesNotEscapeTheTimer() {
        properties.getBgTask().setEnabled(true);
        when(store.sweep(anyLong())).thenThrow(new RuntimeException("db down"));
        BgTaskLeaseSweeper sweeper = new BgTaskLeaseSweeper(store, properties);

        // Must swallow: one bad tick cannot cancel the scheduled task.
        sweeper.sweep();
    }
}