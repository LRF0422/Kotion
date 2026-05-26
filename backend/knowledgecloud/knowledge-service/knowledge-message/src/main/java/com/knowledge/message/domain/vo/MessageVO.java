package com.knowledge.message.domain.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.knowledge.message.domain.enums.MessageStatus;
import com.knowledge.message.domain.enums.MessageType;

@Data
public class MessageVO implements Serializable {

    private Long id;
    private String topic;
    private String tags;
    private String content;
    private String title;
    private Long receiverId;
    private String operationUrl;
    private String source;
    private MessageStatus status;
    private MessageType type;
    private String author;
    private Long authorId;
    private String authorIcon;
    private LocalDateTime createTime;
}
