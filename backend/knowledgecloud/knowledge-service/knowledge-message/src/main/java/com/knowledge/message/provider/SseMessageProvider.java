package com.knowledge.message.provider;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.knowledge.core.message.core.message.MessageType;
import com.knowledge.core.message.core.message.SendMessageRequest;
import com.knowledge.core.message.core.message.SendMessageResult;
import com.knowledge.core.message.core.message.Sse.SseMessage;
import com.knowledge.message.service.SseEmitterServer;

@Service
public class SseMessageProvider implements IMessageProvider<SseMessage> {

    @Autowired
    private SseEmitterServer sseEmitterServer;

    @Override
    public SendMessageResult sendSingleMessage(SendMessageRequest<SseMessage> request) {
        sseEmitterServer.sendMessage(request.getTargetUsers().get(0).getUserId(), request.getMessage());
        return SendMessageResult.success();
    }

    @Override
    public SendMessageResult sendGroupMessages(SendMessageRequest<SseMessage> request) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'sendGroupMessages'");
    }

    @Override
    public SendMessageResult resend(List<SseMessage> messages) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'resend'");
    }

    @Override
    public boolean resend(Object message, Long userId) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'resend'");
    }

    @Override
    public MessageType getType() {
        return MessageType.SSE;
    }

}
