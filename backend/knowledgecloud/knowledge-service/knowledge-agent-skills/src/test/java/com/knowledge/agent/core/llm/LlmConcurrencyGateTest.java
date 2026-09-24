package com.knowledge.agent.core.llm;

import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LlmConcurrencyGateTest {

    @Test
    void disabledGateReturnsNoopPermit() throws Exception {
        LlmConcurrencyGate gate = new LlmConcurrencyGate(0, Collections.emptyMap());
        assertFalse(gate.isEnabled());

        LlmConcurrencyGate.Permit permit = gate.acquire("deepseek", null, 10);
        assertNotNull(permit);
        permit.close();
        permit.close(); // idempotent
    }

    @Test
    void boundsConcurrentPermitsAndAdmitsAfterRelease() throws Exception {
        LlmConcurrencyGate gate = new LlmConcurrencyGate(2, Collections.emptyMap());
        LlmConcurrencyGate.Permit first = gate.acquire("deepseek", null, 10);
        LlmConcurrencyGate.Permit second = gate.acquire("deepseek", null, 10);
        assertEquals(0, gate.availableGlobalSlots());

        assertThrows(LlmConcurrencyGate.BusyException.class,
                () -> gate.acquire("deepseek", null, 50));

        first.close();
        LlmConcurrencyGate.Permit third = gate.acquire("deepseek", null, 50);
        assertNotNull(third);
        second.close();
        third.close();
        assertEquals(2, gate.availableGlobalSlots());
    }

    @Test
    void perProviderLimitIsEnforcedIndependently() throws Exception {
        Map<String, Integer> limits = new HashMap<>();
        limits.put("deepseek", 1);
        LlmConcurrencyGate gate = new LlmConcurrencyGate(0, limits);

        LlmConcurrencyGate.Permit deepseek = gate.acquire("deepseek", null, 10);
        assertThrows(LlmConcurrencyGate.BusyException.class,
                () -> gate.acquire("deepseek", null, 50));

        // Another provider is not affected by deepseek's per-provider cap.
        LlmConcurrencyGate.Permit glm = gate.acquire("glm", null, 10);
        assertNotNull(glm);
        deepseek.close();
        glm.close();
    }

    @Test
    void cancelledWaiterReturnsNullInsteadOfBusy() throws Exception {
        LlmConcurrencyGate gate = new LlmConcurrencyGate(1, Collections.emptyMap());
        LlmConcurrencyGate.Permit held = gate.acquire("deepseek", null, 10);

        AtomicBoolean cancelled = new AtomicBoolean(false);
        Thread canceller = new Thread(() -> {
            try {
                Thread.sleep(100);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            cancelled.set(true);
        });
        canceller.start();

        LlmConcurrencyGate.Permit result = gate.acquire("deepseek", cancelled::get, 5_000);
        assertNull(result, "a cancelled waiter must not be handed a permit");
        canceller.join();
        held.close();
    }

    @Test
    void releasedPermitAdmitsWaitingThread() throws Exception {
        LlmConcurrencyGate gate = new LlmConcurrencyGate(1, Collections.emptyMap());
        LlmConcurrencyGate.Permit held = gate.acquire("deepseek", null, 10);

        CountDownLatch acquired = new CountDownLatch(1);
        Thread waiter = new Thread(() -> {
            try {
                LlmConcurrencyGate.Permit permit = gate.acquire("deepseek", null, 5_000);
                if (permit != null) {
                    acquired.countDown();
                    permit.close();
                }
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        });
        waiter.setDaemon(true);
        waiter.start();

        Thread.sleep(150);
        assertEquals(1L, acquired.getCount(), "waiter must block while the slot is held");
        held.close();
        assertTrue(acquired.await(2, TimeUnit.SECONDS), "waiter must be admitted after release");
        waiter.join();
    }
}
