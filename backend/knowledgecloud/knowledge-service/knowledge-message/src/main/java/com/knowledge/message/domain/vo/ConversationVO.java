package com.knowledge.message.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * VO for conversation list display
 */
@Data
@ApiModel(description = "Conversation View Object")
public class ConversationVO {

    @ApiModelProperty(value = "Conversation ID")
    private String conversationId;

    @ApiModelProperty(value = "The other user's ID")
    private Long userId;

    @ApiModelProperty(value = "The other user's name")
    private String userName;

    @ApiModelProperty(value = "The other user's avatar URL")
    private String userAvatar;

    @ApiModelProperty(value = "Last message content")
    private String lastMessageContent;

    @ApiModelProperty(value = "Last message content type")
    private String lastMessageContentType;

    @ApiModelProperty(value = "Last message time")
    private LocalDateTime lastMessageTime;

    @ApiModelProperty(value = "Unread message count in this conversation")
    private Integer unreadCount;

    @ApiModelProperty(value = "Whether the other user is online")
    private Boolean isOnline;
}
