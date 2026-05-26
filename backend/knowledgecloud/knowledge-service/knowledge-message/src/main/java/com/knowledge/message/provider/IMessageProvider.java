package com.knowledge.message.provider;

import java.util.List;

import com.knowledge.core.message.core.message.IMessage;
import com.knowledge.core.message.core.message.MessageType;
import com.knowledge.core.message.core.message.SendMessageRequest;
import com.knowledge.core.message.core.message.SendMessageResult;

public interface IMessageProvider<M extends IMessage> {

    SendMessageResult sendSingleMessage(SendMessageRequest<M> request);

    SendMessageResult sendGroupMessages(SendMessageRequest<M> request);

    SendMessageResult resend(List<M> messages);

    boolean resend(Object message, Long userId);

    MessageType getType();

}
