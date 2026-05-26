package com.knowledge.core.message.core.message.email;

import com.knowledge.core.message.core.message.AbstractMessage;
import com.knowledge.core.message.core.message.MessageType;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class EmailMessage extends AbstractMessage {

    private MessageType messageType = MessageType.EMAIL;

}
