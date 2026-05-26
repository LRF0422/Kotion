package com.knowledge.message.api.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class CreateMessageDTO implements Serializable {

    private Boolean notifyUser;
    private String author;
    private Long authorId;
    private List<CreateMessageDetail> messages;

    @Data
    public static class CreateMessageDetail implements Serializable {
        private String authorIcon;
        private String title;
        private String content;
        private String tags;
        private String topic;
        private String operationUrl;
        private Long receiverId;
        private String tenantId;

    }
}
