package com.knowledge.message.controller;

import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.message.service.SseEmitterServer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Controller
@RequestMapping("/sse")
public class SseController {

    @Autowired
    private SseEmitterServer sseEmitterServer;

    @GetMapping(value = "/connect", produces = "text/event-stream")
    public SseEmitter connect() {
        return sseEmitterServer.connect(SecurityContextUtil.getUserId());
    }

    @GetMapping("/disconnect")
    public void disconnection() {
        sseEmitterServer.disconnection(SecurityContextUtil.getUserId());
    }

}
