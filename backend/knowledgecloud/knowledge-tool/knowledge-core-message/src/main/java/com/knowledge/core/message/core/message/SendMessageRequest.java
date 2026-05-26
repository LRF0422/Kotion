package com.knowledge.core.message.core.message;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.knowledge.core.tool.KnowledgeUser;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@Data
@AllArgsConstructor
@NoArgsConstructor
@SuperBuilder
public class SendMessageRequest<M extends IMessage> {

    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.EXISTING_PROPERTY, property = "messageType")
    private M message;
    private List<Long> targetUserIds;
    private boolean group;
    private boolean resendOnfail;
    private Long senderId;
    private List<KnowledgeUser> targetUsers;

}