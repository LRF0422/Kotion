package com.knowledge.agent.core.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.event.EventSubscription;
import com.knowledge.agent.core.event.RunEvent;
import com.knowledge.agent.core.event.RunEventLog;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RunStreamerTest {

    private static final String RUN_ID = "run-1";

    @Test
    void durableReplayPagesUntilTerminalBeyondFirstPage() throws Exception {
        RunEventLog eventLog = mock(RunEventLog.class);
        EventSubscription subscription = mock(EventSubscription.class);
        CountDownLatch completed = closeLatch(subscription);
        when(eventLog.subscribe(RUN_ID)).thenReturn(subscription);
        when(eventLog.lastSeq(RUN_ID)).thenReturn(501L);
        when(eventLog.replay(RUN_ID, 0L, 500)).thenReturn(events(1, 500));
        when(eventLog.replay(RUN_ID, 500L, 500))
                .thenReturn(Collections.singletonList(event(501, "run.completed")));

        RunStreamer streamer = new RunStreamer(eventLog, new ObjectMapper());
        try {
            streamer.stream(RUN_ID, 0L);

            assertTrue(completed.await(2, TimeUnit.SECONDS), "stream should complete on terminal event");
            verify(eventLog).replay(RUN_ID, 0L, 500);
            verify(eventLog).replay(RUN_ID, 500L, 500);
            verify(subscription, never()).poll(anyLong());
        } finally {
            streamer.shutdown();
        }
    }

    @Test
    void nonContiguousDurableReplayClosesBeforeLiveTail() throws Exception {
        RunEventLog eventLog = mock(RunEventLog.class);
        EventSubscription subscription = mock(EventSubscription.class);
        CountDownLatch completed = closeLatch(subscription);
        when(eventLog.subscribe(RUN_ID)).thenReturn(subscription);
        when(eventLog.lastSeq(RUN_ID)).thenReturn(2L);
        when(eventLog.replay(RUN_ID, 0L, 500))
                .thenReturn(Collections.singletonList(event(2, "text.delta")));

        RunStreamer streamer = new RunStreamer(eventLog, new ObjectMapper());
        try {
            streamer.stream(RUN_ID, 0L);

            assertTrue(completed.await(2, TimeUnit.SECONDS),
                    "stream should close instead of emitting a durable forward gap");
            verify(subscription, never()).poll(anyLong());
        } finally {
            streamer.shutdown();
        }
    }

    @Test
    void liveSequenceGapBackfillsFromDurableLogBeforeContinuing() throws Exception {
        RunEventLog eventLog = mock(RunEventLog.class);
        EventSubscription subscription = mock(EventSubscription.class);
        CountDownLatch completed = closeLatch(subscription);
        when(eventLog.subscribe(RUN_ID)).thenReturn(subscription);
        when(eventLog.lastSeq(RUN_ID)).thenReturn(1L);
        when(eventLog.replay(RUN_ID, 0L, 500))
                .thenReturn(Collections.singletonList(event(1, "text.delta")));
        when(subscription.droppedCount()).thenReturn(0L);
        when(subscription.poll(1000L)).thenReturn(event(3, "run.completed"));
        List<RunEvent> gap = new ArrayList<>();
        gap.add(event(2, "text.delta"));
        gap.add(event(3, "run.completed"));
        when(eventLog.replay(RUN_ID, 1L, 500)).thenReturn(gap);

        RunStreamer streamer = new RunStreamer(eventLog, new ObjectMapper());
        try {
            streamer.stream(RUN_ID, 0L);

            assertTrue(completed.await(2, TimeUnit.SECONDS), "stream should complete after gap replay");
            verify(subscription).poll(1000L);
            verify(eventLog).replay(RUN_ID, 1L, 500);
        } finally {
            streamer.shutdown();
        }
    }

    @Test
    void unavailableLiveGapBackfillClosesWithoutEmittingLaterEvent() throws Exception {
        RunEventLog eventLog = mock(RunEventLog.class);
        EventSubscription subscription = mock(EventSubscription.class);
        CountDownLatch completed = closeLatch(subscription);
        when(eventLog.subscribe(RUN_ID)).thenReturn(subscription);
        when(eventLog.lastSeq(RUN_ID)).thenReturn(1L);
        when(eventLog.replay(RUN_ID, 0L, 500))
                .thenReturn(Collections.singletonList(event(1, "text.delta")));
        when(subscription.droppedCount()).thenReturn(0L);
        when(subscription.poll(1000L)).thenReturn(event(3, "text.delta")).thenReturn(null);
        when(eventLog.replay(RUN_ID, 1L, 500)).thenReturn(Collections.emptyList());

        RunStreamer streamer = new RunStreamer(eventLog, new ObjectMapper());
        try {
            streamer.stream(RUN_ID, 0L);

            assertTrue(completed.await(2, TimeUnit.SECONDS),
                    "stream should close when durable storage cannot fill a live gap");
            verify(subscription).poll(1000L);
            verify(eventLog).replay(RUN_ID, 1L, 500);
        } finally {
            streamer.shutdown();
        }
    }

    @Test
    void droppedLiveEventsTriggerDurableCatchUp() throws Exception {
        RunEventLog eventLog = mock(RunEventLog.class);
        EventSubscription subscription = mock(EventSubscription.class);
        CountDownLatch completed = closeLatch(subscription);
        when(eventLog.subscribe(RUN_ID)).thenReturn(subscription);
        when(eventLog.lastSeq(RUN_ID)).thenReturn(1L, 3L);
        when(eventLog.replay(RUN_ID, 0L, 500))
                .thenReturn(Collections.singletonList(event(1, "text.delta")));
        when(subscription.droppedCount()).thenReturn(1L);
        List<RunEvent> catchUp = new ArrayList<>();
        catchUp.add(event(2, "text.delta"));
        catchUp.add(event(3, "run.completed"));
        when(eventLog.replay(RUN_ID, 1L, 500)).thenReturn(catchUp);

        RunStreamer streamer = new RunStreamer(eventLog, new ObjectMapper());
        try {
            streamer.stream(RUN_ID, 0L);

            assertTrue(completed.await(2, TimeUnit.SECONDS), "stream should complete after dropped-event catch-up");
            verify(eventLog).replay(RUN_ID, 1L, 500);
            verify(subscription, never()).poll(anyLong());
        } finally {
            streamer.shutdown();
        }
    }

    @Test
    void controlErrorsAreNotDurableRunFailures() throws Exception {
        Map<String, Object> frame = RunStreamer.controlErrorFrame("RUN_BUSY", "busy");
        JsonNode json = new ObjectMapper().readTree(new ObjectMapper().writeValueAsString(frame));

        assertEquals(0, json.get("seq").asInt());
        assertEquals("control.error", json.get("type").asText());
        assertEquals("RUN_BUSY", json.get("code").asText());
        assertEquals("busy", json.get("error").asText());
    }

    private static CountDownLatch closeLatch(EventSubscription subscription) {
        CountDownLatch completed = new CountDownLatch(1);
        doAnswer(invocation -> {
            completed.countDown();
            return null;
        }).when(subscription).close();
        return completed;
    }

    private static List<RunEvent> events(long firstSeq, long lastSeq) {
        List<RunEvent> events = new ArrayList<>();
        for (long seq = firstSeq; seq <= lastSeq; seq++) {
            events.add(event(seq, "text.delta"));
        }
        return events;
    }

    private static RunEvent event(long seq, String type) {
        return new RunEvent(seq, type, Collections.emptyMap(), System.currentTimeMillis());
    }
}
