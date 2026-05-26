package com.knowledge.message.service;

import com.knowledge.core.message.core.message.Sse.SseMessage;
import com.knowledge.core.tool.api.R;
import com.knowledge.message.domain.HeartBeatTask;

import cn.hutool.json.JSONUtil;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.*;

@Service
@Slf4j
public class SseEmitterServer {

    private final Map<Long, SseEmitter> cache = new ConcurrentHashMap<>();
    private static final ScheduledExecutorService heartbeatExecutors = Executors.newScheduledThreadPool(8);

    @SneakyThrows
    public SseEmitter connect(Long userId) {
        if (cache.containsKey(userId)) {
            SseEmitter emitter = cache.remove(userId);
            try {
                emitter.send("您已被下线");
            } catch (Exception e) {
                // ignore
            } finally {
                emitter.complete();
            }
        }
        SseEmitter emitter = new SseEmitter(0L);
        final ScheduledFuture<?> future = heartbeatExecutors.scheduleAtFixedRate(new HeartBeatTask(emitter), 0, 10,
                TimeUnit.SECONDS);
        emitter.onCompletion(() -> {
            cache.remove(userId);
            future.cancel(true);
            log.info("connection complete");
        });
        emitter.onError((e) -> {
            log.error("something wrong with sseEmitter, message: {}", e.getMessage());
            cache.remove(userId);
        });
        emitter.onTimeout(() -> {
            log.info("sseEmitter timeout");
            cache.remove(userId);
        });
        cache.put(userId, emitter);
        emitter.send(JSONUtil.toJsonStr(R.success("连接成功")));
        log.info("register finished, current cache size => {}", cache.size());
        return emitter;
    }

    public void disconnection(Long userId) {
        if (cache.containsKey(userId)) {
            SseEmitter emitter = cache.remove(userId);
            emitter.complete();
        }
    }

    @SneakyThrows
    public boolean sendMessage(Long userId, SseMessage sseMessage) {
        SseEmitter sseEmitter = cache.get(userId);
        if (sseEmitter != null) {
            sseEmitter.send(JSONUtil.toJsonStr(R.data(sseMessage)));
            return true;
        }
        return false;
    }
}