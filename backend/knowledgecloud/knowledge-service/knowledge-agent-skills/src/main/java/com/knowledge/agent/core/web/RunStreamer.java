package com.knowledge.agent.core.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.event.EventSubscription;
import com.knowledge.agent.core.event.RunEvent;
import com.knowledge.agent.core.event.RunEventLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import javax.annotation.PreDestroy;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * SSE transport for run events: durable replay (afterSeq) + live tail with
 * seq dedupe, keepalive comment frames and client-disconnect cleanup.
 *
 * <p>Replay/tail pattern: subscribe FIRST (so nothing is missed), then replay
 * the backlog, then drain the subscription queue skipping seqs already sent.
 */
@Slf4j
@Component
public class RunStreamer {

    private static final long KEEPALIVE_SECONDS = 15;
    private static final int REPLAY_LIMIT = 500;

    private final RunEventLog eventLog;
    private final ObjectMapper objectMapper;
    private final ScheduledExecutorService heartbeatScheduler =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "agentcore-sse-heartbeat");
                t.setDaemon(true);
                return t;
            });
    private final ExecutorService streamExecutor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "agentcore-sse-stream");
        t.setDaemon(true);
        return t;
    });

    public RunStreamer(RunEventLog eventLog, ObjectMapper objectMapper) {
        this.eventLog = eventLog;
        this.objectMapper = objectMapper;
    }

    /** Stream a run's events from afterSeq (SSE with keepalive). */
    public SseEmitter stream(String runId, long afterSeq) {
        SseEmitter emitter = new SseEmitter(0L);
        AtomicBoolean closed = new AtomicBoolean(false);

        final EventSubscription subscription = eventLog.subscribe(runId);
        final ScheduledFuture<?> heartbeat = heartbeatScheduler.scheduleAtFixedRate(() -> {
            if (closed.get()) {
                return;
            }
            try {
                emitter.send(SseEmitter.event().comment("keepalive"));
            } catch (Exception ignored) {
                // emitter closed — cleanup runs from the completion callbacks
            }
        }, KEEPALIVE_SECONDS, KEEPALIVE_SECONDS, TimeUnit.SECONDS);

        Runnable cleanup = () -> {
            if (closed.compareAndSet(false, true)) {
                heartbeat.cancel(false);
                subscription.close();
            }
        };
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());

        streamExecutor.submit(() -> {
            long lastSentSeq = afterSeq;
            long observedDropped = 0;
            try {
                // 1. Durable backlog (events appended before the subscription
                //    existed are covered here). Capture a high-water mark so a
                //    continuously-active run cannot keep replay chasing forever.
                ReplayResult replay = replayDurable(emitter, runId, lastSentSeq,
                        eventLog.lastSeq(runId));
                if (replay.disconnected) {
                    cleanup.run();
                    return;
                }
                if (replay.sequenceGap) {
                    emitter.complete();
                    cleanup.run();
                    return;
                }
                lastSentSeq = replay.lastSentSeq;
                if (replay.terminal) {
                    emitter.complete();
                    cleanup.run();
                    return;
                }

                // 2. Live tail with seq dedupe (subscription predates replay).
                while (!closed.get()) {
                    long dropped = subscription.droppedCount();
                    if (dropped > observedDropped) {
                        // A slow consumer lost queued events. They were appended
                        // durably before fan-out, so catch up to a fresh high-water
                        // mark before touching the remaining live tail.
                        replay = replayDurable(emitter, runId, lastSentSeq,
                                eventLog.lastSeq(runId));
                        observedDropped = dropped;
                        if (replay.disconnected) {
                            cleanup.run();
                            return;
                        }
                        if (replay.sequenceGap) {
                            emitter.complete();
                            cleanup.run();
                            return;
                        }
                        lastSentSeq = replay.lastSentSeq;
                        if (replay.terminal) {
                            emitter.complete();
                            cleanup.run();
                            return;
                        }
                    }

                    RunEvent event = subscription.poll(1000L);
                    if (event == null || event.getSeq() <= lastSentSeq) {
                        continue;
                    }
                    if (event.getSeq() > lastSentSeq + 1) {
                        // The subscription can drop-oldest under pressure. Always
                        // attempt durable backfill before accepting a sequence gap.
                        replay = replayDurable(emitter, runId, lastSentSeq, event.getSeq());
                        if (replay.disconnected) {
                            cleanup.run();
                            return;
                        }
                        if (replay.sequenceGap) {
                            emitter.complete();
                            cleanup.run();
                            return;
                        }
                        lastSentSeq = replay.lastSentSeq;
                        if (replay.terminal) {
                            emitter.complete();
                            cleanup.run();
                            return;
                        }
                        if (event.getSeq() <= lastSentSeq) {
                            continue;
                        }
                        // replayDurable only returns without a gap after reaching
                        // its requested high-water mark, so this is defensive.
                        if (event.getSeq() != lastSentSeq + 1) {
                            log.warn("Closing run {} stream at sequence {} before forward event {}",
                                    runId, lastSentSeq, event.getSeq());
                            emitter.complete();
                            cleanup.run();
                            return;
                        }
                    }
                    if (send(emitter, event)) {
                        cleanup.run();
                        return;
                    }
                    lastSentSeq = event.getSeq();
                    if (event.isTerminal()) {
                        emitter.complete();
                        cleanup.run();
                        return;
                    }
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                cleanup.run();
            } catch (Exception e) {
                log.warn("Run stream failed for {}: {}", runId, e.getMessage());
                cleanup.run();
            }
        });
        return emitter;
    }

    /** Replay durable events in bounded, strictly-contiguous pages. */
    private ReplayResult replayDurable(SseEmitter emitter, String runId,
                                       long afterSeq, long throughSeq) {
        long lastSentSeq = afterSeq;
        if (throughSeq <= afterSeq) {
            return new ReplayResult(lastSentSeq, false, false, false);
        }
        while (lastSentSeq < throughSeq) {
            List<RunEvent> page = eventLog.replay(runId, lastSentSeq, REPLAY_LIMIT);
            if (page == null || page.isEmpty()) {
                log.warn("Durable replay for run {} stopped at sequence {} before high-water {}",
                        runId, lastSentSeq, throughSeq);
                return new ReplayResult(lastSentSeq, false, false, true);
            }
            boolean advanced = false;
            for (RunEvent event : page) {
                if (event == null || event.getSeq() <= lastSentSeq) {
                    continue;
                }
                if (lastSentSeq >= throughSeq) {
                    return new ReplayResult(lastSentSeq, false, false, false);
                }
                long expectedSeq = lastSentSeq + 1;
                if (event.getSeq() != expectedSeq) {
                    log.warn("Durable replay for run {} expected sequence {} but found {}",
                            runId, expectedSeq, event.getSeq());
                    return new ReplayResult(lastSentSeq, false, false, true);
                }
                if (send(emitter, event)) {
                    return new ReplayResult(lastSentSeq, false, true, false);
                }
                advanced = true;
                lastSentSeq = event.getSeq();
                if (event.isTerminal()) {
                    return new ReplayResult(lastSentSeq, true, false, false);
                }
            }
            if (!advanced) {
                log.warn("Durable replay for run {} made no progress after sequence {}",
                        runId, lastSentSeq);
                return new ReplayResult(lastSentSeq, false, false, true);
            }
        }
        return new ReplayResult(lastSentSeq, false, false, false);
    }

    private static final class ReplayResult {
        private final long lastSentSeq;
        private final boolean terminal;
        private final boolean disconnected;
        private final boolean sequenceGap;

        private ReplayResult(long lastSentSeq, boolean terminal,
                             boolean disconnected, boolean sequenceGap) {
            this.lastSentSeq = lastSentSeq;
            this.terminal = terminal;
            this.disconnected = disconnected;
            this.sequenceGap = sequenceGap;
        }
    }

    /** Send one event as an SSE frame; returns true when the client is gone. */
    private boolean send(SseEmitter emitter, RunEvent event) {
        try {
            Map<String, Object> frame = new java.util.LinkedHashMap<>();
            frame.put("seq", event.getSeq());
            frame.put("type", event.getType());
            if (event.getPayload() != null) {
                frame.putAll(event.getPayload());
            }
            emitter.send(SseEmitter.event()
                    .data(objectMapper.writeValueAsString(frame), MediaType.APPLICATION_JSON));
            return false;
        } catch (Exception e) {
            return true;
        }
    }

    /** Single error frame then close (forbidden/not-found/busy paths). */
    public SseEmitter error(String code, String message) {
        SseEmitter emitter = new SseEmitter(0L);
        try {
            Map<String, Object> frame = controlErrorFrame(code, message);
            emitter.send(SseEmitter.event()
                    .data(objectMapper.writeValueAsString(frame), MediaType.APPLICATION_JSON));
        } catch (Exception ignored) {
            // best-effort
        }
        emitter.complete();
        return emitter;
    }

    static Map<String, Object> controlErrorFrame(String code, String message) {
        Map<String, Object> frame = new java.util.LinkedHashMap<>();
        frame.put("seq", 0);
        frame.put("type", "control.error");
        frame.put("code", code);
        frame.put("error", message);
        return frame;
    }

    @PreDestroy
    public void shutdown() {
        heartbeatScheduler.shutdownNow();
        streamExecutor.shutdownNow();
    }
}
