package com.knowledge.agentcore.loop;

import org.junit.jupiter.api.Test;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Blocking rendezvous semantics: offer/await/cancel. */
class ResumeGateTest {

    @Test
    void awaitReturnsOfferedPayload() throws Exception {
        ResumeGate gate = new ResumeGate();
        ResumePayload payload = new ResumePayload();
        payload.setAction("continue");
        new Thread(() -> {
            try {
                Thread.sleep(50);
            } catch (InterruptedException ignored) {
            }
            gate.offer(payload);
        }).start();
        ResumePayload received = gate.await(2000);
        assertEquals("continue", received.getAction());
    }

    @Test
    void awaitTimesOutWithoutPayload() throws Exception {
        ResumeGate gate = new ResumeGate();
        long start = System.nanoTime();
        ResumePayload received = gate.await(100);
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
        assertNull(received);
        assertTrue(elapsedMs >= 90, "await should block for the poll interval");
    }

    @Test
    void cancelDeliversMarkerImmediately() throws Exception {
        ResumeGate gate = new ResumeGate();
        gate.cancel();
        ResumePayload received = gate.await(5000);
        assertEquals("cancel", received.getAction());
    }
}
