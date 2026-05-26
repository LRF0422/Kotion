package com.knowledge.message.domain;

import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.knowledge.core.tool.api.R;

import cn.hutool.json.JSONUtil;

@Slf4j
public class HeartBeatTask implements Runnable {

    private final SseEmitter sseEmitter;

    public HeartBeatTask(SseEmitter sseEmitter) {
        // 这里可以按照业务传入需要的数据
        this.sseEmitter = sseEmitter;
    }

    @Override
    @SneakyThrows
    public void run() {
        sseEmitter.send(JSONUtil.toJsonStr(R.success("ping")));
    }
}
