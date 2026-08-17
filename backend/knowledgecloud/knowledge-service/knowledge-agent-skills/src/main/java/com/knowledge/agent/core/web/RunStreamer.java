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
            boolean terminal = false;
            try {
                // 1. Durable backlog (events appended before the subscription
                //    existed are covered here).
                List<RunEvent> backlog = eventLog.replay(runId, afterSeq, REPLAY_LIMIT);
                for (RunEvent event : backlog) {
                    if (send(emitter, event)) {
                        cleanup.run();
                        return;
                    }
                    lastSentSeq = event.getSeq();
                    if (event.isTerminal()) {
                        terminal = true;
                    }
                }
                if (terminal) {
                    emitter.complete();
                    cleanup.run();
                    return;
                }
                // 2. Live tail with seq dedupe (subscription predates replay).
                while (!closed.get()) {
                    RunEvent event = subscription.poll(1000L);
                    if (event == null) {
                        continue;
                    }
                    if (event.getSeq() <= lastSentSeq) {
                        continue;
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
            Map<String, Object> frame = new java.util.LinkedHashMap<>();
            frame.put("seq", 0);
            frame.put("type", "run.failed");
            frame.put("code", code);
            frame.put("error", message);
            emitter.send(SseEmitter.event()
                    .data(objectMapper.writeValueAsString(frame), MediaType.APPLICATION_JSON));
        } catch (Exception ignored) {
            // best-effort
        }
        emitter.complete();
        return emitter;
    }

    @PreDestroy
    public void shutdown() {
        heartbeatScheduler.shutdownNow();
        streamExecutor.shutdownNow();
    }
}
