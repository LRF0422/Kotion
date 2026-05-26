package com.knowledge.core.message.core.message.Sse;

import com.knowledge.core.message.core.message.AbstractMessage;
import com.knowledge.core.message.core.message.MessageType;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class SseMessage extends AbstractMessage {

    private MessageType messageType = MessageType.SSE;

}
