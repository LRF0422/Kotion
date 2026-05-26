package com.knowledge.core.message.core.message;

import java.io.Serializable;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.knowledge.core.message.core.message.Sse.SseMessage;
import com.knowledge.core.message.core.message.email.EmailMessage;

import cn.hutool.json.JSONObject;

@JsonSubTypes({
        @JsonSubTypes.Type(value = EmailMessage.class, name = "EMAIL"),
        @JsonSubTypes.Type(value = SseMessage.class, name = "SSE")
})
public interface IMessage extends Serializable {

    MessageType getMessageType();

    String getBody();

    JSONObject getParams();

    String getTitle();

    String getTopic();

    String getType();

    String getDescription();

    String getUrl();

}
