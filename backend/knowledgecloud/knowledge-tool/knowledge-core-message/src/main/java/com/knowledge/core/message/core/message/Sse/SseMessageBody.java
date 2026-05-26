package com.knowledge.core.message.core.message.Sse;

import java.io.Serializable;

import lombok.Data;

@Data
public class SseMessageBody implements Serializable {

    private String content;

}
